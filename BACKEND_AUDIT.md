# OSW backend audit

Date: 2026-09-24. Baseline audited: `59683fb` (main). Author: incoming backend/security owner.

## 1. Method and evidence

Read every file under `src/`, `prisma/`, `tests/`, `scripts/`, all docs (`AGENTS.md`, `HANDOFF.md`,
`IMPLEMENTATION_PLAN.md`, `README.md`, `docs/OSW_REQUIREMENTS.md`, `docs/DEMO_RUNBOOK.md`), the design
reference `docs/Presentation1.pdf` (pages 2–5) and `public/assets/certificate-template.png`.

Commands actually run on the baseline, in this session, against a real PostgreSQL 16 database:

| Check | Result |
|---|---|
| `npm install` (incl. `prisma generate`) | pass, 0 vulnerabilities |
| `npm run lint` | pass |
| `npm run typecheck` | pass |
| `npm run build` (Next.js 16.3.6) | pass, 23 routes |
| `npm test` | 12/12 pass |
| `prisma migrate deploy` + `npm run db:seed` | pass |
| `npm run test:presence` (real 31 s stale expiry) | pass |
| `npm run test:integration` against `next start` (real 120 s QR rotation) | pass, 81 assertions |
| Generated certificate PDF rendered to PNG and inspected | template intact; fields and QR present |

Could not be verified here: live Jitsi media (`meet.jit.si` and `8x8.vc` are blocked by this sandbox's
egress policy, and there is no camera), physical phones, and Vercel/Neon (no credentials supplied).

A patch from an earlier session (`claude-backend.patch`: IP login/signup throttling + an audit) was
reviewed. Its throttling idea is sound and is folded in below with changes. Its audit concluded the
backend was essentially complete. The core logic is good, but that audit missed the demo-breaking and
deployment problems in sections 4 and 6. It also recorded that it could not run any tool.

## 2. Completed features (verified in code and by the passing suites)

| Area | Status | Where |
|---|---|---|
| Opaque DB sessions, HMAC-hashed token, HttpOnly/SameSite=Lax cookie, bcrypt-12, disabled-account revocation | Working | `src/lib/auth.ts` |
| Server-side role checks on every API branch and role page | Working | `route.ts`, `(portal)/*/page.tsx` |
| Admin-only organizer creation; signup forced to PARTICIPANT | Working | `route.ts` `organizers`, `auth/register` |
| Organizer can only mutate own workshops (row-locked ownership check) | Working | `owner()`, `transaction()` in `workshops.ts` |
| Workshop lifecycle DRAFT→PUBLISHED→ONGOING→COMPLETED, capacity under `FOR UPDATE` | Working | `changeState`, `register` |
| DB notifications for publish/register/start/verification/certificate + 3 s polling | Working | `notify*` in `workshops.ts`, `shell.tsx` |
| Presence segments with server timestamps, reconnects, interval union | Working | `presence.ts`, `attendance-math.ts` |
| Signed (jose HS256) 120 s QR with sessionId/challengeId/nonce/issuedAt/expiresAt; nonce hash only in DB; one active challenge | Working | `qr.ts` |
| Exact integer 90% threshold (`presenceMs*100 >= durationMs*90`) | Working | `attendance-math.ts` |
| Certificate issued only at END for CONFIRMED + QR + ≥90%; template PNG untouched | Working | `changeState('end')`, `certificate.ts` |
| Public certificate API without email/participantId | Working | `route.ts` `certificate/:id` |
| Demo mode never bypasses eligibility; RESET is admin + demo + typed confirmation | Working | `route.ts` `reset`, `qr.ts` `demo` |
| Signed generic presence webhook with replay receipts | Working (no provider adapter) | `route.ts` `jitsi-webhook` |

## 3. Incomplete features

1. No dedicated in-OSW meeting page. The meeting is an inline toggle on `/workshops/[id]`; the requested
   `/workshop/[id]/meeting` page with an attendance status bar does not exist.
2. No organizer control panel combining Start/End meeting, attendance verification (QR) and live attendance.
3. No `/verify-certificate/[id]` page (only `/certificate/verify/[id]`, client-rendered).
4. No adapter for any real Jitsi provider's server callbacks, and no JaaS (8x8.vc) support: the JWT code
   only produces the HS256 self-hosted Prosody format.
5. Participant dashboard has no direct JOIN WORKSHOP action; new notifications only change the bell count.
6. Admin cannot reset an organizer's password (a mistyped `Prem@123` during the live demo is unrecoverable).

## 4. Backend problems found

