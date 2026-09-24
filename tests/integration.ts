import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { SignJWT, decodeJwt } from "jose";
import type {
  Certificate,
  WindowState,
  Attendance,
  LiveState,
} from "../src/lib/types";
const base = process.env.NEXT_PUBLIC_APP_URL!;
assert(
  new URL(base).hostname === "localhost" ||
    new URL(base).hostname === "127.0.0.1",
  "This test is local-only.",
);
assert(
  process.env.DEMO_MODE === "true",
  "Use a dedicated local demo database.",
);
const db = new PrismaClient();
const tag = `qa-${Date.now()}`;
const createdUsers: string[] = [];
const workshopIds: string[] = [];
let assertions = 0;
let heart: ReturnType<typeof setInterval> | undefined;
class Client {
  cookie = "";
  async request<T = Record<string, unknown>>(
    path: string,
    data?: unknown,
    expected = 200,
    origin = base,
  ): Promise<T> {
    const res = await fetch(`${base}/api/${path}`, {
      method: data === undefined ? "GET" : "POST",
      headers: {
        ...(data === undefined
          ? {}
          : { "Content-Type": "application/json", Origin: origin }),
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    const cookie = res.headers.get("set-cookie");
    if (cookie) this.cookie = cookie.split(";")[0];
    const result = await res.json();
    assert.equal(res.status, expected, `${path}: ${JSON.stringify(result)}`);
    assertions++;
    return result as T;
  }
}
const admin = new Client(),
  org = new Client(),
  other = new Client(),
  participant = new Client(),
  late = new Client(),
  unregistered = new Client();
const password = `Qa${randomUUID()}!`;
async function user(client: Client, suffix: string) {
  const email = `${tag}-${suffix}@example.test`;
  const u = await client.request<{ id: string }>(
    "auth/register",
    { name: `QA ${suffix}`, email, password },
    201,
  );
  createdUsers.push(u.id);
  return u;
}
async function workshop(client: Client, title: string, capacity = 10) {
  const now = Date.now();
  const data = {
    title,
    description:
      "QA integration workshop for real server timestamp verification.",
    speaker: "QA Organizer",
    mode: "ONLINE",
    capacity,
    scheduledStart: new Date(now + 60_000).toISOString(),
    scheduledEnd: new Date(now + 3_660_000).toISOString(),
    registrationDeadline: new Date(now + 600_000).toISOString(),
  };
  const w = await client.request<{ id: string }>("workshops", data, 201);
  workshopIds.push(w.id);
  return { w, data };
}
console.log(
  "Starting local API integration checks. Meeting events are API test inputs; this does not validate real Jitsi media.",
);
try {
  await admin.request("auth/login", {
    email: "admin@osw.demo",
    password: "Admin@123",
    role: "ADMIN",
  });
  const d = {
    name: "QA Organizer",
    email: `${tag}-organizer@example.test`,
    password,
    department: "Tamil / AI",
  };
  const organizer = await admin.request<{ id: string }>("organizers", d, 201);
  createdUsers.push(organizer.id);
  await admin.request("organizers", d, 409);
  await org.request("auth/login", {
    email: d.email,
    password,
    role: "ORGANIZER",
  });
  const second = await admin.request<{ id: string }>(
    "organizers",
    { ...d, email: `${tag}-other@example.test` },
    201,
  );
  createdUsers.push(second.id);
  await other.request("auth/login", {
    email: `${tag}-other@example.test`,
    password,
    role: "ORGANIZER",
  });
  const p = await user(participant, "participant");
  await user(late, "late");
  await user(unregistered, "unregistered");
  await participant.request("organizers", d, 403);
  await participant.request("reset", { confirmation: "RESET" }, 403);
  await participant.request(
    "profile",
    { name: "Bad origin", department: "" },
    403,
    "https://attacker.invalid",
  );
  const { w, data } = await workshop(org, `${tag} Tamil AI workshop`);
  await other.request(`workshops/${w.id}`, data, 403);
  await participant.request(`workshops/${w.id}`, undefined, 403);
  await org.request(`workshops/${w.id}/window`, { action: "demo" }, 409);
  await org.request(`workshops/${w.id}/publish`, {});
  const notices =
    await participant.request<{ message: string }[]>("notifications");
  assert(notices.some((n) => n.message.includes(data.title)));
  assertions++;
  const listed =
    await participant.request<Record<string, unknown>[]>("workshops");
  assert(!listed.some((x) => "meetingRoom" in x));
  assertions++;
  await participant.request(`workshops/${w.id}/register`, {});
  await participant.request(`workshops/${w.id}/register`, {}, 409);
  await late.request(`workshops/${w.id}/register`, {});
  await late.request(`workshops/${w.id}/cancel`, {});
  await late.request(`workshops/${w.id}/register`, {});
  await org.request(`workshops/${w.id}/materials`, {
    title: "Tamil resource",
    url: "https://www.cict.in/",
  });
  await unregistered.request(`workshops/${w.id}/materials`, undefined, 403);
  await participant.request(`workshops/${w.id}/community`, {
    message: "Ready to learn.",
  });
  await org.request(`workshops/${w.id}/announcements`, {
    message: "Workshop will start shortly.",
  });
  const connectionId = randomUUID();
  await org.request(`workshops/${w.id}/start`, {});
  await participant.request(`workshops/${w.id}/presence`, {
    action: "join",
    connectionId,
  });
  heart = setInterval(
    () =>
      void participant
        .request(`workshops/${w.id}/presence`, {
          action: "heartbeat",
          connectionId,
        })
        .catch((e) => console.error("Heartbeat failed:", e.message)),
    8000,
  );
  await participant.request(`workshops/${w.id}/cancel`, {}, 409);
  await unregistered.request(`workshops/${w.id}/meeting`, undefined, 403);
  await new Client().request(`workshops/${w.id}/live`, undefined, 401);
  // Joining late is allowed until the deadline; cancelling after start is not.
  const walkIn = new Client();
  await user(walkIn, "walkin");
  await walkIn.request(`workshops/${w.id}/register`, {});
  await walkIn.request(`workshops/${w.id}/cancel`, {}, 409);
  await org.request(`workshops/${w.id}/window`, { action: "demo" });
  const qr = await org.request<WindowState>(`workshops/${w.id}/window`);
  assert(qr.url?.startsWith(`${base}/attendance/verify?t=`));
  assertions++;
  const token = new URL(qr.url!).searchParams.get("t")!;
  const participantWindow = await participant.request<WindowState>(
    `workshops/${w.id}/window`,
  );
  assert(participantWindow.open && participantWindow.url === null);
  assertions++;
  const record = await db.attendanceChallenge.findFirstOrThrow({
    where: { session: { workshopId: w.id }, active: true },
  });
  assert.equal(record.expiresAt.getTime() - record.createdAt.getTime(), 120000);
  assertions++;
  await unregistered.request("attendance/verify", { token }, 403);
  await participant.request(
    "attendance/verify",
    { token: token.slice(0, -12) + "invalidtoken" },
    400,
  );
  const forged = await new SignJWT(decodeJwt(token))
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .sign(new TextEncoder().encode("x".repeat(64)));
  await participant.request("attendance/verify", { token: forged }, 400);
  // Registered but not connected to the meeting: the QR alone is refused.
  await late.request("attendance/verify", { token }, 409);
  await participant.request("attendance/verify", { token });
  await participant.request("attendance/verify", { token }, 409);
  // Rotating before expiry must invalidate the previous QR immediately.
  await org.request(`workshops/${w.id}/window`, { action: "close" });
  await org.request(`workshops/${w.id}/window`, { action: "open" });
  const reopened = await org.request<WindowState>(`workshops/${w.id}/window`);
  const token2 = new URL(reopened.url!).searchParams.get("t")!;
  assert.notEqual(token, token2);
  assertions++;
  const lateConnection = randomUUID();
  await late.request(`workshops/${w.id}/presence`, {
    action: "join",
    connectionId: lateConnection,
  });
  await late.request("attendance/verify", { token }, 400);
  await late.request(`workshops/${w.id}/presence`, {
    action: "leave",
    connectionId: lateConnection,
  });
  console.log(
    "Roles, ownership, notifications, registration, community and QR rejection checks passed. Waiting for the real 120-second expiry while recording heartbeat timestamps.",
  );
  await new Promise((r) =>
    setTimeout(
      r,
      Math.max(0, new Date(reopened.expiresAt!).getTime() - Date.now()) + 400,
    ),
  );
  await late.request("attendance/verify", { token: token2 }, 400);
  const rotated = await org.request<WindowState>(`workshops/${w.id}/window`);
  const token3 = new URL(rotated.url!).searchParams.get("t")!;
  assert.notEqual(token2, token3);
  assertions++;
  const lateConnection2 = randomUUID();
  await late.request(`workshops/${w.id}/presence`, {
    action: "join",
    connectionId: lateConnection2,
  });
  await late.request("attendance/verify", { token: token3 });
  await late.request(`workshops/${w.id}/presence`, {
    action: "leave",
    connectionId: lateConnection2,
  });
  await participant.request("attendance/verify", { token: token3 }, 409);
  const participantLive = await participant.request<LiveState>(
    `workshops/${w.id}/live`,
  );
  assert(
    participantLive.me?.qrVerified &&
      participantLive.me.recording &&
      participantLive.summary === null,
  );
  assertions++;
  const organizerLive = await org.request<LiveState>(`workshops/${w.id}/live`);
  assert(
    organizerLive.summary?.verified === 2 &&
      organizerLive.summary.inMeeting >= 1,
  );
  assertions++;
  await org.request(`workshops/${w.id}/window`, { action: "close" });
  await unregistered.request("attendance/verify", { token: token3 }, 403);
  const rows = await org.request<Attendance>(`workshops/${w.id}/attendance`);
  assert(
    rows.rows.some(
      (r) =>
        r.participantId === p.id && r.qrVerified && r.presenceSeconds > 100,
    ),
  );
  assertions++;
  clearInterval(heart);
  heart = undefined;
  await participant.request(`workshops/${w.id}/presence`, {
    action: "leave",
    connectionId,
  });
  await org.request(`workshops/${w.id}/end`, {});
  const certs = await participant.request<Certificate[]>("certificates");
  const cert = certs.find((c) => c.workshopTitle === data.title);
  assert(cert, "Expected genuine timed API-presence test certificate.");
  assert(cert.attendancePercentage >= 90);
  assertions += 2;
  assert.equal(
    (await late.request<Certificate[]>("certificates")).length,
    0,
    "QR alone must not issue certificate.",
  );
  assertions++;
  const publicClient = new Client();
  const verified = await publicClient.request<Record<string, unknown>>(
    `certificate/${cert.id}`,
  );
  assert(!("email" in verified) && !("participantId" in verified));
  assertions++;
  await publicClient.request("certificate/not-a-certificate", undefined, 404);
  const byNumber = await publicClient.request<Certificate>(
    `certificate/${cert.certificateNumber}`,
  );
  assert.equal(byNumber.id, cert.id);
  assertions++;
  const page = await fetch(`${base}/verify-certificate/${cert.id}`);
  const html = await page.text();
  assert.equal(page.status, 200);
  assert(html.includes("CERTIFICATE VERIFIED") && html.includes(cert.participantName));
  assert(!html.includes("@example.test"), "No private email on public page");
  assertions += 3;
  const missing = await fetch(`${base}/verify-certificate/not-a-certificate`);
  assert((await missing.text()).includes("CERTIFICATE NOT FOUND"));
  assertions++;
  const legacy = await fetch(`${base}/certificate/verify/${cert.id}`, {
    redirect: "manual",
  });
  assert.equal(legacy.status, 308);
  assert(legacy.headers.get("location")?.endsWith(`/verify-certificate/${cert.id}`));
  assertions += 2;
  const adminPage = await fetch(`${base}/admin`, {
    headers: { Cookie: participant.cookie },
    redirect: "manual",
  });
  assert([303, 307, 308].includes(adminPage.status));
  assert.notEqual(new URL(adminPage.headers.get("location")!, base).pathname, "/admin");
  assertions += 2;
  await participant.request("system", undefined, 403);
  const system = await admin.request<{ presenceMode: string; warnings: string[] }>(
    "system",
  );
  assert(system.presenceMode && Array.isArray(system.warnings));
  assertions++;
  const pdf = await fetch(`${base}/api/certificate/${cert.id}/pdf?download=1`, {
    headers: { Cookie: participant.cookie },
  });
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get("content-type"), "application/pdf");
  assertions += 2;
  await mkdir("work/qa", { recursive: true });
  await writeFile(
    "work/qa/certificate.pdf",
    Buffer.from(await pdf.arrayBuffer()),
  );
  const forbiddenPdf = await fetch(`${base}/api/certificate/${cert.id}/pdf`, {
    headers: { Cookie: unregistered.cookie },
  });
  assert.equal(forbiddenPdf.status, 403);
  assertions++;
  // Admin resets a mistyped organizer password: old sessions are revoked.
  const newPassword = `Qa${randomUUID()}#`;
  await admin.request(`organizers/${second.id}`, { password: newPassword });
  await other.request("dashboard", undefined, 401);
  await other.request(
    "auth/login",
    { email: `${tag}-other@example.test`, password, role: "ORGANIZER" },
    401,
  );
  await other.request("auth/login", {
    email: `${tag}-other@example.test`,
    password: newPassword,
    role: "ORGANIZER",
  });
  // A request whose Origin matches its own Host is accepted even when the
  // configured public URL uses another hostname (e.g. *.vercel.app).
  const loopback = new URL(base);
  loopback.hostname = loopback.hostname === "localhost" ? "127.0.0.1" : "localhost";
  const sameHost = await fetch(`${loopback.origin}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: loopback.origin },
    body: JSON.stringify({
      email: d.email,
      password,
      role: "ORGANIZER",
    }),
  });
  assert.equal(sameHost.status, 200);
  assertions++;
  await admin.request(`organizers/${organizer.id}`, { enabled: false });
  await org.request("dashboard", undefined, 401);
  await admin.request(`organizers/${organizer.id}`, { enabled: true });
  await org.request("auth/login", {
    email: d.email,
    password,
    role: "ORGANIZER",
  });
  console.log(
    `PASS: ${assertions} integration assertions; actual session duration and QR rotation used real server time. Certificate PDF saved privately for visual QA.`,
  );
} finally {
  if (heart) clearInterval(heart);
  // Delete only this test run's exact IDs, never seed accounts or unrelated workshops.
  await db.workshop.deleteMany({
    where: { id: { in: workshopIds }, title: { startsWith: tag } },
  });
  await db.notification.deleteMany({
    where: {
      OR: [{ userId: { in: createdUsers } }, { message: { contains: tag } }],
    },
  });
  await db.auditLog.deleteMany({
    where: {
      OR: [{ actorId: { in: createdUsers } }, { detail: { contains: tag } }],
    },
  });
  await db.user.deleteMany({
    where: {
      id: { in: createdUsers },
      email: { startsWith: tag },
      seeded: false,
    },
  });
  await db.authThrottle.deleteMany({
    where: {
      OR: [
        { key: { contains: tag } },
        // Local-only suite: reset the loopback IP buckets it consumed.
        { key: { startsWith: "login-ip:" } },
        { key: { startsWith: "signup-ip:" } },
      ],
    },
  });
  await db.$disconnect();
}
