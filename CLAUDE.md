# Job Agent: project context

Read this first, then `README.md`. NestJS-specific notes are in @AGENTS.md.

## What we are building

A personal job-search agent for the Indian market. It is built by the developer for one job seeker (Java full-stack, about 4 years). Her details are imported from her own Naukri profile, never typed in by hand. It should:

1. Find jobs daily on Naukri (built), later Hirist, JSearch and Adzuna, dropping duplicates and jobs already seen.
2. Score each job against the profile and show strong matches with reasons and gaps (built).
3. Apply on Naukri after the user presses Apply, answering recruiter questions from saved answers, the profile, or Angel mode (built).
4. Keep the Naukri profile visible to recruiters with a daily routine, and propose headline and key-skill improvements (built).
5. Tailor a resume and cover letter per job using only facts in the profile (not started).
6. Read recruiter emails through Gmail, draft replies, and add interviews to Google Calendar (not started).
7. Track every application on a board (built for Naukri).

## Decisions already made (do not reopen without asking)

- Backend: Node, NestJS 12, TypeScript, ESM. Database: PostgreSQL with Prisma.
- Frontend: Angular 22 app in `web/` (standalone components, signals, no router), served by the backend from `web/dist/web/browser`. It is installable as a PWA. The design is a single dark look built on three colours chosen by the user: `#0B0B0C`, `#26272B` and `#FF5C00`, with orange kept for the main action, a strong fit, Angel mode when on, and "moved up" or "added".
- Naukri is reached through a visible Chrome window driven by Playwright, reading the JSON each real page fetches for itself. Calling Naukri's job API directly returns `406 recaptcha required`, and headless Chrome gets "Access Denied". Do not try to forge the token or hide the browser.
- pg-boss runs the daily routine schedule (no Redis). Applications use a simple in-process queue.
- AI goes through the Anthropic API with `ANTHROPIC_API_KEY` (not the Claude subscription login, because other people will use the app). `AI_MODEL` picks the model.
- Hosting: the user's own PC. Cloudflare Tunnel for phone access comes later. Because the agent needs a visible Chrome, it cannot run fully inside a plain Docker container.
- Target sites and phases: `docs/target-sites.md`. For now the focus is Naukri only.

## Rules the code must keep

1. Site passwords and session cookies are stored only through `VaultService` (AES-256-GCM). Known gap: the Naukri login is still plain text in `.env` (`NAUKRI_USERNAME`, `NAUKRI_PASSWORD`) until multi-user sign-in exists. Never put it in logs, code or chat.
2. Nothing is submitted unless the user approved it. Pressing Apply sets `Application.approvedAt`; the queue refuses to run without it.
3. On a CAPTCHA, OTP or unknown screen, a connector throws `NeedsUserError` and stops. No CAPTCHA solving or bypassing.
4. No LinkedIn or Wellfound login automation.
5. Keep request rates low and human-like: a pause before every page load, 15 applications a day at most, one per company a day.
6. Never invent facts about the job seeker. Angel mode answers availability and willingness favourably, but a skill or number that is not on the profile is answered truthfully (0 years, or No). Profile boost may only add key skills the profile already backs; the check in `src/profile/boost.ts` enforces it.
7. The Naukri account belongs to the job seeker, not the developer. Anything that changes what her profile says (headline, adding or removing skills) needs the user's go-ahead for that change. The daily routine only reorders key skills and re-saves.

## Where things stand

Built and working live against Naukri:

- `src/connectors/naukri/`: search with filters and paging, full posting, login, recommended jobs, profile import, performance report (7, 30, 90 days), key-skills and headline editors, and `apply` with the recruiter question box. One task runs at a time.
- `src/jobs/`: saving found jobs, rule-based scoring (skills 60, experience 25, location 15), matches, dismiss, summary.
- `src/apply/`: the apply queue, the answer bank, profile-based answers and Angel mode.
- `src/profile/`: profile sync, the report with keyword advice, the daily routine with its daily record, and Profile boost (propose, then apply).
- `src/ai/`: the one place that calls Claude.
- `web/`: Matches, Board, Profile (Report, Daily routine, Profile boost) and Answers screens.

Things learned about Naukri that are easy to forget:

- A search page keeps its filters only for one keyword phrase and one city in the path; later pages only through the site's own pagination link.
- Key skills are capped at 250 characters in total. In that form a comma commits a typed skill, typing must be slow, and saving it unchanged still moves "last modified".
- The "has questions" flag on a job is unreliable: pressing Apply can submit at once. Questions come one at a time and Naukri keeps the answers already given.
- Company-site jobs need an account on the company's own site and are not automated.

Not verified end to end yet: a brand-new application sent from the app's Apply button, answering a question on the Board, and Angel mode or Profile boost run from the screens.

Known gaps: no sign-in on the app (keep it on the PC until there is), single user only, cross-site duplicate dropping is not applied, the dedupe key's city and title handling is crude, and applications go out with the resume already on Naukri.

## Next steps

1. Prove the live apply path from the app with one fresh job, with and without a question.
2. Sign-in, then per-user Naukri logins in the vault and per-user browser sessions (the app is meant for 4 to 5 people).
3. Cloudflare Tunnel and phone install.
4. Hirist, then the other sources in `docs/target-sites.md`.
5. Resume tailoring, then Gmail and Calendar.

## Working style

- The user wants direct, practical answers and prices in INR.
- Ask before pushing to `main` or changing a decision above.
- Show a demo of a new screen before building it for real.
- Backend checks: `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e`. Screens: `npm run web:build`. Run everything: `npm run app`.
