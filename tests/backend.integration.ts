import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { SignJWT, decodeJwt } from "jose";
import type { Role, WorkshopStatus } from "@prisma/client";
import { db } from "../src/lib/db";
import { AppError } from "../src/lib/errors";
import { publicUser } from "../src/lib/auth";
import {
  changeState,
  finalizeAttendance,
  register,
  transaction,
} from "../src/lib/workshops";
import { attendanceWindow, verifyAttendance } from "../src/lib/qr";
import { recordJaasEvent, recordPresence } from "../src/lib/presence";
import { liveState } from "../src/lib/live";

// Real PostgreSQL, real server functions, controlled timestamps. No HTTP.
assert(process.env.DEMO_MODE === "true", "Use a local demo database only.");
assert(
  ["localhost", "127.0.0.1"].includes(
    new URL(process.env.DATABASE_URL!).hostname,
  ),
  "This suite is local-only.",
);
process.env.PRESENCE_MODE = "browser";
const JAAS_APP = "vpaas-magic-cookie-osw-backend-qa";
process.env.JAAS_APP_ID = JAAS_APP;
process.env.JAAS_WEBHOOK_SECRET = "backend-qa-webhook-secret";

const tag = `backend-qa-${randomUUID()}`;
const users: string[] = [];
const workshops: string[] = [];
let checks = 0;
function check(condition: unknown, message: string): asserts condition {
  assert(condition, message);
  checks++;
}
async function rejects(
  promise: Promise<unknown>,
  status: number,
  code: string | undefined,
  message: string,
) {
  await assert.rejects(
    promise,
    (e: unknown) =>
      e instanceof AppError &&
      e.status === status &&
      (code === undefined || e.code === code),
    message,
  );
  checks++;
}
async function user(role: Role, suffix: string) {
  const u = await db.user.create({
    data: {
      name: `${tag} ${suffix}`,
      email: `${tag}-${suffix}@example.test`,
      passwordHash: "unused-test-fixture",
      role,
      demo: true,
    },
    select: publicUser,
  });
  users.push(u.id);
  return u;
}
async function workshop(organizerId: string, status: WorkshopStatus) {
  const w = await db.workshop.create({
    data: {
      title: `${tag} workshop ${workshops.length + 1}`,
      description: tag,
      speaker: "QA Speaker",
      organizerId,
      meetingRoom: `osw-${randomUUID().replaceAll("-", "")}`,
      scheduledStart: new Date(),
      scheduledEnd: new Date(Date.now() + 3_600_000),
      registrationDeadline: new Date(Date.now() + 3_600_000),
      status,
      demo: true,
    },
  });
  workshops.push(w.id);
  return w;
}
const confirm = (workshopId: string, participantId: string) =>
  db.registration.create({ data: { workshopId, participantId } });
const tokenOf = (url: string | null) => {
  assert(url, "organizer must receive a QR URL");
  return new URL(url).searchParams.get("t")!;
};

