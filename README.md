# OSW – Semmozhi Connect

Workshop and learning management portal for the Central Institute of Classical Tamil challenge.

## Current status

The local implementation is feature-complete for the supervised demo path and is being validated. Read HANDOFF.md for exact checks and remaining work. The five-device jury workflow, live Jitsi trust bridge and production deployment have not yet been accepted. This is not a production-complete release.

## Local development

Requires Node.js 20.9+ and npm. From this project folder:

```sh
npm install
npm run db:local
```

Keep the database process open. It starts a real local PostgreSQL instance bound to 127.0.0.1, generates random local credentials and an ignored `.env` if no `.env` already exists. It preserves data in ignored `work/local-postgres/`.

In another terminal:

```sh
npm run db:migrate
npm run db:seed
npm run dev
```

Open http://localhost:3000. Local demo accounts: `admin@osw.demo` / `Admin@123`; `participant@osw.demo` / `Participant@123`. No organizer is seeded. Create Prem through the Admin UI.

`npm run db:seed` requires `DEMO_MODE=true`. Demo reset only removes demo-marked records and preserves seeded users.

## Checks

```sh
npm run typecheck
npm run lint
npm run build
```

Test commands are defined in package.json. The current checkpoint includes seven attendance-math unit tests and a local API integration workflow with 81 assertions. `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` pass. The frontend includes route entrance motion, staggered panels/cards, hover/press feedback and a `prefers-reduced-motion` fallback.

## Deployment target

Vercel hosts Next.js and its server routes. Neon PostgreSQL stores persistent data. Configure the values listed in `.env.example` through deployment environment settings. Use a pooled DATABASE_URL and a direct DIRECT_URL for Prisma migrations. Set NEXT_PUBLIC_APP_URL to the final HTTPS origin so QR codes and request-origin checks use the deployed domain.

No Neon project, Vercel team or production URL is hard-coded. Deployment is deferred by user request. See HANDOFF.md and docs/DEMO_RUNBOOK.md.

## Attendance trust boundary

Local supervised demo uses Jitsi External API events and server receipt timestamps with 10-second heartbeats and bounded stale connections. These events can be forged by a malicious client. Production defaults to `PRESENCE_MODE=webhook` and needs an authenticated Jitsi installation plus a trusted callback adapter, as documented in HANDOFF.md. No production security claim is made for browser-only presence.

## Reference assets

The original PDF and certificate are user-supplied design references. Certificate source PNG is preserved. Derived heritage crops serve the UI. Noto Sans and Noto Sans Tamil fonts are included under the SIL Open Font License in public/assets/FONT-LICENSE.txt.
