# OSW handoff

Updated: 2026-09-24. This document describes the current tested local checkpoint; it is not a completed physical-device or production acceptance test.

## Current architecture and stack

Single Next.js 16.3.6 App Router application, React 19, strict TypeScript, responsive custom CSS, Lucide icons. Node runtime route handlers. PostgreSQL with Prisma 6.19.3. bcryptjs passwords, cryptographic opaque sessions, jose signed QR/Jitsi tokens, qrcode, pdf-lib with fontkit. No Auth.js dependency: a secure-equivalent database session implementation is used.

Project root is `outputs/osw-semmozhi-connect` within the original Codex workspace. The GitHub repository root is this application directory. The parent `work/` folder contains disposable reference renders and a portable GitHub CLI; it is outside this repository.

## Folder structure

- AGENTS.md: continuation and checkpoint policy.
- HANDOFF.md: this status and continuation guide.
- IMPLEMENTATION_PLAN.md: phase plan and status.
- docs/OSW_REQUIREMENTS.md: master requirements.
- docs/Presentation1.pdf: unchanged design reference.
- docs/DEMO_RUNBOOK.md: proposed local jury flow and checks.
- public/assets/: original certificate PNG, extracted UI artwork and licensed Unicode fonts.
- prisma/schema.prisma, prisma/seed.ts, prisma/migrations/: database definition, demo seed and initial SQL migration.
- scripts/local-db.mjs: local PostgreSQL launcher and local-only random env generation.
- src/lib/: database, authentication, schemas, workshop transactions, QR, presence, PDF, attendance math, shared UI types.
- src/components/: role dashboards, shell, auth, organizer management, workshop flows, meeting, resources, certificates and verification.
- src/app/: App Router pages, global styles and API dispatcher.
- work/: ignored local PostgreSQL data and credentials. Never stage this directory.

## Database architecture and Prisma models

PostgreSQL tables: User, AuthSession, AuthThrottle, Workshop, WorkshopSession, Registration, MeetingPresence, AttendanceChallenge, AttendanceRecord, Notification, Announcement, CommunityMessage, LearningMaterial, Certificate, AuditLog.

Roles are ADMIN, ORGANIZER and PARTICIPANT. Workshops have DRAFT/PUBLISHED/ONGOING/COMPLETED/CANCELLED states. Registration has a unique workshop/participant pair. Attendance has a unique session/participant pair. Certificates have a UUID public ID, unique number and unique participant/workshop pair. Meeting presence stores reconnect segments. Certificate fields snapshot display name, workshop, speaker and date at issue time.

Workshop changes and QR operations lock the workshop row in a transaction to serialize lifecycle changes, capacity checks, rotation and finalization. Important state changes write audit records. Deleting demo workshops cascades attendance, certificates and resources.

## Authentication and authorization

`src/lib/auth.ts`: bcrypt cost 12, random 256-bit session token, HMAC digest stored in AuthSession, 12-hour expiry, HTTP-only SameSite=Lax cookie with Secure on HTTPS. Every authenticated request reloads enabled status. Logout deletes session; disabling organizer deletes their sessions. Role checks exist server-side in API and role pages. Organizer mutations require ownership. Participants must be confirmed registrants for meetings, community and materials. Mutations enforce configured same-origin requests. Authentication throttling is persisted in AuthThrottle, currently keyed by email.

Signup explicitly creates PARTICIPANT regardless of submitted role. User password hashes are excluded from API user responses.

## Implemented and locally verified

- Schema, initial migration and local PostgreSQL launcher.
- Admin/Participant seed only; no Prem seed.
- Authentication, participant signup, role dashboards, organizer create/edit/enable/disable.
- Workshop create/edit/publish/start/end, discovery, registration/cancellation with capacity checks.
- Database notifications and 3-second polling; mark read.
- Jitsi embed and browser join/leave/heartbeat attendance; optional server callback endpoint.
- Signed rotating 120-second QR and verification with membership/session/window checks.
- Actual-runtime attendance math with interval union and exact 90% eligibility.
- End-session certificate records, PDF generator using unchanged template, download and public verification routes.
- Announcements, learning material HTTPS links, member discussion, attendance CSV export, profile updates.
- Admin audit report and demo-only reset with typed RESET confirmation.
- Responsive reference-inspired CSS and original PDF/certificate assets.
- Animated frontend UX: route-aware entrance motion, staggered panels/cards, heritage image drift, button/sidebar/notification feedback, mobile overlay transitions and `prefers-reduced-motion` support. Motion uses CSS only and adds no runtime dependency.
- Unit tests for attendance math and a local API integration workflow covering registration, role authorization, workshop lifecycle, presence, QR verification/rotation, certificate issuance/PDF access, notifications, community, materials and reset safeguards.
- Meeting-room secrets are stripped from dashboard/list responses and returned only by the membership-gated `/meeting` endpoint.
- QR challenge timestamps preserve millisecond precision while JWT expiry remains compatible with jose second-based claims.

