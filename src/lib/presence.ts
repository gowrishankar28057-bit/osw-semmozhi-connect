import { SignJWT } from "jose";
import { transaction, member, type Tx } from "./workshops";
import { AppError, assert } from "./errors";
import { publicUser, type Actor } from "./auth";
import { db } from "./db";
import { jitsiProvider, presenceMode } from "./config";
import { jaasConfig, jaasToken, parseJaasPresence } from "./jaas";
import {
  HEARTBEAT_GRACE_MS,
  isActiveSegment,
  STALE_AFTER_MS,
} from "./attendance-math";
export async function meetingConfig(id: string, actor: Actor) {
  const w = await db.workshop.findUnique({
    where: { id },
    include: { session: true },
  });
  assert(w, 404, "Workshop not found.");
  await member(db, w, actor);
  assert(
    actor.role !== "ADMIN",
    403,
    "Only the organizer and registered participants may join.",
  );
  assert(
    w.status === "ONGOING" && w.session,
    409,
    "The meeting is not active.",
    "MEETING_NOT_ACTIVE",
  );
  const moderator = w.organizerId === actor.id;
  const provider = jitsiProvider();
  let roomName = w.meetingRoom;
  let jwt: string | undefined;
  const jaas = provider.provider === "jaas" ? jaasConfig() : null;
  if (jaas) {
    roomName = `${jaas.appId}/${w.meetingRoom}`;
    jwt = await jaasToken(jaas, {
      room: w.meetingRoom,
      userId: actor.id,
      name: actor.name,
      moderator,
    });
  } else if (provider.provider === "self-hosted")
    jwt = await new SignJWT({
      context: { user: { id: actor.id, name: actor.name, moderator } },
      room: w.meetingRoom,
      sub: provider.domain,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(process.env.JITSI_APP_ID!)
      .setAudience("jitsi")
      .setIssuedAt()
      .setExpirationTime("2h")
      .sign(new TextEncoder().encode(process.env.JITSI_APP_SECRET));
  return {
    provider: provider.provider,
    domain: provider.domain,
    scriptUrl: provider.scriptUrl,
    room: roomName,
    jwt,
    displayName: actor.name,
    moderator,
    sessionId: w.session.id,
    presenceMode: presenceMode(),
  };
}
/** Does the server currently see this participant connected to the meeting? */
export async function hasActivePresence(
  client: Tx,
  sessionId: string,
  participantId: string,
  now = new Date(),
) {
  const open = await client.meetingPresence.findMany({
    where: { sessionId, participantId, leftAt: null },
  });
  return open.some((s) => isActiveSegment(s, now));
}
/**
 * Applies a signed JaaS PARTICIPANT_JOINED/LEFT webhook as trusted presence.
 * Events that cannot apply (organizer, unknown room/user, workshop not live)
 * are acknowledged and ignored so the provider does not retry forever.
 */
export async function recordJaasEvent(event: unknown) {
  const appId = process.env.JAAS_APP_ID?.trim();
  assert(appId, 503, "JaaS is not configured.");
  const e = parseJaasPresence(event, appId);
  if (!e) return { ignored: true };
  const [w, user] = await Promise.all([
    db.workshop.findUnique({
      where: { meetingRoom: e.room },
      select: { id: true },
    }),
    db.user.findUnique({ where: { id: e.userId }, select: publicUser }),
  ]);
  if (!w || !user?.enabled || user.role !== "PARTICIPANT")
    return { ignored: true };
  try {
    return await recordPresence(
      w.id,
      user,
      e.action,
      e.connectionId,
      "webhook",
      e.eventId,
    );
  } catch (error) {
    if (error instanceof AppError && error.status < 500)
      return { ignored: true, reason: error.code };
    throw error;
  }
}
export async function recordPresence(
  id: string,
  actor: Actor,
  action: "join" | "heartbeat" | "leave",
  connectionId: string,
  source: "browser" | "webhook" = "browser",
  eventId?: string,
) {
  assert(actor.role === "PARTICIPANT", 403, "Participant attendance only.");
  if (source === "browser" && presenceMode() !== "browser")
    return { success: true, trackedBy: "server" };
  const result = await transaction(id, async (tx, w) => {
    // Serialize deduplication with the presence write. A failed transaction
    // leaves no receipt, so the bridge can retry the same event safely.
    const receiptKey =
      source === "webhook" && eventId ? `webhook:${id}:${eventId}` : undefined;
    if (
      receiptKey &&
      (await tx.authThrottle.findUnique({ where: { key: receiptKey } }))
    )
      return { success: true, duplicate: true };
    await member(tx, w, actor);
    assert(w.status === "ONGOING", 409, "The workshop is not ongoing.");
    const s = await tx.workshopSession.findUniqueOrThrow({
      where: { workshopId: id },
    });
    const now = new Date();
    const previous = await tx.meetingPresence.findFirst({
      where: {
        sessionId: s.id,
        participantId: actor.id,
        connectionId,
        source,
      },
      orderBy: { joinedAt: "desc" },
    });
    const current = previous?.leftAt === null ? previous : undefined;
    const finish = async () => {
      if (receiptKey)
        await tx.authThrottle.create({
          data: { key: receiptKey, attempts: 1 },
        });
      return { success: true };
    };
    if (previous?.leftAt) {
      if (source === "browser" && action !== "leave")
        return { success: false, expired: true };
      return finish();
    }
    if (action === "join") {
      if (
        current &&
        (source === "webhook" ||
          now.getTime() - current.lastSeenAt.getTime() < STALE_AFTER_MS)
      )
        return finish();
      if (current) {
        await tx.meetingPresence.update({
          where: { id: current.id },
          data: {
            leftAt: new Date(current.lastSeenAt.getTime() + HEARTBEAT_GRACE_MS),
          },
        });
        return { success: false, expired: true };
      }
      await tx.meetingPresence.create({
        data: {
          sessionId: s.id,
          participantId: actor.id,
          connectionId,
          joinedAt: now,
          lastSeenAt: now,
          source,
        },
      });
    } else if (current) {
      if (
        source === "browser" &&
        now.getTime() - current.lastSeenAt.getTime() > STALE_AFTER_MS
      ) {
        await tx.meetingPresence.update({
          where: { id: current.id },
          data: {
            leftAt: new Date(current.lastSeenAt.getTime() + HEARTBEAT_GRACE_MS),
          },
        });
        if (action === "heartbeat") return { success: false, expired: true };
      } else
        await tx.meetingPresence.update({
          where: { id: current.id },
          data:
            action === "leave"
              ? { leftAt: now, lastSeenAt: now }
              : { lastSeenAt: now },
        });
    } else if (action === "leave") {
      // A leave may arrive before its join. Remember it as a zero-length
      // segment so a delayed join cannot reopen an abandoned connection.
      await tx.meetingPresence.create({
        data: {
          sessionId: s.id,
          participantId: actor.id,
          connectionId,
          joinedAt: now,
          lastSeenAt: now,
          leftAt: now,
          source,
        },
      });
    } else
      assert(
        action !== "heartbeat",
        409,
        "Join the meeting before reporting presence.",
        "PRESENCE_MISSING",
      );
    return finish();
  });
  // Throw after commit so closing a stale segment is not rolled back.
  if ("expired" in result)
    throw new AppError(
      409,
      "Attendance connection expired. Reconnecting attendance…",
      "PRESENCE_EXPIRED",
    );
  return result;
}
