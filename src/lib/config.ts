import { AppError } from "./errors";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Public origin used for attendance QR links, certificate QR links and the
 * origin check. APP_URL is read at runtime; NEXT_PUBLIC_APP_URL is frozen at
 * build time; Vercel's production URL is the last resort.
 */
export function appUrl() {
  const raw =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "");
  try {
    return new URL(raw).origin;
  } catch {
    throw new AppError(503, "Application URL is not configured.");
  }
}

export function isLocalOrigin(origin: string) {
  return LOCAL_HOSTS.has(new URL(origin).hostname);
}

/**
 * CSRF defence for cookie-authenticated POSTs. A browser always sends the
 * attacker's origin on a cross-site request, so accepting only the request's
 * own host, the configured public origin and explicit extras is sufficient.
 */
export function isAllowedOrigin(
  origin: string | null,
  requestHost: string | null,
  configuredOrigin: string | null,
  extraOrigins = "",
) {
  if (!origin) return false;
  let host: string;
  try {
    host = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }
  const allowed = new Set<string>();
  if (requestHost) allowed.add(requestHost.trim().toLowerCase());
  for (const value of [configuredOrigin, ...extraOrigins.split(",")]) {
    if (!value?.trim()) continue;
    try {
      allowed.add(new URL(value.trim()).host.toLowerCase());
    } catch {
      // Ignore malformed optional entries.
    }
  }
  return allowed.has(host);
}

export type PresenceMode = "browser" | "webhook";
/** browser: supervised demo; webhook: trusted provider callbacks only. */
export const presenceMode = (): PresenceMode =>
  process.env.PRESENCE_MODE === "browser" ? "browser" : "webhook";

export const jaasWebhookConfigured = () =>
  Boolean(process.env.JAAS_APP_ID && process.env.JAAS_WEBHOOK_SECRET);
export const genericWebhookConfigured = () =>
  (process.env.JITSI_WEBHOOK_SECRET?.length ?? 0) >= 32;

/** True when something will actually record meeting presence. */
export const presenceTracked = () =>
  presenceMode() === "browser" ||
  jaasWebhookConfigured() ||
  genericWebhookConfigured();

export type JitsiProvider = "jaas" | "self-hosted" | "public";
export function jitsiProvider(): {
  provider: JitsiProvider;
  domain: string;
  scriptUrl: string;
} {
  const appId = process.env.JAAS_APP_ID?.trim();
  if (
    appId &&
    process.env.JAAS_API_KEY_ID?.trim() &&
    process.env.JAAS_PRIVATE_KEY?.trim()
  )
    return {
      provider: "jaas",
      domain: "8x8.vc",
      scriptUrl: `https://8x8.vc/${appId}/external_api.js`,
    };
  const domain = process.env.JITSI_DOMAIN?.trim() || "meet.jit.si";
  return {
    provider:
      process.env.JITSI_APP_ID && process.env.JITSI_APP_SECRET
        ? "self-hosted"
        : "public",
    domain,
    scriptUrl: `https://${domain}/external_api.js`,
  };
}

/** Plain-language configuration warnings shown to organizers and admins. */
export function configurationWarnings() {
  const warnings: string[] = [];
  const jitsi = jitsiProvider();
  if (jitsi.provider === "public" && jitsi.domain === "meet.jit.si")
    warnings.push(
      "Public meet.jit.si ends embedded calls after 5 minutes and needs a signed-in moderator. Configure JaaS (JAAS_APP_ID, JAAS_API_KEY_ID, JAAS_PRIVATE_KEY) for real sessions.",
    );
  if (!presenceTracked())
    warnings.push(
      "Meeting attendance is NOT being recorded: PRESENCE_MODE=webhook but no trusted webhook secret is configured. Configure JaaS webhooks, or set PRESENCE_MODE=browser for a supervised demo.",
    );
  else if (presenceMode() === "browser")
    warnings.push(
      "Supervised demo mode: meeting presence comes from participants' browsers with server timestamps. Use JaaS webhooks (PRESENCE_MODE=webhook) for unsupervised production use.",
    );
  try {
    const origin = appUrl();
    if (new URL(origin).protocol !== "https:" && !isLocalOrigin(origin))
      warnings.push(
        "The application URL is not HTTPS. Phones cannot use camera or microphone in the meeting without HTTPS.",
      );
  } catch {
    warnings.push(
      "APP_URL / NEXT_PUBLIC_APP_URL is not configured, so QR and certificate links cannot be generated.",
    );
  }
  return warnings;
}
