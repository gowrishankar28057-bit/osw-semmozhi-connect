import test from "node:test";
import assert from "node:assert/strict";
import { calculateAttendance, type Segment } from "../src/lib/attendance-math";
const at = (ms: number) => new Date(ms);
const segment = (
  start: number,
  end: number | null,
  lastSeen = end ?? start,
  source = "browser",
): Segment => ({
  joinedAt: at(start),
  leftAt: end === null ? null : at(end),
  lastSeenAt: at(lastSeen),
  source,
});
test("90.00% is eligible; 89.99% is not, without rounding", () => {
  assert.equal(
    calculateAttendance(at(0), at(100_000), [segment(0, 90_000)], true, true)
      .eligible,
    true,
  );
  assert.equal(
    calculateAttendance(at(0), at(100_000), [segment(0, 89_990)], true, true)
      .eligible,
    false,
  );
});
test("actual four-minute runtime yields 95.833% for 230 seconds", () => {
  const s = calculateAttendance(
    at(0),
    at(240_000),
    [segment(10_000, 240_000)],
    true,
    true,
  );
  assert.equal(s.presenceSeconds, 230);
  assert.ok(Math.abs(s.attendancePercentage - 95.833333) < 0.000001);
  assert.equal(s.eligible, true);
});
test("reconnect gaps are excluded and overlapping devices do not double count", () => {
  const s = calculateAttendance(
    at(0),
    at(600_000),
    [segment(0, 300_000), segment(360_000, 600_000), segment(100_000, 200_000)],
    true,
    true,
  );
  assert.equal(s.presenceSeconds, 540);
  assert.equal(s.attendancePercentage, 90);
});
test("clips presence to session and caps at 100 percent", () => {
  const s = calculateAttendance(
    at(1000),
    at(101000),
    [segment(-5000, 120000)],
    true,
    true,
  );
  assert.equal(s.attendancePercentage, 100);
});
test("QR alone and presence alone are insufficient", () => {
  assert.equal(
    calculateAttendance(at(0), at(10000), [], true, true).eligible,
    false,
  );
  assert.equal(
    calculateAttendance(at(0), at(10000), [segment(0, 10000)], false, true)
      .eligible,
    false,
  );
  assert.equal(
    calculateAttendance(at(0), at(10000), [segment(0, 10000)], true, false)
      .eligible,
    false,
  );
});
test("stale browser connection stops at bounded heartbeat grace", () => {
  assert.equal(
    calculateAttendance(
      at(0),
      at(100000),
      [segment(0, null, 10000)],
      true,
      true,
    ).presenceSeconds,
    25,
  );
});
test("zero or negative runtime is never eligible", () => {
  assert.equal(
    calculateAttendance(at(0), at(0), [segment(0, 5000)], true, true).eligible,
    false,
  );
  assert.equal(
    calculateAttendance(at(5000), at(0), [], true, true).eligible,
    false,
  );
});
