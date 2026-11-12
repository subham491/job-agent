# Target sites and apps

Decided 31 Oct 2026. Profile focus: Java full-stack, 4+ yrs, India.

## Phase 1: core (build first)
| Site | Role | Access | Agent does |
|---|---|---|---|
| Naukri | Main job board + recruiter visibility | Login (internal API) | Search, recommended jobs, full posting, daily profile refresh, apply (after user approval) |
| Hirist | Tech-only board (Naukri group) | Login | Search, full posting, apply (after user approval) |
| Instahyre | Recruiters reach out | Login | Read recruiter interest/inbox, surface matches; user accepts |
| Greenhouse / Lever / Ashby | Company career forms (startups, product cos) | No login | Fill and submit application form after review |
| Google for Jobs (JSearch) + Adzuna India | Discovery across LinkedIn, Indeed, Naukri listings | API key, no site login | Find postings, dedupe, score |
| Gmail + Google Calendar | Verification emails, recruiter replies, interviews | Official Google APIs (OAuth) | Read OTP/verify links, classify replies, draft answers, sync interviews |

## Phase 2: enterprise systems behind "apply on company site"
| Site | Access | Notes |
|---|---|---|
| Workday | Account per company (email+password, sometimes Google) | Biggest volume at MNCs; store account per tenant |
| SAP SuccessFactors | Email+password + email verify | Common at MNCs |
| Oracle Taleo / Oracle Recruiting Cloud | Email+password + email verify | Common at MNCs, banks |
| iCIMS | Email+password | Some US MNC India centres |
| Cutshort | Login | Startups; keep request rate low |

## Manual only (no login automation)
- LinkedIn: ban risk. Agent only reads job links the user pastes; user applies themselves.
- Wellfound: Cloudflare bot protection. Discovery via pasted links only.
- Indeed: covered through JSearch; no login.

## Out of scope
Shine, TimesJobs, foundit, Apna, Internshala, Freshersworld, iimjobs.

## Ground rules
- Login details stay encrypted on the user's own machine/server; never shared in chat.
- Google sign-in: user signs in once in a persistent browser profile; automation reuses the session.
- CAPTCHA/OTP/unknown screen: pause and hand over to the user. No CAPTCHA solving.
- Nothing is submitted without user review.