## Partially completed / unimplemented

- Live Jitsi join/leave/reconnect, physical QR scanning, five-device flow and production webhook delivery remain unverified. The local integration test does exercise the browser-presence contract, exact runtime attendance calculation and a real 120-second QR rotation.
- Production trusted Jitsi callback adapter is not supplied. The API defines an authenticated adapter contract, not a native plug-and-play Jitsi webhook integration.
- Public Neon/Vercel deployment is intentionally deferred until account values are supplied.

## Known bugs / review items

- `attendanceWindow` automatic midpoint check is request-driven by active polling. It is not a background timer when no clients are polling.
- QR close controls should not show success when session is not active; review return handling and UI gating.
- Browser heartbeats have a bounded 15-second grace; confirm reconnect and abrupt-disconnect behavior.
- Trusted callback receipt uses AuthThrottle as a replay ledger; improve transactional replay handling and timestamp ordering before production.
- Login/signup throttle needs IP/global abuse protection for production, beyond current per-email limit.
- Exact certificate background contains sample signatories. They remain part of user-supplied artwork. Variable text is masked in PDF; inspect the resulting PDF for alignment and Unicode behavior.

## Current checks and build errors

- `npm install`: completed, Prisma client generated.
- `prisma migrate deploy`: passed against local PostgreSQL.
- `npm run db:seed`: passed, seeded only requested users.
- `npm test`: passed, 7 attendance-math assertions/tests.
- `npm run test:integration`: passed, 81 API/security/workflow assertions against local PostgreSQL; the test used real server time for session duration and QR rotation and generated a private PDF for visual QA.
- `npm run typecheck`: passed.
- `npm run lint`: passed with no findings.
- `npm run build`: passed with Next.js 16.3.6; all 23 routes compiled. The build used `D:\\osw-build-tmp` for temporary files because the system drive was nearly full.
- `npm audit --omit=dev --audit-level=high`: passed with 0 vulnerabilities after the `deepmerge-ts` override.
- Certificate PDF visual QA passed against the supplied template: artwork remains intact, dynamic fields and verification QR render, and Unicode Tamil font embedding is available.
- Browser visual QA confirmed the login artwork and motion styles at a narrow responsive viewport; the local dashboard preview was blocked once by the system drive reaching 0 bytes while PostgreSQL/Next dev were writing caches. The database was restarted and seeded successfully afterward.
- No physical-device, live Jitsi or production deployment acceptance has been claimed.

## Required environment variables

DATABASE_URL, DIRECT_URL, AUTH_SECRET (32+ characters), QR_SIGNING_SECRET (different 32+ characters), NEXT_PUBLIC_APP_URL, DEMO_MODE, JITSI_DOMAIN, PRESENCE_MODE.

Optional for authenticated Jitsi: JITSI_APP_ID, JITSI_APP_SECRET, JITSI_WEBHOOK_SECRET (32+ characters). The original local `.env` is generated randomly and ignored. Never print, commit or include its contents in handoffs. `.env.example` has only placeholders.

## Commands

```sh
npm install
npm run db:local
# in a second terminal
npm run db:migrate
npm run db:seed
npm run dev
npm run typecheck
npm run lint
npm run build
npm start
```

Local DB launcher stays running on 127.0.0.1:55432. It creates `.env` only if absent. Existing `.env` is never overwritten. Prisma migration generation: `npx prisma migrate dev --name descriptive_name` against a development database; deployment application: `npm run db:migrate`.

## Deployment instructions (deferred)

