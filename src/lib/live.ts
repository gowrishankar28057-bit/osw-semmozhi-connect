import { db } from "./db";
import { assert } from "./errors";
import type { Actor } from "./auth";
import { publicOrganizer } from "./workshops";
import { calculateAttendance, isActiveSegment } from "./attendance-math";
import { autoOpenIfDue } from "./qr";
import {
  configurationWarnings,
  jitsiProvider,
  presenceMode,
  presenceTracked,
} from "./config";

/**
 * Everything the meeting page needs in one read-only poll. All figures are
 * computed from server timestamps; the client only displays them.
 */
export async function liveState(id: string, actor: Actor) {
  const load = () =>
    db.workshop.findUnique({
      where: { id },
      include: { organizer: { select: publicOrganizer }, session: true },
    });
  let w = await load();
  assert(w, 404, "Workshop not found.");
  const isOwner = actor.role === "ORGANIZER" && w.organizerId === actor.id;
  const monitor = isOwner || actor.role === "ADMIN";
  assert(
    w.status !== "DRAFT" || monitor,
    403,
    "This workshop is not published.",
  );
  const registration =
    actor.role === "PARTICIPANT"
      ? await db.registration.findUnique({
          where: {
            workshopId_participantId: {
              workshopId: id,
              participantId: actor.id,
            },
          },
        })
      : null;
  const registered = registration?.status === "CONFIRMED";
  if (w.status === "ONGOING" && (await autoOpenIfDue(id))) w = (await load())!;
  const now = new Date();
  const s = w.session;
  let me = null;
  if (registered && s) {
    const [segments, record, certificate] = await Promise.all([
      db.meetingPresence.findMany({
        where: { sessionId: s.id, participantId: actor.id },
      }),
      db.attendanceRecord.findUnique({
        where: {
          sessionId_participantId: { sessionId: s.id, participantId: actor.id },
        },
      }),
      w.status === "COMPLETED"
        ? db.certificate.findUnique({
            where: {
              participantId_workshopId: {
                participantId: actor.id,
                workshopId: id,
              },
            },
            select: { id: true },
          })
        : null,
    ]);
    const stats = calculateAttendance(
      s.actualStartedAt,
      s.actualEndedAt ?? now,
      segments,
      record?.qrVerified ?? false,
      true,
    );
    me = {
      recording:
        w.status === "ONGOING" && segments.some((x) => isActiveSegment(x, now)),
      presenceSeconds: stats.presenceSeconds,
      attendancePercentage: stats.attendancePercentage,
      qrVerified: record?.qrVerified ?? false,
      verifiedAt: record?.verifiedAt ?? null,
      eligible: w.status === "COMPLETED" && stats.eligible,
      certificateId: certificate?.id ?? null,
    };
  }
  let summary = null;
  if (monitor) {
    const [registeredCount, open, verified] = await Promise.all([
      db.registration.count({ where: { workshopId: id, status: "CONFIRMED" } }),
      s
        ? db.meetingPresence.findMany({
            where: { sessionId: s.id, leftAt: null },
          })
        : Promise.resolve([]),
      s
        ? db.attendanceRecord.count({
            where: { sessionId: s.id, qrVerified: true },
          })
        : Promise.resolve(0),
    ]);
    summary = {
      registered: registeredCount,
      inMeeting:
        w.status === "ONGOING"
          ? new Set(
              open
                .filter((x) => isActiveSegment(x, now))
                .map((x) => x.participantId),
            ).size
          : 0,
      verified,
    };
  }
  return {
    id: w.id,
    title: w.title,
    status: w.status,
    speaker: w.speaker,
    organizer: w.organizer.name,
    isOwner,
    registered,
    session: s
      ? { startedAt: s.actualStartedAt, endedAt: s.actualEndedAt }
      : null,
    verificationOpen:
      w.status === "ONGOING" &&
      Boolean(
        s?.attendanceVerificationOpenedAt && !s.attendanceVerificationClosedAt,
      ),
    serverNow: now,
    presenceMode: presenceMode(),
    presenceTracked: presenceTracked(),
    provider: jitsiProvider().provider,
    me,
    summary,
    warnings: monitor ? configurationWarnings() : [],
  };
}