Severity is for the 5-device jury demo and the Vercel/Neon target.

| # | Severity | Problem | Evidence |
|---|---|---|---|
| B1 | Critical (demo) | Public `meet.jit.si` disconnects embedded (iframe/External API) calls after 5 minutes and requires a signed-in moderator before guests are admitted. Presence stops at 5 minutes, so a real session long enough to show QR rotation cannot reach 90%. | Jitsi announcement "Embedding meet.jit.si … will no longer be supported" (5-minute limit since 2023). `JITSI_DOMAIN` defaults to `meet.jit.si`. |
| B2 | High (deploy) | `PRESENCE_MODE` defaults to `webhook`, but nothing sends webhooks. Browser presence is then silently ignored (`{trackedBy:"server"}`). The result is no presence and no certificates, while the UI still says "Connected". | `presence.ts` `recordPresence`, `.env.example` |
| B3 | High (deploy) | `Permissions-Policy` hard-codes `https://meet.jit.si` for camera/microphone, so an iframe from any other Jitsi domain (JaaS `8x8.vc`, self-hosted) is denied camera and microphone. | `next.config.ts` |
| B4 | High (deploy) | Certificate PDF reads `public/assets/*.png/ttf` with `fs` at runtime. Serverless tracing does not guarantee that `public/` files are bundled into the function, which risks HTTP 500 on PDF download on Vercel. | `certificate.ts`, `next.config.ts` has no `outputFileTracingIncludes` |
| B5 | Medium (deploy) | `NEXT_PUBLIC_APP_URL` is inlined at build time even in server code. The CSRF origin check requires exact equality with it, so every POST fails with 403 when the app is opened on another hostname (`*.vercel.app` vs custom domain, `www`) or when the variable changes without a rebuild. | `auth.ts` `checkOrigin`; Next 16 docs `environment-variables.md` |
| B6 | Medium (security) | QR verification does not require the participant to be in the meeting at scan time. A registered participant who is not attending can verify from a forwarded screenshot during the 120 s window. | `qr.ts` `verifyAttendance` |
| B7 | Medium | A verified participant rescanning an old/expired QR gets "expired" instead of "already verified", because currency is checked before the duplicate check. | `qr.ts` check order |
| B8 | Medium | The midpoint auto-open fires again after a manual open, which duplicates the "verification open" notifications and audit rows. Auto-open is attributed in the audit log to whichever participant happened to poll. | `qr.ts` `attendanceWindow` |
| B9 | Medium | Display rounding: `toFixed(2)` shows `90.00%` for 89.995% (ineligible) on the UI and the PDF. That contradicts the exact 90% rule the jury is checking. | `workshop-detail.tsx`, `certificate.ts`, `verification.tsx` |
| B10 | Medium (scale) | Every participant poll of `/window` (every 3 s) takes `SELECT … FOR UPDATE` on the workshop row, serializing with presence heartbeats and QR verification. Fine for 5 devices, poor for a full class. | `qr.ts` via `transaction()` |
| B11 | Low | Registration closes the moment the organizer starts, even before the organizer's own deadline. One slow participant breaks the live demo because they can never join. | `workshops.ts` `register` |
| B12 | Low (security) | Login throttle is per-email only and counts successful logins. A single IP can spray many accounts, and legitimate users burn their budget. | `auth.ts` `throttle` |
| B13 | Low (perf) | Missing indexes on FK/filter columns (Registration.participantId, Certificate.workshopId, AttendanceRecord.participantId, MeetingPresence.participantId, Announcement.workshopId, LearningMaterial.workshopId, AuditLog.createdAt, AuthSession.expiresAt, Workshop(status, scheduledStart)). | `schema.prisma` |
| B14 | Low | Webhook receipts, stale throttle rows and expired sessions are never cleaned; RESET leaves them behind. | `AuthThrottle`, `AuthSession` |
| B15 | Low | `GET /api/workshops/:id` returns internal session fields (`currentChallengeId`, `autoCheckAt`). They are not exploitable because the nonce is HMAC-derived, but they are unnecessary exposure. | `route.ts` |
| B16 | Low (UX) | The create-workshop form has no date defaults; typing three date-times during a live demo is slow and error-prone. | `workshop-form.tsx` |

## 5. Security review

Authorization matrix, verified by reading each branch and by the integration suite:

