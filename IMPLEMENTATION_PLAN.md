# OSW implementation plan

Reference review completed before coding: docs/Presentation1.pdf pages 2–5 and public/assets/certificate-template.png. The original reference assets are copied without modification. The workspace had no existing application; user authorized building from scratch.

1. PostgreSQL schema and migrations with Prisma. Seed only Admin and Participant.
2. Opaque, revocable, database-backed sessions in HTTP-only cookies, bcrypt passwords, server role checks, origin validation and persistent authentication throttling.
3. Admin organizer management and database-backed monitoring.
4. Owner-scoped workshop creation, editing and state transitions.
5. Discovery, capacity-safe registration and cancellation.
6. Database notifications with 3-second polling and read acknowledgement.
7. Embedded Jitsi External API meeting and authenticated room access.
8. Reconnect segments with server timestamps, overlapping interval union and heartbeat expiry. Browser events support supervised demos; production uses authenticated Jitsi server webhooks because browser events are forgeable.
9. Signed 120-second rotating attendance challenges, session locking, authenticated verification and automatic midpoint opening.
10. Actual runtime attendance calculation; compare unrounded ratio against 90%.
11. Original certificate background, dynamic fields, certificate identifier, PDF generation and Unicode fonts.
12. Public certificate verification and a separate permanent verification QR.
13. Registered-user community, organizer announcements and learning material links.
14. Explicitly marked demo records and Admin-only RESET confirmation, preserving seeded accounts.
15. Responsive role dashboards matching approved references without copied example statistics.
16. Security/integration tests, TypeScript, lint, production build, browser checks and deployment.

## External dependencies

Public deployment needs an accessible Neon project and authenticated Vercel account. Jitsi meeting creation on meet.jit.si can require moderator sign-in. Tamper-resistant attendance requires an authenticated Jitsi deployment with server-side presence callbacks. Physical camera/phone scanning and five-device verification require real devices.

User update: continue locally with environment placeholders. Do not provision/deploy Neon or Vercel until connection details are provided. Preserve work in a PRIVATE GitHub repository; main is tested, codex-dev is the working branch. Commit and push after every meaningful tested phase. No history rewrite or force push.

## Checkpoint status

Initial implementation for phases 1–15 exists. Local PostgreSQL migration and seed passed. Whole-project TypeScript, lint and production build passed. Security/integration tests and manual browser/Jitsi/certificate inspection remain. No full jury acceptance claim. See HANDOFF.md for concrete known bugs and exact next task.

## Certificate treatment

Keep supplied PNG byte-for-byte. Cover only variable sample text with a white fill in the generated PDF, then draw participant, workshop, speaker, date, attendance, certificate ID, issue date and QR. Keep the printed signatures/artwork as supplied. No assertion is made that the sample signatories personally signed dynamically issued certificates.
