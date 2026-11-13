# Job Agent

Personal job-search agent for the Indian market. It finds jobs on Naukri, scores them against the job seeker's own Naukri profile, applies after you press Apply, answers recruiter questions, and keeps the profile visible to recruiters. Other sites come later.

Target sites and ground rules are in `docs/target-sites.md`. Project context and decisions are in `CLAUDE.md`.

## Stack

- Backend: NestJS 12 + TypeScript (ESM), PostgreSQL + Prisma, Vitest
- Screens: Angular 22 in `web/`, served by the backend, installable as a PWA
- Playwright driving a visible Chrome window for Naukri
- pg-boss for the daily schedule
- Anthropic API for Angel mode and Profile boost

## Run it

Needs Node 22+ and Docker.

```bash
cp .env.example .env
# put the output of this into VAULT_KEY in .env
openssl rand -base64 32

npm install
npm --prefix web install
npm run db:up        # starts Postgres in Docker (skip if Postgres is installed on the PC)
npm run db:migrate   # creates the tables
npm run app          # builds the Angular screens and the backend, then starts the app
```

Open `http://localhost:3000`. The screens are the Angular app in `web/`, served by the backend.
Check the API alone: `curl http://localhost:3000/api/health` should return `{"status":"ok","db":"up"}`.

The agent drives a visible Chrome window (Naukri blocks headless browsers), so Chrome must be installed and the PC must be on and unlocked while it works.

Settings in `.env`:

| Name | What it does |
|---|---|
| `NAUKRI_USERNAME`, `NAUKRI_PASSWORD` | The Naukri login the agent uses |
| `ANTHROPIC_API_KEY` | Switches on Angel mode and Profile boost. Without it they are off |
| `AI_MODEL` | Optional. Defaults to `claude-opus-5-5` |
| `NAUKRI_REFRESH_CRON` | Optional. Runs the daily routine by itself, e.g. `0 9-21 * * *` (India time, once a day) |

While changing the screens, run `npm run start:dev` and `npm run web:dev` together and open `http://localhost:4200`.

## Tests

```bash
npm test          # unit tests
npm run test:e2e  # API tests (database is mocked)
npm run lint
npm run web:build # compiles the Angular screens
```

## What is here

| Path | What it does |
|---|---|
| `prisma/schema.prisma` | Tables: `Profile`, `SiteCredential`, `Job`, `JobMatch`, `Application`, `Answer`, `NaukriDay` |
| `src/connectors/naukri/` | Everything done on Naukri: search, postings, login, profile, performance, editing key skills and headline, applying |
| `src/jobs/` | Saving jobs, scoring them against the profile, the match list |
| `src/apply/` | The apply queue, the answer bank and Angel mode |
| `src/profile/` | Profile import, the recruiter-search report, the daily routine and Profile boost |
| `src/ai/` | The one place that calls Claude |
| `src/vault/` | AES-256-GCM encryption for site passwords and session cookies |
| `src/config/env.ts` | Checks `.env` at startup and refuses to start if something is wrong |
| `web/` | The Angular screens: Matches, Board, Profile, Answers |

## Using it

1. **Profile, then Daily routine, Run now** the first time. It imports the Naukri profile.
2. **Fetch new jobs** searches Naukri for the profile's desired roles and preferred cities, posted in the last day.
3. **Apply** on a job sends a real application in the background. It cannot be withdrawn.
4. **Board** shows where each application stands. A job under "Needs you" is waiting on a recruiter question; your answer is saved and reused.
5. **Angel mode** (top bar) lets the agent answer unknown questions itself. It never claims a skill that is not on the profile.

## Rules the code must keep

The full list is in `CLAUDE.md`. In short: nothing is submitted without the user's Apply press, the agent stops on a CAPTCHA or OTP instead of working around it, it never invents facts about the job seeker, and it keeps to 15 applications a day with one per company.

## Not built yet

Sign-in, more than one user, phone access through a tunnel, sites other than Naukri, company-site applications, resume tailoring, Gmail and Calendar.