try {
  const org = await user("ORGANIZER", "org");

  // 1. Exact eligibility boundary at finalization, with fixed timestamps.
  const [exact, below, qrOnly, presenceOnly, cancelled] = await Promise.all(
    ["exact", "below", "qr-only", "presence-only", "cancelled"].map((s) =>
      user("PARTICIPANT", s),
    ),
  );
  const w1 = await workshop(org.id, "ONGOING");
  for (const p of [exact, below, qrOnly, presenceOnly, cancelled])
    await confirm(w1.id, p.id);
  await db.registration.update({
    where: {
      workshopId_participantId: { workshopId: w1.id, participantId: cancelled.id },
    },
    data: { status: "CANCELLED" },
  });
  const T0 = Date.now() - 200_000;
  const session = await db.workshopSession.create({
    data: {
      workshopId: w1.id,
      actualStartedAt: new Date(T0),
      autoCheckAt: new Date(T0 + 1_800_000),
    },
  });
  const segment = (participantId: string, from: number, to: number) => ({
    sessionId: session.id,
    participantId,
    connectionId: randomUUID(),
    joinedAt: new Date(T0 + from),
    leftAt: new Date(T0 + to),
    lastSeenAt: new Date(T0 + to),
    source: "browser",
  });
  await db.meetingPresence.createMany({
    data: [
      // 60 s, reconnect gap of 10 s, 30 s: exactly 90 of 100 seconds.
      segment(exact.id, 0, 60_000),
      segment(exact.id, 70_000, 100_000),
      segment(below.id, 10, 90_000), // 89.99%
      segment(qrOnly.id, 0, 10_000),
      segment(presenceOnly.id, 0, 100_000),
      segment(cancelled.id, 0, 100_000),
    ],
  });
  await db.attendanceRecord.createMany({
    data: [exact, below, qrOnly, cancelled].map((p) => ({
      sessionId: session.id,
      participantId: p.id,
      qrVerified: true,
      verifiedAt: new Date(T0 + 50_000),
    })),
  });
  const result = await transaction(w1.id, (tx, w) =>
    finalizeAttendance(tx, w, session, new Date(T0 + 100_000), org.id),
  );
  check(result.issued === 1, "only the exact-90% participant qualifies");
  const records = await db.attendanceRecord.findMany({
    where: { sessionId: session.id },
  });
  const record = (id: string) => records.find((r) => r.participantId === id);
  check(
    record(exact.id)?.attendancePercentage === 90 && record(exact.id)?.eligible,
    "90.00% is eligible",
  );
  check(
    Math.abs(record(below.id)!.attendancePercentage - 89.99) < 1e-9 &&
      !record(below.id)!.eligible,
    "89.99% is not eligible",
  );
  check(!record(qrOnly.id)!.eligible, "QR without presence is not eligible");
  check(
    record(presenceOnly.id)!.attendancePercentage === 100 &&
      !record(presenceOnly.id)!.eligible,
    "presence without QR is not eligible",
  );
  check(!record(cancelled.id)!.eligible, "cancelled registration is ignored");
  const certs = await db.certificate.findMany({ where: { workshopId: w1.id } });
  check(
    certs.length === 1 &&
      certs[0].participantId === exact.id &&
      certs[0].attendancePercentage === 90,
    "one certificate, for the exact-90% participant",
  );
  check(
    (await db.notification.count({
      where: { userId: exact.id, kind: "CERTIFICATE" },
    })) === 1,
    "certificate notification is typed",
  );

  // 2. QR verification rules through the real functions.
  const [alice, bob, carol, eve] = await Promise.all(
    ["alice", "bob", "carol", "eve"].map((s) => user("PARTICIPANT", s)),
  );
  const w2 = await workshop(org.id, "PUBLISHED");
  for (const p of [alice, bob, carol]) await confirm(w2.id, p.id);
  await changeState(w2.id, org, "start");
  check(
    (await db.notification.findFirst({
      where: { userId: alice.id, kind: "WORKSHOP_STARTED" },
    }))?.href === `/workshop/${w2.id}/meeting`,
    "start notification opens the meeting page",
  );
  const participantView = await attendanceWindow(w2.id, alice, "read");
  check(
    !participantView.open && participantView.url === null,
    "participants never receive a QR token",
  );
  const opened = await attendanceWindow(w2.id, org, "open");
  check(opened.open, "organizer opens verification");
  const token1 = tokenOf(opened.url);
  const claims = decodeJwt(token1);
  check(
    ["sessionId", "challengeId", "nonce", "issuedAt", "expiresAt"].every(
      (k) => k in claims,
    ) && (claims.expiresAt as number) - (claims.issuedAt as number) === 120_000,
    "token carries sessionId, challengeId, nonce, issuedAt, expiresAt (120 s)",
  );
  check(
    (await attendanceWindow(w2.id, alice, "read")).open,
    "participants see verification is open",
  );
  await rejects(verifyAttendance(token1, eve), 403, undefined, "unregistered");
  await rejects(
    verifyAttendance(token1, alice),
    409,
    "PRESENCE_REQUIRED",
    "QR alone is rejected when not in the meeting",
  );
  const forged = await new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .sign(new TextEncoder().encode("f".repeat(64)));
  await rejects(verifyAttendance(forged, alice), 400, "QR_INVALID", "forged");
  const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  await rejects(
    verifyAttendance(`${b64({ alg: "none", typ: "JWT" })}.${b64(claims)}.`, alice),
    400,
    "QR_INVALID",
    "unsigned alg:none token",
  );
  const now = Math.floor(Date.now() / 1000);
  const timeExpired = await new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("osw-attendance")
    .setAudience("osw-participant")
    .setIssuedAt(now - 300)
    .setExpirationTime(now - 180)
    .sign(new TextEncoder().encode(process.env.QR_SIGNING_SECRET));
  await rejects(
    verifyAttendance(timeExpired, carol),
    400,
    "QR_EXPIRED",
    "expired signature is rejected",
  );
  await recordPresence(w2.id, alice, "join", randomUUID());
  const verified = await verifyAttendance(token1, alice);
  check(verified.participant === alice.name, "valid QR + presence succeeds");
  await rejects(
    verifyAttendance(token1, alice),
    409,
    "QR_ALREADY_VERIFIED",
    "repeated scan",
  );
  await attendanceWindow(w2.id, org, "close");
  const token2 = tokenOf((await attendanceWindow(w2.id, org, "open")).url);
  check(token2 !== token1, "reopening issues a completely new token");
  check(
    (await db.attendanceChallenge.count({
      where: { session: { workshopId: w2.id }, active: true },
    })) === 1,
    "exactly one active challenge",
  );
  await recordPresence(w2.id, bob, "join", randomUUID());
  await rejects(
    verifyAttendance(token1, bob),
    400,
    "QR_EXPIRED",
    "old QR fails after rotation even before its 120 s elapse",
  );
  await rejects(
    verifyAttendance(token1, alice),
    409,
    "QR_ALREADY_VERIFIED",
    "a verified participant rescanning an old code is told they are verified",
  );
  check(
    (await verifyAttendance(token2, bob)).participant === bob.name,
    "current QR succeeds",
  );
  await attendanceWindow(w2.id, org, "close");
  await recordPresence(w2.id, carol, "join", randomUUID());
  await rejects(
    verifyAttendance(token2, carol),
    400,
    "QR_EXPIRED",
    "closing verification invalidates the current code",
  );
  const aliceLive = await liveState(w2.id, alice);
  check(
    aliceLive.me?.qrVerified && aliceLive.me.recording && !aliceLive.summary,
    "participant live state shows own recording + QR status only",
  );
  const orgLive = await liveState(w2.id, org);
  check(
    orgLive.summary?.verified === 2 &&
      orgLive.summary.inMeeting === 3 &&
      Array.isArray(orgLive.warnings),
    "organizer live summary counts verified and connected participants",
  );
  await rejects(
    attendanceWindow(w2.id, alice, "open"),
    403,
    undefined,
    "participant cannot open verification",
  );

  // 3. Automatic midpoint check: once, attributed to the system.
  const [dave] = await Promise.all([user("PARTICIPANT", "dave")]);
  const w3 = await workshop(org.id, "PUBLISHED");
  await confirm(w3.id, dave.id);
  await changeState(w3.id, org, "start");
  await db.workshopSession.update({
    where: { workshopId: w3.id },
    data: { autoCheckAt: new Date(Date.now() - 1000) },
  });
  check(
    (await attendanceWindow(w3.id, dave, "read")).open,
    "a participant poll triggers the midpoint check",
  );
  await attendanceWindow(w3.id, dave, "read");
  check(
    (await db.notification.count({
      where: { userId: dave.id, kind: "ATTENDANCE_OPEN" },
    })) === 1,
    "midpoint opening notifies once",
  );
  check(
    (await db.auditLog.findFirst({
      where: {
        action: "Attendance verification opened automatically",
        detail: w3.title,
      },
    }))?.actorId === null,
    "automatic opening is attributed to the system",
  );
  const w4 = await workshop(org.id, "PUBLISHED");
  await confirm(w4.id, dave.id);
  await changeState(w4.id, org, "start");
  await attendanceWindow(w4.id, org, "open");
  await db.workshopSession.update({
    where: { workshopId: w4.id },
    data: { autoCheckAt: new Date(Date.now() - 1000) },
  });
  await attendanceWindow(w4.id, dave, "read");
  check(
    (await db.notification.count({
      where: {
        userId: dave.id,
        kind: "ATTENDANCE_OPEN",
        href: `/workshop/${w4.id}/meeting`,
      },
    })) === 1,
    "a manual opening is not repeated at the midpoint",
  );

  // 4. Late registration until the organizer's deadline.
  const [frank, grace] = await Promise.all([
    user("PARTICIPANT", "frank"),
    user("PARTICIPANT", "grace"),
  ]);
  const w5 = await workshop(org.id, "PUBLISHED");
  await changeState(w5.id, org, "start");
  await register(w5.id, frank);
  check(
    (await db.registration.findFirst({
      where: { workshopId: w5.id, participantId: frank.id },
    }))?.status === "CONFIRMED",
    "registration during the live session before the deadline",
  );
  await rejects(register(w5.id, frank, true), 409, undefined, "cancel after start");
  await db.workshop.update({
    where: { id: w5.id },
    data: { registrationDeadline: new Date(Date.now() - 1000) },
  });
  await rejects(register(w5.id, grace), 409, undefined, "deadline passed");

  // 5. JaaS webhook adapter: trusted presence, idempotent, scoped.
  const [heidi, ivan] = await Promise.all([
    user("PARTICIPANT", "heidi"),
    user("PARTICIPANT", "ivan"),
  ]);
  const w6 = await workshop(org.id, "PUBLISHED");
  await confirm(w6.id, heidi.id);
  await changeState(w6.id, org, "start");
  const fqn = `${JAAS_APP}/${w6.meetingRoom}`;
  const joined = {
    eventType: "PARTICIPANT_JOINED",
    idempotencyKey: `${tag}-join-1`,
    fqn,
    timestamp: Date.now(),
    data: { id: heidi.id, participantId: "ep-heidi-1", name: heidi.name },
  };
  check(
    "success" in (await recordJaasEvent(joined)),
    "JaaS join records presence",
  );
  check(
    "duplicate" in (await recordJaasEvent(joined)),
    "redelivered JaaS event is idempotent",
  );
  check(
    (await liveState(w6.id, heidi)).me?.recording,
    "webhook presence shows as recording",
  );
  for (const [event, message] of [
    [{ ...joined, idempotencyKey: `${tag}-org`, data: { id: org.id, participantId: "ep-org" } }, "organizer"],
    [{ ...joined, idempotencyKey: `${tag}-ivan`, data: { id: ivan.id, participantId: "ep-ivan" } }, "unregistered"],
    [{ ...joined, idempotencyKey: `${tag}-app`, fqn: `vpaas-magic-cookie-other/${w6.meetingRoom}` }, "other JaaS app"],
    [{ ...joined, idempotencyKey: `${tag}-room`, fqn: `${JAAS_APP}/osw-unknown` }, "unknown room"],
    [{ ...joined, eventType: "ROOM_CREATED", idempotencyKey: `${tag}-room-created` }, "other event types"],
  ] as const)
    check("ignored" in (await recordJaasEvent(event)), `JaaS ignores ${message}`);
  const token6 = tokenOf((await attendanceWindow(w6.id, org, "open")).url);
  await recordJaasEvent({
    ...joined,
    eventType: "PARTICIPANT_LEFT",
    idempotencyKey: `${tag}-leave-1`,
    data: { ...joined.data, disconnectReason: "left" },
  });
  check(
    (await db.meetingPresence.count({
      where: { participantId: heidi.id, leftAt: null },
    })) === 0,
    "JaaS leave closes the segment",
  );
  await rejects(
    verifyAttendance(token6, heidi),
    409,
    "PRESENCE_REQUIRED",
    "after leaving, QR verification is refused",
  );
  await recordJaasEvent({
    ...joined,
    idempotencyKey: `${tag}-join-2`,
    data: { ...joined.data, participantId: "ep-heidi-2" },
  });
  check(
    (await verifyAttendance(token6, heidi)).participant === heidi.name,
    "rejoined participant verifies",
  );
  check(
    (await db.meetingPresence.count({
      where: { participantId: heidi.id, source: "webhook" },
    })) === 2,
    "reconnect is stored as a separate segment",
  );

  // 6. Drafts stay private.
  const draft = await workshop(org.id, "DRAFT");
  await rejects(liveState(draft.id, alice), 403, undefined, "draft is private");

  console.log(`PASS: ${checks} backend checks against PostgreSQL.`);
} finally {
  await db.workshop.deleteMany({
    where: { id: { in: workshops }, title: { startsWith: tag } },
  });
  await db.notification.deleteMany({ where: { userId: { in: users } } });
  await db.auditLog.deleteMany({
    where: {
      OR: [{ actorId: { in: users } }, { detail: { contains: tag } }],
    },
  });
  await db.authThrottle.deleteMany({
    where: {
      OR: workshops.map((id) => ({ key: { startsWith: `webhook:${id}:` } })),
    },
  });
  await db.user.deleteMany({
    where: { id: { in: users }, email: { startsWith: tag }, seeded: false },
  });
  await db.$disconnect();
}
