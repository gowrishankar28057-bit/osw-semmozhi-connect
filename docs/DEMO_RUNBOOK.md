# Jury demo runbook (5 devices)

Status: every server-side step below is covered by automated tests against
PostgreSQL (see "What is verified"). A live Jitsi call on physical devices has
**not** been run by the automated suites and must be rehearsed once on the
deployed HTTPS site before the jury.

## 1. One-time setup (about 30 minutes)

### Meeting provider: JaaS (strongly recommended)

Public `meet.jit.si` ends embedded calls after **5 minutes** and makes guests
wait for a signed-in moderator. That breaks a real attendance demo. Use JaaS
(8x8 Jitsi as a Service; the free tier allows 25 monthly active users with no
time limit):

1. Sign up at https://jaas.8x8.vc and open the console.
2. **API keys → Add API key** and download the private key. Note the App ID
   (`vpaas-magic-cookie-…`) and the key ID.
3. Set `JAAS_APP_ID`, `JAAS_API_KEY_ID` and `JAAS_PRIVATE_KEY` (the PEM text).
4. Optional, for trusted server-side presence: **Webhooks → Add endpoint**,
   URL `https://YOUR_DOMAIN/api/jaas-webhook`, events `PARTICIPANT_JOINED` and
   `PARTICIPANT_LEFT`. Put the endpoint's signing secret in
   `JAAS_WEBHOOK_SECRET`, then set `PRESENCE_MODE=webhook`.
   Without webhooks, set `PRESENCE_MODE=browser` (supervised demo mode).

The organizer's token makes them moderator; participants join directly with no
lobby. Room names are random 48-hex identifiers, and tokens are scoped to one room.

### Database: Neon

1. Create a Neon project and database `osw`.
2. Copy the **pooled** connection string into `DATABASE_URL` and append
   `&pgbouncer=true&connect_timeout=15`. If Prisma rejects a
   `channel_binding` parameter copied from Neon, remove that parameter.
3. Copy the **direct** (non-pooler) string into `DIRECT_URL` and append
   `&connect_timeout=15`.
4. From a trusted machine, apply the schema and demo accounts:
   `npm run db:migrate`, then `DEMO_MODE=true npm run db:seed`.

### Hosting: Vercel

1. Import the GitHub repository. Framework: Next.js. Node 22.
2. Build command: `npm run build:vercel`. This runs `prisma migrate deploy`
   against `DIRECT_URL` before `next build`. `npm run build` also works if you
   migrate manually.
3. Environment variables: everything in `.env.example`. Generate
   `AUTH_SECRET` and `QR_SIGNING_SECRET` separately with `openssl rand -hex 32`.
   Set `NEXT_PUBLIC_APP_URL` to the final `https://` address **before** deploying,
   because it is baked into the build. `DEMO_MODE=true` only for the jury database.
4. Deploy, then sign in as Admin and open **Reports & activity → Deployment
   readiness**. Every row should be green. The page lists what is missing.
5. Open the site once a few minutes before the jury to wake Neon from auto-suspend.

## 2. Devices

| Device | Who | Signed in as |
|---|---|---|
| 1 laptop | Admin | `admin@osw.demo` / `Admin@123` |
| 2 laptop | Organizer | Prem, created live on Device 1 |
| 3 laptop | Participant in the meeting | `participant@osw.demo` / `Participant@123` |
| 4 phone | Same participant, scanning | `participant@osw.demo`, **signed in before the QR step** |
| 5 phone | Anyone (jury) | not signed in |

Use separate browsers/profiles so sessions stay independent. All devices must
use the HTTPS URL. Keep Device 3's meeting tab in the foreground. Mute
microphones in the same room to avoid audio feedback; the meeting starts muted.

## 3. Script

1. **Device 1 (Admin):** Organizers → Create organizer: Prem,
   `prem@osw.demo`, Tamil / AI, temporary password `Prem@123`.
   It shows "Organizer created. They can sign in immediately." A mistyped
   password can be fixed with Edit → Reset password.
