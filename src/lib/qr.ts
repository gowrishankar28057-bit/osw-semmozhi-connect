import { createHash, createHmac, randomUUID } from "node:crypto";
import { SignJWT, jwtVerify, errors } from "jose";
import { AppError, assert } from "./errors";
import { secret, type Actor } from "./auth";
import {
  transaction,
  owner,
  member,
  audit,
  notifyRegistered,
  isDemo,
  meetingPath,
  type Tx,
} from "./workshops";
import type {
  AttendanceChallenge,
  Workshop,
  WorkshopSession,
} from "@prisma/client";
import { db } from "./db";
import { appUrl } from "./config";
import { hasActivePresence } from "./presence";
export const QR_LIFETIME_MS = 120_000;
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const nonce = (id: string) =>
  createHmac("sha256", secret("QR_SIGNING_SECRET"))
    .update(`nonce:${id}`)
    .digest("base64url");
const key = () => new TextEncoder().encode(secret("QR_SIGNING_SECRET"));
async function rotate(tx: Tx, session: WorkshopSession, now: Date) {
  let current = session.currentChallengeId
    ? await tx.attendanceChallenge.findUnique({
        where: { id: session.currentChallengeId },
      })
    : null;
  if (!current || !current.active || current.expiresAt <= now) {
    const id = randomUUID();
    const createdAt = now;
    // Deactivating every earlier challenge is what makes an old QR fail.
    await tx.attendanceChallenge.updateMany({
      where: { sessionId: session.id, active: true },
      data: { active: false },
    });
    current = await tx.attendanceChallenge.create({
      data: {
        id,
        sessionId: session.id,
        nonceHash: hash(nonce(id)),
        createdAt,
        expiresAt: new Date(createdAt.getTime() + QR_LIFETIME_MS),
      },
    });
    await tx.workshopSession.update({
      where: { id: session.id },
      data: { currentChallengeId: id },
    });
  }
  return current;
}
async function tokenFor(c: AttendanceChallenge) {
  return new SignJWT({
    sessionId: c.sessionId,
    challengeId: c.id,
    nonce: nonce(c.id),
    issuedAt: c.createdAt.getTime(),
    expiresAt: c.expiresAt.getTime(),
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("osw-attendance")
    .setAudience("osw-participant")
    .setIssuedAt(Math.floor(c.createdAt.getTime() / 1000))
    .setExpirationTime(Math.ceil(c.expiresAt.getTime() / 1000))
    .sign(key());
}
const isOpen = (s: WorkshopSession) =>
  Boolean(s.attendanceVerificationOpenedAt && !s.attendanceVerificationClosedAt);
/** The midpoint check fires once, and only if verification was never opened. */
const autoOpenDue = (s: WorkshopSession, now: Date) =>
  !s.autoOpened && !s.attendanceVerificationOpenedAt && now >= s.autoCheckAt;
async function openWindow(
  tx: Tx,
  w: Workshop,
  s: WorkshopSession,
  actorId: string | null,
  automatic: boolean,
) {
  const session = await tx.workshopSession.update({
    where: { id: s.id },
    data: {
      attendanceVerificationOpenedAt: new Date(),
      attendanceVerificationClosedAt: null,
      // Any explicit open consumes the automatic midpoint check.
      autoOpened: true,
    },
  });
  await notifyRegistered(
    tx,
    w,
    "Attendance verification is now open",
    "ATTENDANCE_OPEN",
    meetingPath(w.id),
  );
  await audit(
    tx,
    actorId,
    automatic
      ? "Attendance verification opened automatically"
      : "Attendance verification opened",
    w.title,
    w.demo,
  );
  return session;
}
/** Opens verification at the planned midpoint. Idempotent under the row lock. */
export async function autoOpenIfDue(id: string, now = new Date()) {
  const s = await db.workshopSession.findUnique({ where: { workshopId: id } });
  if (!s || s.actualEndedAt || !autoOpenDue(s, now)) return false;
  return transaction(id, async (tx, w) => {
    const fresh = await tx.workshopSession.findUnique({
      where: { workshopId: id },
    });
    if (w.status !== "ONGOING" || !fresh || !autoOpenDue(fresh, new Date()))
      return false;
    await openWindow(tx, w, fresh, null, true);
    return true;
  });
}
type WindowState = {
  open: boolean;
  expiresAt: Date | null;
  url: string | null;
  serverNow: Date;
};
export async function attendanceWindow(
  id: string,
  actor: Actor,
  action: "read" | "open" | "close" | "demo" = "read",
): Promise<WindowState> {
  if (action === "read") {
    const w = await db.workshop.findUnique({
      where: { id },
      include: { session: true },
    });
    assert(w, 404, "Workshop not found.");
    await member(db, w, actor);
    if (w.organizerId !== actor.id) {
      // Participants never receive the token, so their polls stay lock-free
      // and do not rotate challenges.
      if (w.status === "ONGOING" && (await autoOpenIfDue(id)))
        return attendanceWindow(id, actor, "read");
      return {
        open: w.status === "ONGOING" && Boolean(w.session && isOpen(w.session)),
        expiresAt: null,
        url: null,
        serverNow: new Date(),
      };
    }
  }
  return transaction(id, async (tx, w) => {
    if (action !== "read") owner(w, actor);
    let s = await tx.workshopSession.findUnique({ where: { workshopId: id } });
    if (!s || w.status !== "ONGOING") {
      assert(
        action === "read",
        409,
        "Attendance verification is only available during an ongoing workshop.",
      );
      return { open: false, expiresAt: null, url: null, serverNow: new Date() };
    }
    const now = new Date();
    if (action === "demo")
      assert(isDemo(), 404, "Demo controls are unavailable.");
    if (action === "close") {
      await tx.attendanceChallenge.updateMany({
        where: { sessionId: s.id },
        data: { active: false },
      });
      await tx.workshopSession.update({
        where: { id: s.id },
        data: {
          attendanceVerificationClosedAt: now,
          currentChallengeId: null,
          autoOpened: true,
        },
      });
      await audit(tx, actor.id, "Attendance verification closed", w.title, w.demo);
      return { open: false, expiresAt: null, url: null, serverNow: now };
    }
    // "demo" is the same real verification window, just triggered on demand.
    if ((action === "open" || action === "demo") && !isOpen(s))
      s = await openWindow(tx, w, s, actor.id, false);
    if (autoOpenDue(s, now)) s = await openWindow(tx, w, s, null, true);
    if (!isOpen(s))
      return { open: false, expiresAt: null, url: null, serverNow: now };
    const challenge = await rotate(tx, s, now);
    return {
      open: true,
      expiresAt: challenge.expiresAt,
      url: `${appUrl()}/attendance/verify?t=${await tokenFor(challenge)}`,
      serverNow: now,
    };
  });
}
const expired = () =>
  new AppError(
    400,
    "Attendance code expired. Please scan the latest QR displayed by the Organizer.",
    "QR_EXPIRED",
  );
export async function verifyAttendance(token: string, actor: Actor) {
  assert(
    actor.role === "PARTICIPANT",
    403,
    "Only a participant can verify attendance.",
  );
  let payload;
  try {
    ({ payload } = await jwtVerify(token, key(), {
      algorithms: ["HS256"],
      issuer: "osw-attendance",
      audience: "osw-participant",
    }));
  } catch (e) {
    if (e instanceof errors.JWTExpired) throw expired();
    throw new AppError(400, "Invalid attendance code.", "QR_INVALID");
  }
  const { sessionId, challengeId, nonce: rawNonce, issuedAt, expiresAt } =
    payload;
  assert(
    typeof sessionId === "string" &&
      typeof challengeId === "string" &&
      typeof rawNonce === "string" &&
      typeof issuedAt === "number" &&
      typeof expiresAt === "number",
    400,
    "Invalid attendance code.",
    "QR_INVALID",
  );
  const s = await db.workshopSession.findUnique({ where: { id: sessionId } });
  assert(s, 400, "Invalid attendance code.", "QR_INVALID");
  return transaction(s.workshopId, async (tx, w) => {
    const session = await tx.workshopSession.findUniqueOrThrow({
      where: { id: sessionId },
    });
    const now = new Date();
    // 1. Registered, confirmed participant of this workshop.
    await member(tx, w, actor);
    // 2. Not already verified: any rescan, even of an old code, says so.
    const where = {
      sessionId_participantId: { sessionId, participantId: actor.id },
    };
    const existing = await tx.attendanceRecord.findUnique({ where });
    assert(
      !existing?.qrVerified,
      409,
      "Attendance already verified.",
      "QR_ALREADY_VERIFIED",
    );
    // 3. The current, active, unexpired challenge of this session, with a
    //    matching nonce and timestamps. A rotated (old) code fails here.
    const c = await tx.attendanceChallenge.findUnique({
      where: { id: challengeId },
    });
    if (
      !c ||
      c.sessionId !== sessionId ||
      !c.active ||
      c.id !== session.currentChallengeId ||
      c.expiresAt <= now ||
      hash(rawNonce) !== c.nonceHash ||
      payload.exp !== Math.ceil(c.expiresAt.getTime() / 1000) ||
      expiresAt !== c.expiresAt.getTime() ||
      issuedAt !== c.createdAt.getTime()
    )
      throw expired();
    // 4. Workshop live and verification window open.
    assert(
      w.status === "ONGOING" && !session.actualEndedAt && isOpen(session),
      409,
      "Attendance verification is closed.",
      "VERIFICATION_CLOSED",
    );
    // 5. Actually in the meeting right now (server-observed presence).
    assert(
      await hasActivePresence(tx, sessionId, actor.id, now),
      409,
      "You are not connected to the live meeting. Join the workshop meeting on your device, then scan the current QR again.",
      "PRESENCE_REQUIRED",
    );
    await tx.attendanceRecord.upsert({
      where,
      create: {
        sessionId,
        participantId: actor.id,
        qrVerified: true,
        verifiedAt: now,
      },
      update: { qrVerified: true, verifiedAt: now },
    });
    await audit(
      tx,
      actor.id,
      "Participant attendance verified",
      `${actor.name}: ${w.title}`,
      w.demo,
    );
    return {
      workshop: w.title,
      workshopId: w.id,
      participant: actor.name,
      verifiedAt: now,
    };
  });
}
