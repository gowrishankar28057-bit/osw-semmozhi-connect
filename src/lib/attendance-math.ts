export type Segment = {
  joinedAt: Date;
  leftAt: Date | null;
  lastSeenAt: Date;
  source: string;
};
/** A browser segment without a heartbeat for this long is treated as gone. */
export const STALE_AFTER_MS = 30_000;
/** A silent browser segment is credited this long past its last heartbeat. */
export const HEARTBEAT_GRACE_MS = 15_000;
/** Is this segment a live connection right now (server's view)? */
export function isActiveSegment(s: Segment, now: Date) {
  return (
    s.leftAt === null &&
    (s.source === "webhook" ||
      now.getTime() - s.lastSeenAt.getTime() < STALE_AFTER_MS)
  );
}
export function calculateAttendance(
  start: Date,
  end: Date,
  segments: Segment[],
  qrVerified: boolean,
  confirmed: boolean,
) {
  const from = start.getTime(),
    to = end.getTime(),
    durationMs = Math.max(0, to - from);
  const intervals = segments
    .map((s) => [
      Math.max(from, s.joinedAt.getTime()),
      Math.min(
        to,
        s.leftAt?.getTime() ??
          (s.source === "webhook"
            ? to
            : Math.min(to, s.lastSeenAt.getTime() + HEARTBEAT_GRACE_MS)),
      ),
    ])
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0]);
  let presenceMs = 0,
    left = 0,
    right = 0;
  for (const [a, b] of intervals) {
    if (a > right) {
      presenceMs += right - left;
      left = a;
      right = b;
    } else right = Math.max(right, b);
  }
  presenceMs += right - left;
  presenceMs = Math.min(durationMs, Math.max(0, presenceMs));
  const percentage = durationMs > 0 ? (presenceMs / durationMs) * 100 : 0;
  return {
    presenceSeconds: presenceMs / 1000,
    attendancePercentage: percentage,
    eligible:
      durationMs > 0 &&
      presenceMs * 100 >= durationMs * 90 &&
      qrVerified &&
      confirmed,
  };
}
