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
  type Tx,
} from "./workshops";
import type {
  AttendanceChallenge,
  Workshop,
  WorkshopSession,
} from "@prisma/client";
import { db } from "./db";
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
        expiresAt: new Date(createdAt.getTime() + 120_000),
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
async function openWindow(
  tx: Tx,
  w: Workshop,
  s: WorkshopSession,
  actorId: string,
  automatic: boolean,
) {
  const session = await tx.workshopSession.update({
    where: { id: s.id },
    data: {
      attendanceVerificationOpenedAt: new Date(),
      attendanceVerificationClosedAt: null,
      autoOpened: automatic || s.autoOpened,
    },
  });
  await notifyRegistered(tx, w, "Attendance verification is now open");
  await audit(tx, actorId, "Attendance verification opened", w.title, w.demo);
  return session;
}
export async function attendanceWindow(
  id: string,
  actor: Actor,
  action: "read" | "open" | "close" | "demo" = "read",
) {
  return transaction(id, async (tx, w) => {
    if (action !== "read") owner(w, actor);
    else await member(tx, w, actor);
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
      return { open: false, expiresAt: null, url: null, serverNow: now };
    }
    if (
      (action === "open" || action === "demo") &&
      (!s.attendanceVerificationOpenedAt || s.attendanceVerificationClosedAt)
    )
      s = await openWindow(tx, w, s, actor.id, false);
    if (!s.autoOpened && now >= s.autoCheckAt)
      s = await openWindow(tx, w, s, actor.id, true);
    if (!s.attendanceVerificationOpenedAt || s.attendanceVerificationClosedAt)
      return { open: false, expiresAt: null, url: null, serverNow: now };
    const challenge = await rotate(tx, s, now);
    const url =
      w.organizerId === actor.id
        ? `${process.env.NEXT_PUBLIC_APP_URL}/attendance/verify?t=${await tokenFor(challenge)}`
        : null;
    return { open: true, expiresAt: challenge.expiresAt, url, serverNow: now };
  });
}
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
    throw new AppError(
      400,
      e instanceof errors.JWTExpired
        ? "Attendance code expired. Please scan the latest QR displayed by the Organizer."
        : "Invalid attendance code.",
      e instanceof errors.JWTExpired ? "QR_EXPIRED" : "QR_INVALID",
    );
  }
  assert(
    typeof payload.sessionId === "string" &&
      typeof payload.challengeId === "string" &&
      typeof payload.nonce === "string",
    400,
    "Invalid attendance code.",
  );
  const sessionId = payload.sessionId,
    challengeId = payload.challengeId,
    rawNonce = payload.nonce;
  const s = await db.workshopSession.findUnique({ where: { id: sessionId } });
  assert(s, 400, "Invalid workshop session.");
  return transaction(s.workshopId, async (tx, w) => {
    const session = await tx.workshopSession.findUniqueOrThrow({
      where: { id: sessionId },
    });
    const c = await tx.attendanceChallenge.findUnique({
      where: { id: challengeId },
    });
    const now = new Date();
    assert(
      c &&
        c.sessionId === sessionId &&
        c.active &&
        c.id === session.currentChallengeId &&
        c.expiresAt > now &&
        hash(rawNonce) === c.nonceHash &&
        payload.exp === Math.ceil(c.expiresAt.getTime() / 1000) &&
        payload.expiresAt === c.expiresAt.getTime() &&
        payload.issuedAt === c.createdAt.getTime(),
      400,
      "Attendance code expired. Please scan the latest QR displayed by the Organizer.",
      "QR_EXPIRED",
    );
    assert(
      w.status === "ONGOING" &&
        !session.actualEndedAt &&
        session.attendanceVerificationOpenedAt &&
        !session.attendanceVerificationClosedAt,
      409,
      "Attendance verification is closed.",
    );
    await member(tx, w, actor);
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
    return { workshop: w.title, participant: actor.name, verifiedAt: now };
  });
}