2. **Device 2 (Organizer):** sign in as Prem (Organizer tab). Create workshop:
   *Tamil AI – One Day Workshop*, the description from the brief, speaker
   Prem. The dates are pre-filled. Save the draft, then **Publish workshop**.
3. **Device 3 (Participant):** without refreshing, a toast appears:
   **NEW WORKSHOP · "Prem is conducting Tamil AI – One Day Workshop"**. Click it,
   then **Register**. It shows "Registration confirmed". Click **Open meeting
   room** to wait inside OSW.
4. **Device 2:** **Open control panel** → **Start meeting**. The status changes
   PUBLISHED → ONGOING and the embedded Jitsi meeting opens inside OSW.
5. **Device 3:** the waiting page connects automatically, or use **Join
   workshop** from the dashboard. The status bar shows **Attendance status:
   Recording**, your meeting time, session time, attendance so far and QR
   status. Device 2's control panel shows "1 in meeting".
6. **Device 2:** **Open attendance verification**, or **Trigger demo
   attendance check** in demo mode, which uses the same backend.
   The QR appears with a 02:00 countdown. **Present full screen** makes it easy to scan.
7. **Device 4 (phone):** scan the QR. It shows **✓ ATTENDANCE VERIFIED** with the workshop,
   participant and verification time. Scan again and it shows **ATTENDANCE ALREADY VERIFIED**.
8. Optional negative checks: wait for the 120 s rotation, then scan a photo of
   the previous QR from another registered account. It shows **ATTENDANCE CODE
   EXPIRED**. A registered participant who is not in the meeting gets **JOIN THE
   LIVE MEETING FIRST**.
9. **Device 2:** Live attendance shows Live now / Verified / a rising percentage.
   Keep the meeting running long enough for real ≥ 90% presence: a participant who
   joined 30 s late needs at least a 5-minute session (the late join must be ≤ 10% of the session).
10. **Device 2:** **End meeting** → confirm. Attendance is finalized from the actual
    start/end times; eligible certificates are issued.
11. **Device 3:** toast **CERTIFICATE READY**. Open it, then View / Download PDF.
    The supplied certificate design carries the name, workshop, speaker, date,
    attendance %, certificate ID and verification QR.
12. **Device 5:** scan the certificate's QR. `/verify-certificate/<id>` shows
    **CERTIFICATE VERIFIED** with no login and no email.
13. **Device 1:** Reports shows the audit trail. To repeat, type `RESET` →
    Reset demo data. Seeded Admin and Participant are kept.

## 4. Mandatory negative cases (automated)

A participant calling an Admin endpoint gets 403. A participant opening `/admin` is redirected. Another organizer
editing the workshop gets 403. Anonymous API calls get 401. An unregistered QR scan gets 403. Forged, `alg:none`,
expired and rotated (old) QR codes are rejected. A duplicate scan is reported as already verified. A QR scan
without live meeting presence is rejected. QR with insufficient presence issues no certificate. Exactly
90.00% is eligible; 89.99% is not. Overlapping reconnects never double count.
A disabled organizer or reset password revokes old sessions.

## 5. What is verified

- `npm test`: 20 unit tests (attendance math, presence client, JaaS JWT and
  webhook signatures, percentage display, origin policy).
- `npm run test:backend`: 49 PostgreSQL checks through the real server
  functions with fixed timestamps (exact 90% boundary, all QR rejections,
  auto-open, late registration, JaaS webhook presence).
- `npm run test:presence`: concurrency, replay, reconnect and a real 31 s stale expiry.
- `npm run test:integration`: the full HTTP flow against `next start`,
  including a real 120-second QR rotation, certificate PDF and public pages.

Not automated: live Jitsi media, camera QR scanning and phones. Rehearse steps
1–13 once on the deployed site.
