import {
  createHmac,
  createPrivateKey,
  timingSafeEqual,
  type KeyObject,
} from "node:crypto";
import { SignJWT } from "jose";

/**
 * 8x8 Jitsi as a Service (JaaS). Tokens follow the documented JaaS format
 * (RS256, kid "<appId>/<keyId>", aud "jitsi", iss "chat", sub "<appId>").
 */
export type JaasConfig = { appId: string; kid: string; privateKey: string };
export function jaasConfig(): JaasConfig | null {
  const appId = process.env.JAAS_APP_ID?.trim();
  const keyId = process.env.JAAS_API_KEY_ID?.trim();
  const pem = process.env.JAAS_PRIVATE_KEY?.trim();
  if (!appId || !keyId || !pem) return null;
  return {
    appId,
    kid: keyId.includes("/") ? keyId : `${appId}/${keyId}`,
    // Accept real newlines or the escaped "\n" form some env editors produce.
    privateKey: pem.replace(/\\n/g, "\n"),
  };
}

let cachedKey: { pem: string; key: KeyObject } | undefined;
function signingKey(pem: string) {
  // createPrivateKey accepts both PKCS#8 and the PKCS#1 keys JaaS guides generate.
  if (cachedKey?.pem !== pem)
    cachedKey = { pem, key: createPrivateKey({ key: pem, format: "pem" }) };
  return cachedKey.key;
}

export async function jaasToken(
  config: JaasConfig,
  input: {
    room: string;
    userId: string;
    name: string;
    moderator: boolean;
    ttlSeconds?: number;
    now?: number;
  },
) {
  const now = Math.floor((input.now ?? Date.now()) / 1000);
  return new SignJWT({
    aud: "jitsi",
    iss: "chat",
    sub: config.appId,
    // Room-scoped: the token cannot be used to enter any other room.
    room: input.room,
    context: {
      user: {
        id: input.userId,
        name: input.name,
        avatar: "",
        email: "",
        moderator: input.moderator ? "true" : "false",
      },
      features: {
        livestreaming: "false",
        recording: "false",
        transcription: "false",
        "outbound-call": "false",
      },
    },
  })
    .setProtectedHeader({ alg: "RS256", kid: config.kid, typ: "JWT" })
    .setIssuedAt(now)
    .setNotBefore(now - 10)
    .setExpirationTime(now + (input.ttlSeconds ?? 2 * 60 * 60))
    .sign(signingKey(config.privateKey));
}

/**
 * Verifies `X-Jaas-Signature: t=<unix seconds>,v1=<base64 HMAC-SHA256>` over
 * "<t>.<raw body>" using the endpoint's signing secret, in constant time.
 */
export function verifyJaasSignature(
  header: string | null,
  rawBody: string,
  secret: string,
  nowMs = Date.now(),
  toleranceSeconds = 600,
) {
  if (!header || !secret) return false;
  let timestamp = "";
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const at = part.indexOf("=");
    if (at < 1) continue;
    // Split on the first "=" only: base64 signatures end with "=" padding.
    const key = part.slice(0, at).trim(),
      value = part.slice(at + 1).trim();
    if (key === "t") timestamp = value;
    else if (key === "v1") signatures.push(value);
  }
  if (!/^\d{1,12}$/.test(timestamp) || !signatures.length) return false;
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > toleranceSeconds)
    return false;
  const expected = Buffer.from(
    createHmac("sha256", secret)
      .update(`${timestamp}.${rawBody}`, "utf8")
      .digest("base64"),
  );
  return signatures.some((signature) => {
    const received = Buffer.from(signature);
    return (
      received.length === expected.length && timingSafeEqual(received, expected)
    );
  });
}

export function sameSecret(received: string | null, expected: string) {
  const a = Buffer.from(received ?? ""),
    b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type JaasPresenceEvent = {
  room: string;
  userId: string;
  connectionId: string;
  action: "join" | "leave";
  eventId: string;
};
/**
 * Maps a JaaS PARTICIPANT_JOINED / PARTICIPANT_LEFT webhook to a presence
 * event. `data.id` is the `context.user.id` we put in the JWT (the OSW user id).
 * Anything else, or an event for another JaaS app, is ignored.
 */
export function parseJaasPresence(
  event: unknown,
  appId: string,
): JaasPresenceEvent | null {
  if (!event || typeof event !== "object") return null;
  const e = event as Record<string, unknown>;
  const action =
    e.eventType === "PARTICIPANT_JOINED"
      ? "join"
      : e.eventType === "PARTICIPANT_LEFT"
        ? "leave"
        : null;
  if (!action || typeof e.fqn !== "string") return null;
  const slash = e.fqn.indexOf("/");
  if (slash < 1 || e.fqn.slice(0, slash).toLowerCase() !== appId.toLowerCase())
    return null;
  const room = e.fqn.slice(slash + 1).toLowerCase();
  const data = (e.data && typeof e.data === "object" ? e.data : {}) as Record<
    string,
    unknown
  >;
  const text = (value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim() : "";
  const userId = text(data.id);
  // Endpoint id is per connection, so a reconnect becomes a new segment.
  const connectionId =
    text(data.participantId) ||
    text(data.participantJid) ||
    (text(e.sessionId) && `${text(e.sessionId)}:${userId}`);
  if (!room || !userId || !connectionId) return null;
  const eventId =
    text(e.idempotencyKey) ||
    `${e.eventType}:${connectionId}:${typeof e.timestamp === "number" ? e.timestamp : ""}`;
  return {
    room,
    userId,
    connectionId: connectionId.slice(0, 150),
    action,
    eventId: eventId.slice(0, 150),
  };
}
