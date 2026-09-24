import { SignJWT } from "jose";
import { transaction, member } from "./workshops";
import { AppError, assert } from "./errors";
import { type Actor } from "./auth";
import { db } from "./db";
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
  );
  let jwt: string | undefined;
  if (process.env.JITSI_APP_SECRET && process.env.JITSI_APP_ID)
    jwt = await new SignJWT({
      context: {
        user: {
          id: actor.id,
          name: actor.name,
          moderator: w.organizerId === actor.id,
        },
      },
      room: w.meetingRoom,
      sub: process.env.JITSI_DOMAIN,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(process.env.JITSI_APP_ID)
      .setAudience("jitsi")
      .setIssuedAt()
      .setExpirationTime("2h")
      .sign(new TextEncoder().encode(process.env.JITSI_APP_SECRET));
  return {
    room: w.meetingRoom,
    domain: process.env.JITSI_DOMAIN || "meet.jit.si",
    jwt,
    displayName: actor.name,
    sessionId: w.session.id,
    presenceMode: process.env.PRESENCE_MODE || "webhook",
  };
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
  if (source === "browser" && process.env.PRESENCE_MODE !== "browser")
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
          now.getTime() - current.lastSeenAt.getTime() < 30_000)
      )
        return finish();
      if (current) {
        await tx.meetingPresence.update({
          where: { id: current.id },
          data: { leftAt: new Date(current.lastSeenAt.getTime() + 15_000) },
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
        now.getTime() - current.lastSeenAt.getTime() > 30_000
      ) {
        await tx.meetingPresence.update({
          where: { id: current.id },
          data: { leftAt: new Date(current.lastSeenAt.getTime() + 15_000) },
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
