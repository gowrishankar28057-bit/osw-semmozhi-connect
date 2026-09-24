import test from "node:test";
import assert from "node:assert/strict";
import { clock, percent } from "../src/lib/format";
import { isAllowedOrigin } from "../src/lib/config";

test("attendance is truncated, never rounded up across 90%", () => {
  assert.equal(percent(89.995), "89.99%");
  assert.equal(percent(89.9999999), "89.99%");
  assert.equal(percent(90), "90.00%");
  assert.equal(percent(95.833333), "95.83%");
  assert.equal(percent(0.29), "0.29%");
  assert.equal(percent(100), "100.00%");
  assert.equal(percent(Number.NaN), "0.00%");
});

test("clock formats server durations", () => {
  assert.equal(clock(15), "00:15");
  assert.equal(clock(230), "03:50");
  assert.equal(clock(3725), "01:02:05");
  assert.equal(clock(-4), "00:00");
});

test("origin policy: same host or configured origin only", () => {
  const app = "https://osw.example.org";
  assert.equal(
    isAllowedOrigin("https://osw.example.org", "osw.example.org", app),
    true,
  );
  // Same deployment reached through another hostname (e.g. *.vercel.app).
  assert.equal(
    isAllowedOrigin("https://osw.vercel.app", "osw.vercel.app", app),
    true,
  );
  assert.equal(
    isAllowedOrigin("https://attacker.invalid", "osw.example.org", app),
    false,
  );
  assert.equal(isAllowedOrigin(null, "osw.example.org", app), false);
  assert.equal(isAllowedOrigin("null", "osw.example.org", app), false);
  assert.equal(
    isAllowedOrigin(
      "https://admin.example.org",
      "osw.example.org",
      app,
      "https://admin.example.org, not a url",
    ),
    true,
  );
});