| Actor → action | Expected | Actual |
|---|---|---|
| Participant → `POST /api/organizers` | 403 | 403 |
| Participant → `/admin`, `/reports` pages | redirect | redirect to own dashboard |
| Organizer B → edit/publish/start/end/QR on A's workshop | 403 | 403 (`owner()` under row lock) |
| Unregistered participant → meeting config, materials, community, QR verify | 403 | 403 |
| Anonymous → any non-public API | 401 | 401 |
| Anonymous → public certificate | sanitized record | no email / participantId |
| Client-supplied role on login/signup | ignored for authorization | role only filters login; signup forced PARTICIPANT |
| Client-supplied userId/organizerId/duration/percentage | never trusted | none accepted (zod strips unknown keys; ids from session) |

Remaining risks:

- R1: Browser presence (`PRESENCE_MODE=browser`) is forgeable by a scripted client. That is acceptable only
  for a supervised demo. Production needs trusted provider callbacks (fixed below via the JaaS webhook adapter).
- R2: Per-account lockout: 20 failures lock an email for 15 minutes. This is an inherent trade-off, now
  paired with an IP bucket.
- R3: No Content-Security-Policy, because Jitsi and Next.js inline scripts make one risky to add blind.
  `nosniff`, `X-Frame-Options`, `Referrer-Policy` and `Permissions-Policy` are present.
- R4: The QR token travels in a URL and may appear in hosting logs. It is short-lived (120 s) and single-use per participant.
- R5: Room JWTs can be shared with another person (account sharing). JaaS tokens are room-scoped and expire in 2 h.

SQL injection: all queries use Prisma. The single raw query is a tagged template (`$queryRaw`) and is
therefore parameterized. XSS: user text is rendered through React only; material links must be `https:`.

## 6. Deployment issues (Vercel + Neon)

- D1: The `meet.jit.si` limits (B1) make JaaS (free: unlimited minutes, 25 monthly active users) or a
  self-hosted Jitsi a requirement for a real jury demo. JaaS needs an App ID, an API key ID, an RS256
  private key and, for trusted presence, a webhook secret.
- D2: Neon: use the pooled `-pooler` host for `DATABASE_URL` (add `pgbouncer=true&connect_timeout=15`) and the
  direct host for `DIRECT_URL`, which `prisma migrate deploy` uses. Cold starts after auto-suspend need
  `connect_timeout`.
- D3: Migrations are not run by the build. The new migration in this pass must be applied (`npm run db:migrate` with
  `DIRECT_URL`, or the `build:vercel` script).
- D4: `NEXT_PUBLIC_APP_URL` must be the final HTTPS origin **before** the build (B5). QR codes and certificate
  QR links are generated from it.
- D5: Phones need HTTPS for camera/microphone in the embedded meeting. Plain-HTTP LAN testing cannot
  work for remote devices.
- D6: Provider webhooks need a public HTTPS URL, so trusted presence is only testable after deployment.
- D7: Node version was unpinned (`engines`).

## 7. Fix plan for this pass (highest risk first)

| Fix | Addresses |
|---|---|
| JaaS provider: RS256 JWT (room-scoped, moderator only for owner), `8x8.vc` External API, room prefixing | B1, D1 |
| JaaS webhook adapter `POST /api/jaas-webhook` (`X-Jaas-Signature` HMAC-SHA256 verification, idempotency, ignores organizer/unknown users) feeding the existing trusted presence path | R1, D6 |
| Presence mode made explicit: `browser` or `webhook`; organizer control panel and admin readiness panel show what is (not) tracking attendance | B2 |
| `Permissions-Policy` built from the configured Jitsi origin(s) | B3 |
| `outputFileTracingIncludes` for template and fonts | B4 |
| `appUrl()` (runtime `APP_URL` → `NEXT_PUBLIC_APP_URL` → Vercel production URL); origin check accepts same-host requests | B5, D4 |
| QR verification requires active meeting presence at scan time; duplicate check before currency check | B6, B7 |
| Auto-open only if verification never opened; system attribution | B8 |
| Truncating percentage formatter everywhere (never displays 90.00% unless eligible-level) | B9 |
| Lock-free participant reads; only the organizer's poll rotates challenges | B10 |
| Registration allowed while ONGOING until the organizer's deadline (cancellation still only before start) | B11 |
| IP + email throttling, failures counted, success resets email bucket | B12 |
| Additive index migration + notification `kind` | B13 |
| Housekeeping of receipts/sessions; RESET clears demo throttle rows | B14 |
| Strip internal session fields | B15 |
| Date defaults in create form | B16 |
| `/workshop/[id]/meeting` page, organizer control panel, participant JOIN from dashboard, notification toasts, `/verify-certificate/[id]` (server-rendered), admin password reset | Section 3 |

Status of each item after implementation is recorded in `HANDOFF.md`.
