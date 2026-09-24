import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, generateKeyPairSync } from "node:crypto";
import { decodeProtectedHeader, jwtVerify } from "jose";
import {
  jaasToken,
  parseJaasPresence,
  verifyJaasSignature,
} from "../src/lib/jaas";

const appId = "vpaas-magic-cookie-0123456789abcdef";
const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });

for (const [format, pem] of [
  ["PKCS#1", keys.privateKey.export({ type: "pkcs1", format: "pem" })],
  ["PKCS#8", keys.privateKey.export({ type: "pkcs8", format: "pem" })],
] as const)
  test(`JaaS token is RS256, room-scoped and verifiable (${format})`, async () => {
    const token = await jaasToken(
      { appId, kid: `${appId}/key1`, privateKey: String(pem) },
      { room: "osw-room", userId: "user-1", name: "Prem", moderator: true },
    );
    const header = decodeProtectedHeader(token);
    assert.equal(header.alg, "RS256");
    assert.equal(header.kid, `${appId}/key1`);
    const { payload } = await jwtVerify(token, keys.publicKey, {
      audience: "jitsi",
      issuer: "chat",
    });
    assert.equal(payload.sub, appId);
    assert.equal(payload.room, "osw-room");
    const user = (payload.context as { user: Record<string, string> }).user;
    assert.equal(user.id, "user-1");
    assert.equal(user.moderator, "true");
    assert.ok(payload.exp! - payload.nbf! > 60 * 60);
  });

test("participants never receive moderator rights", async () => {
  const token = await jaasToken(
    {
      appId,
      kid: `${appId}/key1`,
      privateKey: String(
        keys.privateKey.export({ type: "pkcs8", format: "pem" }),
      ),
    },
    { room: "r", userId: "p", name: "P", moderator: false },
  );
  const { payload } = await jwtVerify(token, keys.publicKey);
  const user = (payload.context as { user: Record<string, string> }).user;
  assert.equal(user.moderator, "false");
});

const sign = (secret: string, t: number, body: string) =>
  createHmac("sha256", secret).update(`${t}.${body}`).digest("base64");

test("JaaS webhook signature: valid, tampered, wrong secret, stale", () => {
  const secret = "whsec_test_secret";
  const body = JSON.stringify({ eventType: "PARTICIPANT_JOINED" });
  const now = 1_790_000_000_000;
  const t = now / 1000;
  const header = `t=${t},v1=${sign(secret, t, body)}`;
  assert.equal(verifyJaasSignature(header, body, secret, now), true);
  assert.equal(verifyJaasSignature(header, body + " ", secret, now), false);
  assert.equal(verifyJaasSignature(header, body, "other", now), false);
  assert.equal(
    verifyJaasSignature(header, body, secret, now + 11 * 60_000),
    false,
  );
  assert.equal(verifyJaasSignature(null, body, secret, now), false);
  assert.equal(
    verifyJaasSignature(`v1=${sign(secret, t, body)}`, body, secret, now),
    false,
    "timestamp is mandatory",
  );
  assert.equal(
    verifyJaasSignature(
      `t=${t},v1=bm90LXZhbGlk,v1=${sign(secret, t, body)}`,
      body,
      secret,
      now,
    ),
    true,
    "any listed v1 signature may match",
  );
});

test("JaaS presence events map to OSW users, rooms and connections", () => {
  const joined = parseJaasPresence(
    {
      eventType: "PARTICIPANT_JOINED",
      idempotencyKey: "idem-1",
      fqn: `${appId}/OSW-Room`,
      data: { id: "user-1", participantId: "abcd1234" },
    },
    appId,
  );
  assert.deepEqual(joined, {
    room: "osw-room",
    userId: "user-1",
    connectionId: "abcd1234",
    action: "join",
    eventId: "idem-1",
  });
  assert.equal(
    parseJaasPresence(
      {
        eventType: "PARTICIPANT_LEFT",
        fqn: `${appId}/r`,
        data: { id: "u", participantJid: "u@x/1" },
      },
      appId,
    )?.action,
    "leave",
  );
  for (const event of [
    { eventType: "ROOM_CREATED", fqn: `${appId}/r`, data: { id: "u" } },
    { eventType: "PARTICIPANT_JOINED", fqn: "other-app/r", data: { id: "u" } },
    { eventType: "PARTICIPANT_JOINED", fqn: `${appId}/r`, data: {} },
    null,
  ])
    assert.equal(parseJaasPresence(event, appId), null);
});
