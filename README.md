# Job Agent (backend)

Personal job-search agent for the Indian market. This is the Node backend: it will find jobs on Naukri, Hirist and other sites, score them against your profile, prepare tailored applications, and submit only after you approve.

Target sites and ground rules are in the Claude project doc `claude/target-sites.md`.

## Stack

- NestJS 12 + TypeScript (ESM)
- PostgreSQL + Prisma
- Vitest for tests
- Planned: Playwright (browser automation), pg-boss (scheduled jobs), Angular PWA frontend in a separate folder

## Run it

Needs Node 22+ and Docker.

```bash
cp .env.example .env
# put the output of this into VAULT_KEY in .env
openssl rand -base64 32

npm install
npm run db:up        # starts Postgres in Docker
npm run db:migrate   # creates the tables (name the first migration "init")
npm run start:dev
```

Check it: `curl http://localhost:3000/api/health` should return `{"status":"ok","db":"up"}`.

## Tests

```bash
npm test          # unit tests
npm run test:e2e  # API tests (database is mocked)
npm run lint
```

## What is here

| Path | What it does |
|---|---|
| `prisma/schema.prisma` | Tables: `Profile`, `SiteCredential`, `Job`, `JobMatch`, `Application` |
| `src/config/env.ts` | Checks `.env` at startup and refuses to start if something is wrong |
| `src/vault/` | AES-256-GCM encryption for site passwords and session cookies |
| `src/connectors/job-connector.ts` | The contract every job site connector implements |
| `src/jobs/dedupe.ts` | Spots the same job posted on two sites |
| `src/health/` | `GET /api/health` |

## Rules the code must keep

1. Site passwords and sessions are stored only through `VaultService`. Never in plain text, never in logs.
2. Nothing is submitted unless `Application.approvedAt` is set by the user.
3. On a CAPTCHA, OTP or unknown screen, a connector throws `NeedsUserError` and stops. No bypassing.
4. No LinkedIn or Wellfound login automation.

## Next

1. Naukri connector: login, search with filters, full posting.
2. Save jobs with dedupe, then score them against the profile.
3. Angular PWA: job list, job detail, approve screen.