Use a private GitHub repository. Branches: main = tested checkpoints, codex-dev = working branch. No force push or history rewrite. Vercel imports the application repository root, build `npm run build`, Node 22 or 24. Add environment values using Vercel settings, never source files. Obtain Neon pooled DATABASE_URL and direct DIRECT_URL. Apply committed migration with direct connection. Seed only an explicitly opted-in demo environment; DEMO_MODE=false elsewhere. Set NEXT_PUBLIC_APP_URL to the final HTTPS origin before QR testing.

No Vercel team or Neon project ID has been provided. The user explicitly requested local work continue without deploying. Production needs Neon credentials, Vercel account/team connection, final HTTPS URL, fresh secrets and authenticated Jitsi integration for trusted presence.

## Important API routes

All routes implemented in `src/app/api/[...path]/route.ts`:

- GET /api/auth/me; POST /api/auth/login, register, logout.
- GET /api/dashboard.
- GET/POST /api/organizers; POST /api/organizers/:id.
- GET/POST /api/workshops; GET/POST /api/workshops/:id.
- POST /api/workshops/:id/publish, start, end, register, cancel.
- GET /api/workshops/:id/meeting; POST /api/workshops/:id/presence.
- GET/POST /api/workshops/:id/window; POST /api/attendance/verify.
- GET /api/workshops/:id/attendance.
- GET/POST /api/workshops/:id/community, announcements, materials.
- GET /api/notifications; POST /api/notifications/:id or /all.
- GET /api/certificates; GET /api/certificate/:id (public sanitized record).
- GET /api/certificate/:id/pdf?download=1 (member/owner/admin authorization).
- POST /api/profile; POST /api/reset (Admin, demo mode, RESET body).
- POST /api/jitsi-webhook (signed trusted adapter callback).

## Jitsi details

`src/components/meeting.tsx` loads External API from configured JITSI_DOMAIN, opens an embedded conference, and listens to videoConferenceJoined/videoConferenceLeft/readyToClose. A per-component UUID identifies a connection. Participant sends join then heartbeat every 10s, leave uses keepalive fetch; server supplies timestamps. Default local domain meet.jit.si may require moderator login and external network/camera permission. Client browser events are forgeable; do not describe this mode as tamper-proof.

Production PRESENCE_MODE=webhook ignores browser attendance writes. Trusted adapter POST JSON: workshopId, participantId, connectionId, action (join/leave), eventId. Headers: x-osw-timestamp (Unix seconds), x-osw-signature (hex HMAC-SHA256 of `timestamp.rawBody`, keyed with JITSI_WEBHOOK_SECRET). Adapter must map authenticated Jitsi user identity and unique reconnect connection IDs. No adapter is implemented yet.

## QR details

`src/lib/qr.ts`: jose HS256 with issuer/audience, sessionId, challengeId, nonce, issuedAt/expiresAt plus standard iat/exp. CSPRNG UUID per challenge, keyed nonce derivation, only nonceHash stored. Every window poll rotates expired challenge under workshop lock; previous challenge is invalidated. Only owner receives signed QR URL. Verification validates token, signature, expiry, current challenge, nonce, session, workshop status, role, registration, duplicate and open window. Phone login preserves `next=/attendance/verify?t=...` with local-only redirect validation.

## Certificate details

`src/lib/attendance-math.ts` clips presence to actual session, unions overlaps and compares unrounded milliseconds against 90%. `src/lib/workshops.ts` finalizes actualEndedAt, closes active segments and challenges, records attendance and issues certificate only for confirmed registrants with QR and qualifying presence. `src/lib/certificate.ts` embeds original PNG then covers variable sample text and draws dynamic name/workshop/speaker/date/attendance/ID/issue date/verification QR. Noto Sans/Tamil embedded. Public verification page exposes no email/password. PDF download is authorized.

## Exact next recommended task

1. Run a supervised manual flow with two browsers and a phone/camera: organizer start/end, participant join/leave/reconnect, QR scan/rotation, certificate download and public verification.
2. Implement or connect the production Jitsi trusted webhook bridge and run the same flow with `PRESENCE_MODE=webhook`.
3. When the user supplies a Neon project and Vercel account/team, apply the committed Prisma migration, configure fresh production secrets and deploy from `main`.
4. After every passing phase, commit/push `codex-dev` and advance `main` without rewriting history.
