# Career Dashboard

An AI-powered job search command center built with Next.js, TypeScript, and Claude. Tracks applications, surfaces leads, generates cover letters, and runs mock interviews — all from one dashboard.

> **Note:** Multi-user, no accounts. A 4-step setup flow (name → background → resume → your own Anthropic API key) creates a local identity stored in your browser; every visitor gets their own scoped data. Your API key is stored client-side only and sent per-request via headers — it's never saved on the server.

**Live:** [career-dashboard-ten.vercel.app](https://career-dashboard-ten.vercel.app) — visit and run through setup to use it with your own data and API key.

---

## Features

### Job Tracker
- Import any job posting from a URL in one click (handles JS-rendered pages via Jina reader)
- Multi-source import: paste recruiter emails, LinkedIn messages, or upload a screenshot — Claude reads them all and extracts structured fields
- Company-grouped rows with collapsible expand, inline status updates, column sorting, and search/filter
- AI match scorecard (5 categories × 100) auto-fires on panel open, cached per session

### AI-Powered Detail Panel
- **Gaps & positioning** — what is missing for this role and how to frame your background against it
- **Tailored resume bullets** — which bullets to lead with and how to rephrase them
- **Cover letter generator** — full draft in seconds, prefilled from the job record
- **Network section** — save contacts at each company, track outreach status (not reached out → reached out → responded → warm), company-keyed so contacts appear across all jobs at that company

### Discover
- Auto-generated lead feed (AI, refreshes every 10 min) constrained to internship-friendly locations
- Purple dot on lead cards when you already have a contact at that company
- Company research tool: search any company or role type → overview, culture signals, open role types, personalized fit reasoning

### Coach
- Streaming chat with persistent memory extraction — facts about you are saved and used in every future AI call
- **Mock interview mode** — pick behavioral, product, technical, case, or fit; answer 5 questions; get per-answer feedback and a final assessment
- Quick-action prefills and cover letter shortcut from tracker

### Home Dashboard
- Pipeline stats, upcoming deadlines, follow-up nudges
- **Priorities** — deadlines, stale follow-ups, and interview prep, ranked by urgency then by fit score within each
- **Weekly Brief** — AI-generated headline, priority actions, and weekly focus

### Analytics
- Applications by week, response rate, fit score distribution, avg days per stage

### Timeline
- Vertical timeline merging manual milestones with job deadlines from the tracker

### Profile
- **Candidate Strength** — a brutal, rubric-scored readiness assessment (relevant experience, quantified impact, technical depth, academic credibility, differentiation), each category anchored to explicit point bands so repeat scoring stays consistent instead of swinging
- **Usage & Cost** — running total of what your own Anthropic API key has spent on this dashboard, with a per-feature cost breakdown (estimated from token counts and published pricing, including the web search per-call fee)

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 App Router |
| Language | TypeScript |
| Database | SQLite (local file by default, Turso/libsql for cloud deploys) |
| AI | Anthropic Claude (Sonnet 4.6 + Haiku 4.5) |
| Deployment | Vercel |

---

## Running locally

No environment variables are required to get started — your Anthropic API key is entered in the in-app setup flow, not a config file.

```bash
git clone https://github.com/moff05/career-dashboard.git
cd career-dashboard
npm install
npm run dev   # http://localhost:3000 — walks you through setup on first visit
npm run build # production check
```

By default the app uses a local SQLite file at `data/career.db`. For a cloud-hosted deployment (e.g. Vercel), add a free [Turso](https://turso.tech) database via `.env.local`:
```
TURSO_DATABASE_URL=libsql://...
TURSO_AUTH_TOKEN=...
```

An optional `ANTHROPIC_API_KEY` in `.env.local` can serve as a server-side fallback for admin/dev use, but normal users never need to set one — see `.env.local.example`.

---

## Architecture

```
app/
├── tracker/        # Job applications + detail panel
├── discover/       # AI lead feed + company research
├── coach/          # Chat + mock interview mode
├── analytics/      # Pipeline stats
├── timeline/       # Career milestones
├── profile/        # Editable profile + AI summary
├── memory/         # Extracted memory CRUD
└── api/            # All backend routes (jobs, connections, interview, usage, …)

lib/
├── db.ts           # SQLite/Turso client singleton + schema
├── ai-context.ts   # Builds system prompt from resume + memories + jobs
└── resume-parser.ts
```
