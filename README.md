# Career Dashboard

A job tracker built to feel like a great spreadsheet, with two AI features that actually earn their place: import any job posting and get an in-depth AI fit score, and a coach that knows your background. Built with Next.js, TypeScript, and Claude.

> **Note:** Multi-user, no accounts. A 4-step setup flow (name → background → resume → your own Anthropic API key) creates a local identity stored in your browser; every visitor gets their own scoped data. Your API key is stored client-side only and sent per-request via headers — it's never saved on the server.

**Live:** [career-dashboard-ten.vercel.app](https://career-dashboard-ten.vercel.app) — visit and run through setup to use it with your own data and API key, or restore from a backup file straight from the landing page.

---

## Features

### Job Tracker
- Import a job posting from a URL, paste the job description directly with no link at all, or both — handles JS-rendered pages via Jina reader, and a multi-source pass (extra text, a second link, a screenshot) feeds one extraction call
- Company-grouped rows with collapsible expand, inline status updates, column sorting, and search/filter
- AI match scorecard (5 categories × 100) auto-fires on panel open, cached per session — this is the core AI feature the tracker is built around

### AI-Powered Detail Panel
- **AI Score** — the 5-category fit scorecard above, in depth
- **Gaps & positioning** — what is missing for this role and how to frame your background against it
- **Tailored resume bullets** — which bullets to lead with and how to rephrase them
- **Cover letter generator** — full draft in seconds, with tone and angle controls, prefilled from the job record
- **Network section** — save contacts at each company, track outreach status (not reached out → reached out → responded → warm), company-keyed so contacts appear across all jobs at that company

### Coach
- General streaming chat that knows your resume, profile, memories, and tracked jobs — not a place for job-specific analysis, which lives entirely in the detail panel above
- Persistent memory extraction — facts about you are saved after each exchange and used in every future AI call, with the date attached so a newer fact (or whatever you're saying right now) outweighs a stale one instead of the AI anchoring on an old stated goal
- Quick-action prefills: "What should I apply to?", "Interview prep" (a conversation, not a simulation), "Cold outreach"

### Home Dashboard
- Pipeline stats, upcoming deadlines, follow-up nudges
- **Priorities** — free, no AI call. Deadlines, stale follow-ups, and interview prep, ranked by urgency then by fit score within each bucket

### Profile
- **Candidate Strength** — a brutal, rubric-scored readiness assessment (relevant experience, quantified impact, technical depth, academic credibility, differentiation). Each category is constrained to an explicit set of anchored point values via structured outputs, so repeat scoring stays consistent instead of swinging a point or more between clicks
- **Usage & Cost** — running total of what your own Anthropic API key has spent on this dashboard, with a per-feature cost breakdown (estimated from token counts and published pricing, including the web search per-call fee)
- **Backup & Restore** — full data export/import; also reachable from a fresh browser via the landing page's restore shortcut, no need to complete setup first

---

## What's deliberately not here

This app went through a reshape (June 2026) to cut everything that wasn't pulling its weight as either "removes real friction" or "proves real understanding":

- **No automated job discovery/lead-hunting agent** — it existed, wasn't reliable, and wasn't specific enough to actually-wanted roles to be worth the complexity. Import a job yourself; the AI score tells you if it's worth pursuing.
- **No company research tool** — you can ask Google.
- **No mock interview mode** — a text Q&A loop doesn't simulate a real interview closely enough to be worth it.
- **No separate "weekly brief" or "application strategy" AI digest** — both were a second and third AI surface restating what the free Priorities card already shows for nothing.
- **No analytics or timeline pages** — low value for the data most users actually have tracked.

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

An optional `ANTHROPIC_API_KEY` in `.env.local` can serve as a server-side fallback for local/admin use — gated out of production entirely, so it never substitutes for a real visitor's own key on the live deployment. See `.env.local.example`.

---

## Architecture

```
app/
├── welcome/        # Landing page — get started, or restore from backup
├── tracker/        # Job applications + detail panel (AI score, gaps, bullets, cover letter, connections)
├── coach/          # General chat only
├── profile/        # Editable profile + Candidate Strength + Usage & Cost
├── memory/         # Extracted memory CRUD
└── api/            # All backend routes (jobs, connections, chat, usage, …)

lib/
├── db.ts           # SQLite/Turso client singleton + schema
├── user.ts         # getUserId / getApiKey — fail-closed in production
├── ai-context.ts   # Builds system prompt from resume + dated memories + jobs
├── usage.ts        # Per-call cost computation and logging
└── resume-parser.ts
```
