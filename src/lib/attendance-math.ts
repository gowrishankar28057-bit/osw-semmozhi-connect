export type Segment = {
  joinedAt: Date;
  leftAt: Date | null;
  lastSeenAt: Date;
  source: string;
};
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
            : Math.min(to, s.lastSeenAt.getTime() + 15_000)),
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
