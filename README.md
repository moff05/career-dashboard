# Career Dashboard

A personal AI-powered job search command center built with Next.js, TypeScript, and Claude. Tracks applications, surfaces leads, generates cover letters, runs mock interviews, and advises on application strategy — all from one dashboard.

> **Note:** This is a single-user personal tool. It has no auth layer — whoever runs it has full access to the data.

**Live:** [career-dashboard-ten.vercel.app](https://career-dashboard-ten.vercel.app)

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
- **Application strategy advisor** — ranked list of which jobs to prioritize and why, based on fit score, deadline, and stage

### Analytics
- Applications by week, response rate, fit score distribution, avg days per stage

### Timeline
- Vertical timeline merging manual milestones with job deadlines from the tracker

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 App Router |
| Language | TypeScript |
| Database | Turso (libsql, cloud SQLite) |
| AI | Anthropic Claude (Sonnet 4.6 + Haiku 4.5) |
| Deployment | Vercel |

---

## Running locally

You will need an [Anthropic API key](https://console.anthropic.com) and a free [Turso](https://turso.tech) database.

```bash
git clone https://github.com/moff05/career-dashboard.git
cd career-dashboard
npm install
```

Create `.env.local`:
```
ANTHROPIC_API_KEY=sk-ant-...
TURSO_DATABASE_URL=libsql://...
TURSO_AUTH_TOKEN=...
```

```bash
npm run dev   # http://localhost:3000
npm run build # production check
```

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
└── api/            # All backend routes (jobs, connections, interview, strategy, …)

lib/
├── db.ts           # Turso singleton + schema
├── ai-context.ts   # Builds system prompt from resume + memories + jobs
└── resume-parser.ts
```
