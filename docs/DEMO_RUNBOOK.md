# Jury demo runbook

Status: planned acceptance procedure. Not yet run successfully end-to-end.

## Start locally

Run `npm run db:local` and keep it open. In another terminal run `npm run db:migrate`, `npm run db:seed`, then `npm run dev`. Open http://localhost:3000 in separate browser profiles or isolated browsers so cookies remain independent.

Local generated settings use DEMO_MODE=true, PRESENCE_MODE=browser and meet.jit.si. Jitsi requires internet connectivity; the moderator may need to authenticate. Phone camera/microphone access requires a trusted HTTPS origin for a true multi-device rehearsal. localhost on a phone refers to that phone, not this computer. Use a later configured HTTPS deployment or an explicitly configured trusted HTTPS development endpoint for physical devices; update NEXT_PUBLIC_APP_URL accordingly. Do not claim the five-device flow was verified by single-browser testing.

## Demonstration sequence

1. Admin: sign in with seeded admin@osw.demo / Admin@123.
2. Create organizer Prem, prem@osw.demo, department Tamil / AI, temporary password Prem@123. Do not seed this organizer.
3. Separate organizer session: sign in as Prem. Create Tamil AI – One Day Workshop, online, future registration deadline, speaker Prem, sensible capacity. Publish.
4. Participant session: sign in with participant@osw.demo / Participant@123. Wait for notification without refresh, open workshop, register. Confirm it persists.
5. Organizer: start workshop, open embedded meeting and complete Jitsi moderator sign-in if requested.
6. Participant: join embedded meeting promptly. Confirm organizer attendance shows a join and increasing duration.
7. Organizer: trigger demo attendance check. Scan current QR using the same participant account on the phone. After login, verification resumes without name/email entry.
8. Confirm verified timestamp, repeat scan gives already verified. Wait for a 120-second rotation and confirm a previous QR fails for an unverified registered account.
9. Keep real presence above 90% of actual elapsed session runtime. End workshop. No manual attendance edit or demo bypass is allowed.
10. Participant: certificate appears, view and download PDF. Check dynamic details and template artwork.
11. Public browser/device: open certificate QR and confirm valid record without login and no private email.
12. Admin: inspect audit log. For a repeat demonstration, open Reports and type RESET to remove demo data while keeping seeded accounts.

## Mandatory negative cases

Participant Admin endpoint call denied; other organizer edit denied; unregistered QR denied; invalid signature denied; expired/previous QR denied; duplicate scan handled; QR without meeting presence cannot issue certificate; exact 90% eligible and 89.99% ineligible; overlapping reconnect segments cannot double count; disabled organizer cannot keep using an old session.

## Verified automated rehearsal

The production build passes the 81-assertion local API workflow, including a real two-minute QR rotation and a generated certificate PDF. `npm test` covers attendance boundaries and browser presence request ordering. `npm run test:presence` uses PostgreSQL and real time to verify concurrent webhook retries, failure rollback, closed connections, reconnect isolation and a stale heartbeat after 31 seconds. These tests supply meeting events themselves and do not establish that Jitsi media or physical cameras worked.

During the manual rehearsal, leave and rejoin Jitsi while remaining on the same workshop page. Confirm the reconnect produces a separate segment. Temporarily disconnect the participant network for over 30 seconds; after reconnection confirm that the unobserved gap is excluded and attendance resumes from a new server timestamp. Ending the workshop must hide QR open/close controls.
