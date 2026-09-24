/**
 * Attendance is displayed truncated, never rounded up, so an ineligible
 * 89.995% can never be shown as 90.00%. Rounding at 1e-9 first removes
 * binary floating-point noise (e.g. 0.29 * 100 = 28.999999999999996) while
 * staying far below the smallest real gap under 90% (~1e-6 for a 1-day run).
 */
export function percent(value: number) {
  if (!Number.isFinite(value)) return "0.00%";
  const hundredths = Math.floor(Math.round(value * 1e9) / 1e7);
  return `${(hundredths / 100).toFixed(2)}%`;
}

export function clock(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60),
    sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${h ? `${pad(h)}:` : ""}${pad(m)}:${pad(sec)}`;
}
