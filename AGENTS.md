# OSW continuation rules

Read HANDOFF.md, IMPLEMENTATION_PLAN.md and docs/OSW_REQUIREMENTS.md before changing code.

Use docs/Presentation1.pdf pages 2, 3, 4 and 5 as the login, Admin, Organizer and Participant visual references. Read public/assets/certificate-template.png before editing certificate generation. Preserve branding and supplied artwork. Database values replace every mock statistic.

Branch policy: `main` contains the latest tested checkpoint; `codex-dev` is the working branch. Never rewrite history or force push. Work may be checkpointed on codex-dev with explicit unfinished status. Merge to main only after relevant tests, TypeScript, lint and production build pass.

After every meaningful phase, verify it, update HANDOFF.md and IMPLEMENTATION_PLAN.md, scan staged files for secrets, commit with a descriptive message and push. Before ending a session, preserve all useful safe work in the private GitHub repository. Never claim a push succeeded without verifying the remote commit.

Never commit real database URLs, passwords, signing keys, API keys, authentication tokens, .env files, local PostgreSQL data, node_modules or build output. Only .env.example may contain environment settings, and those must be placeholders. The explicitly requested demo login passwords in seed.ts are fixtures, not production credentials. Never seed the Prem organizer.

Server-side authorization, real stored registrations, trusted timestamps, rotating attendance QR validation and the exact unrounded 90% threshold are mandatory. Demo mode must never bypass eligibility. Browser Jitsi events are suitable only for supervised demo attendance; production requires trusted server presence callbacks.

Do not wait for per-file approval. Public Vercel/Neon deployment is deferred until the user supplies account/project details. Preserve local work and report actual validation limits.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
