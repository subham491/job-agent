# Job Agent: project context

Handed over from a planning chat on claude.ai (12 Nov 2026). Read this first, then `README.md`. NestJS-specific notes are in @AGENTS.md.

## What we are building

A personal job-search agent for the Indian market, for Subham (Java full-stack, 4+ years, Bangalore). It should:

1. Find jobs daily on Naukri and Hirist (with login) and via JSearch and Adzuna (no login), dropping duplicates and jobs already seen.
2. Score each job against the profile and show only strong matches, with reasons.
3. Tailor a resume and cover letter per job using only facts in the profile. Missing skills are shown as gaps, never invented.
4. Fill applications (Naukri apply, Greenhouse, Lever, Ashby, later Workday) only after the user approves.
5. Refresh the Naukri profile daily to stay visible to recruiters.
6. Read recruiter emails through Gmail, draft replies with CTC and notice period, and add interviews to Google Calendar.
7. Track every application on a board: found, applied, interview, offer.

## Decisions already made (do not reopen without asking)

- Written from scratch. The old `subham491/Naukri_agent` repo is not reused. Dossier (AienTech/dossier) was looked at as a reference only.
- Backend: Node, NestJS 12, TypeScript, ESM. Database: PostgreSQL with Prisma.
- Frontend (not started): Angular PWA that installs on Android. A real APK may come later via Capacitor.
- Planned libraries: Playwright for browser automation and persistent login sessions, pg-boss for scheduled jobs (no Redis).
- Hosting: start on the user's own PC with Docker (Cloudflare Tunnel for phone access). Cloud later only if it needs to be always on.
- Target sites and phases: `docs/target-sites.md`.
- The Apify Naukri scraper was rejected (no search filters). Call Naukri's search API ourselves with keyword, location and experience filters.

## Rules the code must keep

1. Site passwords and session cookies are stored only through `VaultService` (AES-256-GCM). Never plain text, never in logs, never in chat.
2. Nothing is submitted unless the user approved it (`Application.approvedAt` is set).
3. On a CAPTCHA, OTP or unknown screen, a connector throws `NeedsUserError` and stops. No CAPTCHA solving or bypassing.
4. No LinkedIn or Wellfound login automation.
5. Google sign-in is done once by the user in a persistent browser profile; automation reuses that session.
6. Keep request rates low and human-like. No bulk auto-apply.

## Where things stand

Done (commit "Scaffold NestJS backend"):
- NestJS app with `GET /api/health`, env validation (`src/config/env.ts`).
- Prisma schema: `Profile`, `SiteCredential`, `Job`, `JobMatch`, `Application`.
- `VaultService` with tests, `JobConnector` interface, cross-site `dedupeKey` with tests.
- Docker Compose for Postgres. Build, lint, unit and e2e tests pass.

Not yet verified:
- `npm run db:migrate` has never been run against a real Postgres. Run it first and fix anything it reports.
- `.npmrc` sets `legacy-peer-deps=true` because plain `npm install` crashed in the cloud sandbox (npm "edgesOut" bug). Remove it if install works without it locally.

## Next steps, in order

1. Local setup: `.env` with a generated `VAULT_KEY`, `npm install`, `npm run db:up`, `npm run db:migrate`, `npm run start:dev`, check `/api/health`.
2. Naukri connector (`src/connectors/naukri/`): search with keyword, location, experience and freshness filters, plus full posting. No login needed for these. Then login, recommended jobs and daily profile refresh.
3. Save found jobs with dedupe, then score them against the profile.
4. Profile API (create and edit the single user profile, including CTC and notice period).
5. Angular PWA in `web/`: job list, job detail, approve screen.
6. Resume tailoring, apply flows, then Gmail and Calendar.

## Working style

- The user wants direct, practical answers and prices in INR.
- Ask before pushing to `main` or changing a decision above.
- Tests run on Vitest (`npm test`, `npm run test:e2e`); lint with `npm run lint`.
