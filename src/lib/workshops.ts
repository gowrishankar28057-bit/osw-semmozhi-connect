import { randomBytes, randomUUID } from "node:crypto";
import { Prisma, type Workshop } from "@prisma/client";
import { db } from "./db";
import { assert } from "./errors";
import type { Actor } from "./auth";
import { calculateAttendance } from "./attendance-math";
export type Tx = Prisma.TransactionClient;
export const isDemo = () => process.env.DEMO_MODE === "true";
export const publicOrganizer = {
  id: true,
  name: true,
  department: true,
} as const;
export async function transaction<T>(
  id: string,
  fn: (tx: Tx, w: Workshop) => Promise<T>,
) {
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Workshop" WHERE id = ${id} FOR UPDATE`;
      const w = await tx.workshop.findUnique({ where: { id } });
      assert(w, 404, "Workshop not found.");
      return fn(tx, w);
    },
    { timeout: 20_000 },
  );
}
export function owner(w: Workshop, actor: Actor) {
  assert(
    actor.role === "ORGANIZER" && w.organizerId === actor.id,
    403,
    "Only this workshop’s organizer can make this change.",
  );
}
export async function member(tx: Tx, w: Workshop, actor: Actor) {
  if (
    (actor.role === "ORGANIZER" && w.organizerId === actor.id) ||
    actor.role === "ADMIN"
  )
    return;
  const r = await tx.registration.findUnique({
    where: {
      workshopId_participantId: { workshopId: w.id, participantId: actor.id },
    },
  });
  assert(
    actor.role === "PARTICIPANT" && r?.status === "CONFIRMED",
    403,
    "Register for this workshop to access this area.",
  );
}
export async function audit(
  tx: Tx,
  actorId: string,
  action: string,
  detail: string,
  demo = false,
) {
  await tx.auditLog.create({ data: { actorId, action, detail, demo } });
}
export async function notify(
  tx: Tx,
  userIds: string[],
  message: string,
  href: string,
  demo: boolean,
) {
  if (userIds.length)
    await tx.notification.createMany({
      data: [...new Set(userIds)].map((userId) => ({
        userId,
        message,
        href,
        demo,
      })),
    });
}
export async function notifyRegistered(tx: Tx, w: Workshop, message: string) {
  const r = await tx.registration.findMany({
    where: { workshopId: w.id, status: "CONFIRMED" },
    select: { participantId: true },
  });
  await notify(
    tx,
    r.map((x) => x.participantId),
    message,
    `/workshops/${w.id}`,
    w.demo,
  );
}
export function roomName() {
  return `osw-${randomBytes(24).toString("hex")}`;
}
export async function changeState(
  id: string,
  actor: Actor,
  action: "publish" | "start" | "end",
) {
  return transaction(id, async (tx, w) => {
    owner(w, actor);
    if (action === "publish") {
      assert(
        w.status === "DRAFT",
        409,
        "Only a draft workshop can be published.",
      );
      assert(
        w.scheduledEnd > new Date(),
        400,
        "Update the workshop dates before publishing.",
      );
      await tx.workshop.update({
        where: { id },
        data: { status: "PUBLISHED" },
      });
      const participants = await tx.user.findMany({
        where: { role: "PARTICIPANT", enabled: true },
        select: { id: true },
      });
      await notify(
        tx,
        participants.map((x) => x.id),
        `${actor.name} is conducting ${w.title}`,
        `/workshops/${id}`,
        w.demo,
      );
    } else if (action === "start") {
      assert(
        w.status === "PUBLISHED",
        409,
        "Only a published workshop can be started.",
      );
      assert(
        w.mode === "ONLINE",
        400,
        "This version tracks online workshop attendance.",
      );
      const now = new Date();
      await tx.workshopSession.create({
        data: {
          workshopId: id,
          actualStartedAt: now,
          autoCheckAt: new Date(
            now.getTime() +
              (w.scheduledEnd.getTime() - w.scheduledStart.getTime()) / 2,
          ),
        },
      });
      await tx.workshop.update({ where: { id }, data: { status: "ONGOING" } });
      await notifyRegistered(tx, w, `${w.title} has started`);
    } else {
      assert(
        w.status === "ONGOING",
        409,
        "Only an ongoing workshop can be ended.",
      );
      const now = new Date();
      const session = await tx.workshopSession.findUniqueOrThrow({
        where: { workshopId: id },
      });
      assert(
        now.getTime() > session.actualStartedAt.getTime(),
        409,
        "The session has just started. Please try again.",
      );
      await tx.workshopSession.update({
        where: { id: session.id },
        data: {
          actualEndedAt: now,
          attendanceVerificationClosedAt: now,
          currentChallengeId: null,
        },
      });
      await tx.attendanceChallenge.updateMany({
        where: { sessionId: session.id },
        data: { active: false },
      });
      const open = await tx.meetingPresence.findMany({
        where: { sessionId: session.id, leftAt: null },
      });
      for (const p of open)
        await tx.meetingPresence.update({
          where: { id: p.id },
          data: {
            leftAt:
              p.source === "webhook"
                ? now
                : new Date(
                    Math.min(now.getTime(), p.lastSeenAt.getTime() + 15_000),
                  ),
          },
        });
      const registrations = await tx.registration.findMany({
        where: { workshopId: id, status: "CONFIRMED" },
        include: { participant: true },
      });
      for (const r of registrations) {
        const segments = await tx.meetingPresence.findMany({
          where: { sessionId: session.id, participantId: r.participantId },
        });
        const record = await tx.attendanceRecord.findUnique({
          where: {
            sessionId_participantId: {
              sessionId: session.id,
              participantId: r.participantId,
            },
          },
        });
        const stats = calculateAttendance(
          session.actualStartedAt,
          now,
          segments,
          record?.qrVerified ?? false,
          true,
        );
        await tx.attendanceRecord.upsert({
          where: {
            sessionId_participantId: {
              sessionId: session.id,
              participantId: r.participantId,
            },
          },
          create: {
            sessionId: session.id,
            participantId: r.participantId,
            ...stats,
          },
          update: stats,
        });
        if (stats.eligible) {
          const certificate = await tx.certificate.create({
            data: {
              certificateNumber: `OSW-${randomUUID().toUpperCase()}`,
              participantId: r.participantId,
              workshopId: id,
              participantName: r.participant.name,
              workshopTitle: w.title,
              speaker: w.speaker,
              workshopDate: session.actualStartedAt,
              attendancePercentage: stats.attendancePercentage,
            },
          });
          await notify(
            tx,
            [r.participantId],
            `Your certificate for ${w.title} is ready`,
            `/certificates/${certificate.id}`,
            w.demo,
          );
          await audit(
            tx,
            actor.id,
            "Certificate issued",
            certificate.certificateNumber,
            w.demo,
          );
        }
      }
      await tx.workshop.update({
        where: { id },
        data: { status: "COMPLETED" },
      });
    }
    await audit(
      tx,
      actor.id,
      `Workshop ${action === "publish" ? "published" : action === "start" ? "started" : "ended"}`,
      w.title,
      w.demo,
    );
    return { success: true };
  });
}
export async function register(id: string, actor: Actor, cancel = false) {
  assert(actor.role === "PARTICIPANT", 403, "Only participants can register.");
  return transaction(id, async (tx, w) => {
    assert(
      w.status === "PUBLISHED",
      409,
      "Registration changes are only available before the workshop starts.",
    );
    const where = {
      workshopId_participantId: { workshopId: id, participantId: actor.id },
    };
    const existing = await tx.registration.findUnique({ where });
    if (cancel) {
      assert(
        existing?.status === "CONFIRMED",
        409,
        "There is no confirmed registration to cancel.",
      );
      await tx.registration.update({
        where,
        data: { status: "CANCELLED", cancelledAt: new Date() },
      });
    } else {
      assert(
        w.registrationDeadline > new Date(),
        409,
        "Registration has closed.",
      );
      assert(
        existing?.status !== "CONFIRMED",
        409,
        "You are already registered.",
      );
      const count = await tx.registration.count({
        where: { workshopId: id, status: "CONFIRMED" },
      });
      assert(count < w.capacity, 409, "This workshop is full.");
      await tx.registration.upsert({
        where,
        create: { workshopId: id, participantId: actor.id },
        update: {
          status: "CONFIRMED",
          cancelledAt: null,
          registeredAt: new Date(),
        },
      });
      await notify(
        tx,
        [actor.id],
        `Registration confirmed for ${w.title}`,
        `/workshops/${id}`,
        w.demo,
      );
    }
    await audit(
      tx,
      actor.id,
      cancel ? "Registration cancelled" : "Participant registered",
      `${actor.name}: ${w.title}`,
      w.demo,
    );
    return { success: true };
  });
}
export async function attendanceRows(id: string, actor: Actor) {
  const w = await db.workshop.findUnique({
    where: { id },
    include: {
      session: { include: { presence: true, attendance: true } },
      registrations: { include: { participant: { select: publicOrganizer } } },
    },
  });
  assert(w, 404, "Workshop not found.");
  assert(
    actor.role === "ADMIN" ||
      w.organizerId === actor.id ||
      actor.role === "PARTICIPANT",
    403,
    "Access denied.",
  );
  const rows = w.registrations
    .filter((r) => actor.role !== "PARTICIPANT" || r.participantId === actor.id)
    .map((r) => {
      const s = w.session;
      const record = s?.attendance.find(
        (x) => x.participantId === r.participantId,
      );
      const presence =
        s?.presence.filter((x) => x.participantId === r.participantId) ?? [];
      const stats = s
        ? calculateAttendance(
            s.actualStartedAt,
            s.actualEndedAt ?? new Date(),
            presence,
            record?.qrVerified ?? false,
            r.status === "CONFIRMED",
          )
        : { presenceSeconds: 0, attendancePercentage: 0, eligible: false };
      return {
        participant: r.participant.name,
        participantId: r.participantId,
        status: r.status,
        meetingJoined: presence.some((p) => !p.leftAt || p.leftAt > p.joinedAt),
        qrVerified: record?.qrVerified ?? false,
        verifiedAt: record?.verifiedAt,
        ...stats,
        eligible: w.status === "COMPLETED" && stats.eligible,
      };
    });
  return {
    rows,
    completed: w.status === "COMPLETED",
    actualStartedAt: w.session?.actualStartedAt,
    actualEndedAt: w.session?.actualEndedAt,
  };
}
