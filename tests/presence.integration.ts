import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { recordPresence } from "../src/lib/presence";
import { attendanceRows, changeState } from "../src/lib/workshops";

assert(process.env.DEMO_MODE === "true", "Use a local demo database only.");
assert(
  ["localhost", "127.0.0.1"].includes(
    new URL(process.env.DATABASE_URL!).hostname,
  ),
);
process.env.PRESENCE_MODE = "browser";
const tag = `presence-qa-${randomUUID()}`;
const users: string[] = [];
let workshopId = "";
try {
  const organizer = await db.user.create({
    data: {
      name: tag,
      email: `${tag}-org@example.test`,
      passwordHash: "unused-test-fixture",
      role: "ORGANIZER",
      demo: true,
    },
  });
  users.push(organizer.id);
  const participant = await db.user.create({
    data: {
      name: tag,
      email: `${tag}-p@example.test`,
      passwordHash: "unused-test-fixture",
      demo: true,
    },
  });
  users.push(participant.id);
  const workshop = await db.workshop.create({
    data: {
      title: tag,
      description: tag,
      speaker: tag,
      organizerId: organizer.id,
      meetingRoom: tag,
      scheduledStart: new Date(),
      scheduledEnd: new Date(Date.now() + 3600000),
      registrationDeadline: new Date(Date.now() + 3600000),
      status: "PUBLISHED",
      demo: true,
    },
  });
  workshopId = workshop.id;
  const receiptKey = `webhook:${workshopId}:retry-event`;
  await assert.rejects(
    recordPresence(
      workshopId,
      participant,
      "join",
      "retry-connection",
      "webhook",
      "retry-event",
    ),
  );
  assert.equal(
    await db.authThrottle.findUnique({ where: { key: receiptKey } }),
    null,
    "Failed transaction must leave no replay receipt",
  );
  await db.registration.create({
    data: { workshopId, participantId: participant.id },
  });
  await changeState(workshopId, organizer, "start");

  await recordPresence(workshopId, participant, "leave", "never-joined");
  assert.equal(
    (await attendanceRows(workshopId, organizer)).rows[0].meetingJoined,
    false,
    "A leave-only tombstone must not display as a joined meeting",
  );

  const results = await Promise.all(
    Array.from({ length: 8 }, () =>
      recordPresence(
        workshopId,
        participant,
        "join",
        "retry-connection",
        "webhook",
        "retry-event",
      ),
    ),
  );
  assert.equal(results.filter((r) => "duplicate" in r).length, 7);
  assert.equal(
    await db.meetingPresence.count({
      where: {
        participantId: participant.id,
        connectionId: "retry-connection",
      },
    }),
    1,
  );
  await recordPresence(
    workshopId,
    participant,
    "leave",
    "retry-connection",
    "webhook",
    "leave-event",
  );
  await recordPresence(
    workshopId,
    participant,
    "join",
    "retry-connection",
    "webhook",
    "delayed-join",
  );
  assert.equal(
    await db.meetingPresence.count({
      where: {
        participantId: participant.id,
        connectionId: "retry-connection",
        leftAt: null,
      },
    }),
    0,
  );

  await recordPresence(
    workshopId,
    participant,
    "leave",
    "out-of-order",
    "webhook",
    "early-leave",
  );
  await recordPresence(
    workshopId,
    participant,
    "join",
    "out-of-order",
    "webhook",
    "late-join",
  );
  const tombstone = await db.meetingPresence.findFirstOrThrow({
    where: { participantId: participant.id, connectionId: "out-of-order" },
  });
  assert.equal(tombstone.leftAt!.getTime(), tombstone.joinedAt.getTime());

  await recordPresence(workshopId, participant, "join", "browser-old");
  await recordPresence(workshopId, participant, "leave", "browser-old");
  await recordPresence(workshopId, participant, "join", "browser-new");
  await recordPresence(workshopId, participant, "leave", "browser-old");
  assert.equal(
    await db.meetingPresence.count({
      where: {
        participantId: participant.id,
        connectionId: "browser-new",
        leftAt: null,
      },
    }),
    1,
  );
  await assert.rejects(
    recordPresence(workshopId, participant, "join", "browser-old"),
    { code: "PRESENCE_EXPIRED" },
  );

  console.log(
    "Concurrent callbacks, failed-event retry, out-of-order delivery and reconnect isolation passed. Waiting 31 real seconds for stale heartbeat expiry.",
  );
  await new Promise((resolve) => setTimeout(resolve, 31000));
  await assert.rejects(
    recordPresence(workshopId, participant, "heartbeat", "browser-new"),
    { code: "PRESENCE_EXPIRED" },
  );
  const stale = await db.meetingPresence.findFirstOrThrow({
    where: { participantId: participant.id, connectionId: "browser-new" },
  });
  assert.equal(
    stale.leftAt!.getTime(),
    stale.lastSeenAt.getTime() + 15000,
    "Stale close must commit despite returning an expiry error",
  );
  await changeState(workshopId, organizer, "end");
  assert(
    "duplicate" in
      (await recordPresence(
        workshopId,
        participant,
        "join",
        "retry-connection",
        "webhook",
        "retry-event",
      )),
    "Committed retry remains idempotent after session ends",
  );
  console.log(
    "PASS: database presence races, replay atomicity and stale closure verified.",
  );
} finally {
  if (workshopId)
    await db.workshop.deleteMany({ where: { id: workshopId, title: tag } });
  await db.notification.deleteMany({ where: { message: { contains: tag } } });
  await db.auditLog.deleteMany({ where: { actorId: { in: users } } });
  await db.authThrottle.deleteMany({
    where: { key: { startsWith: `webhook:${workshopId}:` } },
  });
  await db.user.deleteMany({
    where: { id: { in: users }, name: tag, seeded: false },
  });
  await db.$disconnect();
}
