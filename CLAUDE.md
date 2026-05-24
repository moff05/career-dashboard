# Career Dashboard — CLAUDE.md

Personal career tracking dashboard for Nicholas Moffett. Built with Next.js 16 (App Router), TypeScript, Tailwind CSS, better-sqlite3, and the Anthropic SDK.

## Who this is for

**Nicholas Moffett**
- Email: nicmoffett5@gmail.com | Phone: (470) 421-5955
- LinkedIn: www.linkedin.com/in/nicholas-moffett
- University of Miami Herbert Business School — BS Business Administration in Business Technology
- Minors: Mathematics, Computer Science | GPA: 3.71/4.00 | Graduating May 2027
- Honors: President's Scholar, Provost's Honor Roll (3x), Dean's List (4x), National Hispanic Recognition Scholar

**Career situation:**
- College junior, 1 year left
- Currently interning at Goldenrod Companies (CRE tech/investment, Omaha NE) — AI workflow automation
- Co-founder of N&S Digital LLC (StackingPlanner.com SaaS, CRE automation tools)
- Previously: Eduply (AI Prompt Engineer), SK Commercial Realty (intern)
- Looking for: fall 2026 internships, spring 2027 internships, full-time starting May 2027

**Target cities (post-grad full-time):** San Francisco, New York City, Atlanta, Dallas-Fort Worth, Miami
**International (open, lower priority):** Sydney, London, Dubai

**Internship location constraint:** Must be Remote or Miami, FL — he's still in school at University of Miami.

**Skills:** Claude, Excel, Python, Java, n8n, ChatBotKit, Zapier, PowerPoint
**Certs:** Microsoft Office Specialist Excel; Intermediate Python (DataCamp); AWS Cloud Foundations

**Career interests:** PropTech / CRE technology, AI automation tools, SaaS, business technology. Does NOT have strong CS fundamentals — profile is operator/builder, not traditional SWE. Realistic target roles: PropTech Analyst, AI Product Manager, Business Technology Analyst, Solutions Engineer, Real Estate Technology Associate.

**Companies he's interested in:** Anthropic, OpenAI, Google, Meta, CBRE, JLL, Cushman & Wakefield, Genesys, ServiceNow, Booz Allen Hamilton, Amazon, Microsoft, Y Combinator, NVIDIA, Palantir, Zapier, n8n, LinkedIn, MLB, NHL, NBA, Fortress Investment Group.

## Core workflow

The primary use case is: **find a job posting → paste the URL → it gets parsed and added to the tracker**. Nicholas does not manually enter job data unless the URL import fails. No data is seeded into the jobs table — every entry must come from a real link or manual entry.

## How to run

```bash
cd career-dashboard
npm run dev        # starts on localhost:3000
npm run build      # production build check
```

Requires `.env.local` with:
```
ANTHROPIC_API_KEY=sk-ant-...
```

## Architecture

```
career-dashboard/
├── app/
│   ├── layout.tsx              # Sidebar nav (Jobs, Discover, Coach, Analyze, Timeline, Profile, Memory)
│   ├── page.tsx                # Redirects to /tracker
│   ├── tracker/page.tsx        # Job tracker — URL import primary, company groups, detail panel
│   ├── discover/page.tsx       # AI lead discovery — grid layout, location badges, auto-refresh
│   ├── coach/page.tsx          # Streaming chat with memory extraction + quick actions
│   ├── analyze/page.tsx        # JD Fit Analyzer + Weekly Brief (two tabs)
│   ├── timeline/page.tsx       # Vertical timeline — manual events + job deadlines from tracker
│   ├── profile/page.tsx        # Editable profile + AI strength summary
│   ├── memory/page.tsx         # Memory CRUD panel
│   └── api/
│       ├── analyze/jd/route.ts         # POST: JD fit analysis (Haiku, returns JSON score/gaps/positioning)
│       ├── brief/route.ts              # GET: weekly career brief (Haiku, returns JSON)
│       ├── chat/route.ts               # Streaming Claude chat
│       ├── chat/history/route.ts       # Load chat history by session
│       ├── chat/memories/route.ts      # Auto-extract memories (Haiku)
│       ├── discover/route.ts           # AI job search (web_search beta)
│       ├── discover/suggestions/route.ts  # Auto leads (Haiku, ~9s)
│       ├── jobs/route.ts               # GET all jobs, POST new job
│       ├── jobs/[id]/route.ts          # PUT full update, PATCH partial update, DELETE
│       ├── jobs/import/route.ts        # POST: fetch URL, strip HTML, Claude extracts job data
│       ├── memories/route.ts           # GET all, POST new memory
│       ├── memories/[id]/route.ts      # PUT, DELETE memory
│       ├── profile/route.ts            # GET, PUT profile
│       ├── profile/summary/route.ts    # POST: AI candidate summary
│       ├── timeline/route.ts           # GET all, POST event
│       └── timeline/[id]/route.ts      # PUT, DELETE event
├── lib/
│   ├── db.ts                   # SQLite singleton, table creation, seed data (no fake jobs)
│   ├── ai-context.ts           # Builds system prompt (resume + memories + jobs)
│   └── resume-parser.ts        # PDF parse on first run, fallback to hardcoded text
├── data/
│   └── career.db               # SQLite database (auto-created)
└── .env.local                  # ANTHROPIC_API_KEY (not committed)
```

## Database schema

**`profile`** — Single row (id=1). Nicholas's info hardcoded on seed.
**`jobs`** — Job applications. Fields: company, title, type, status, match_score, posting_date, deadline, url, description, salary_range, location, source, notes. Starts empty — no fake seed data.
**`chat_messages`** — Persistent chat history grouped by session_id (UUID per browser session).
**`memories`** — AI-extracted memory items. Categories: preference, goal, insight, company, role, location, skill, other.
**`timeline_events`** — Career milestones/deadlines. Types: milestone, deadline, goal, application. Seeded with key dates (recruiting seasons, graduation).
**`resume`** — Parsed resume text (id=1). Checked on startup; if empty, PDF is parsed and stored.

## AI context (system prompt)

Every AI call receives:
- Full resume text
- All memories grouped by category
- Job tracker summary (all jobs by status)
- Target cities and graduation date
- Today's date (dynamic)

Built by `lib/ai-context.ts` → `buildSystemPrompt()`.

## Memory system

After each chat response, `/api/chat/memories` is called with the user message + AI response. A lightweight Haiku call extracts any new facts about Nicholas and saves them to the memories table. The coach page shows a toast notification when a memory is saved.

## Company badges

Companies display vibrant hash-based initials badges — no network calls, no Clearbit dependency. Color is deterministic per company name using a 12-color palette. `CompanyBadge` component is defined locally in both `tracker/page.tsx` and `discover/page.tsx`.

## Job Tracker features

- **URL import (primary)** — "Import from URL" button opens a two-step modal: fetch → review/edit → save. Combines up to 4 context sources before extracting structured fields. Fields not found in any source are left blank — no data is invented.
- **Multi-source context** — Step 1 of the import modal accepts: (1) primary URL, (2) paste area for recruiter messages/copied JD/email text, (3) optional second URL (LinkedIn post, company page, etc.), (4) screenshot upload — Claude reads the image with vision and extracts text. All sources are concatenated and sent together to Haiku for a single extraction pass. If the URL fails (LinkedIn auth wall, JS-rendered page), the other sources fill the gap.
- **Source detection** — URL hostname mapped to source label (LinkedIn, Greenhouse, Lever, Workday, Handshake, etc.)
- **Company groups** — jobs grouped by company, collapsible, with aggregate match score. New imports auto-group under existing companies when company name matches.
- **Inline status change** — click status badge to open dropdown; uses PATCH for partial update
- **Detail slide panel** — click any job row to open a right slide-over with all fields: location, deadline countdown, source, salary, application URL, notes, description, plus Edit and Cover Letter buttons
- **Search + filter** — text search on company/title; status filter chips
- **Column sorting** — 3-click cycle (asc → desc → reset) on any column header
- **Smart deadline countdown** — Expired / Today! / Xd left / Xd / month day
- **Cover letter shortcut** — FileText button prefills Coach page: `/coach?prefill=cover-letter&company=...&title=...`
- **Empty state** — tracker starts empty; no fake data; prompts user to import from URL

## Analyze page features (two tabs)

### JD Fit Analyzer
- Paste any job description → "Analyze Fit"
- Returns structured JSON: fit_score (1-10), verdict (Strong Match / Good Fit / Stretch / Not a Match), what_you_have, what_you_lack, how_to_position, should_apply, role_type, top_keywords
- Model: Haiku (~10-15 seconds)
- API: `POST /api/analyze/jd` — requires `{ jd: string }` in body

### Weekly Brief
- One click → generates a personalized weekly career snapshot
- Returns structured JSON: headline, priority_actions (with urgency: today/this-week/soon), recommended_roles (with example companies), this_week_focus, honest_assessment
- Fully personalized — reads resume, job tracker, and saved memories via `buildSystemPrompt()`
- Model: Haiku (~15 seconds)
- API: `GET /api/brief`

## Discover page features

- **Your Leads** — AI-generated leads loaded on mount (~9s via Haiku), cached in sessionStorage for 10 min, auto-refresh in background
- **"Updated X min ago"** — freshness timestamp shown under "Your Leads" heading
- **Location badges** — internships get "Student-friendly" (green) if Remote/Miami, "On-site only" (red+dimmed) if elsewhere
- **Source transparency** — banner explains leads are AI-generated; companies are real, verify open roles
- **Search** — manual search uses web search beta for live postings; falls back to knowledge if beta unavailable
- **Internship location enforcement** — both suggestions and search prompts constrain internships to Remote or Miami, FL

## Timeline features

- Vertical chronological timeline of career milestones, deadlines, and goals
- **Tracker sync** — job deadlines from the jobs table are pulled on load and merged into the timeline as "application" type events, sorted by date. These are read-only (no toggle/delete) and labeled "from tracker"
- Manual events can be added, toggled done, and deleted
- Progress bar shows % through the date range and done/total count

## API notes

- `PUT /api/jobs/[id]` — full update, requires all fields
- `PATCH /api/jobs/[id]` — partial update (e.g., status only); used by inline status dropdown
- `DELETE /api/jobs/[id]` — hard delete
- `POST /api/jobs/import` — `{ url, extraText?, imageBase64?, imageMediaType?, extraLink? }` → combines all provided context, extracts with Haiku, returns `{ company, title, location, type, deadline, salary_range, description, url, source, warning? }`. Image must be one of `image/jpeg | image/png | image/gif | image/webp`.
- `POST /api/jobs/[id]/analyze` — no body required → reads job from DB + full system prompt, returns `{ categories: [{name, score, rationale}], total, summary }`. 5 categories scored 0–100: Industry Fit, Skills Match, Role Alignment, Location Match, Growth Potential.

## Design system

- Background: `#1a1a1a`
- Sidebar: `#181818`
- Card surfaces: `#1e1e1e` / `#222`
- Borders: `#242424` / `#2a2a2a`
- Primary text: `#e8e8e8` / `#d0d0d0`
- Muted text: `#555` / `#666`
- Accent: `#d97706` (amber — matches Claude brand)
- Active sidebar: 2px left amber border + `#222` bg
- Status colors: saved=gray, applied=blue, interviewing=amber, offer=green, rejected=red
- Company badge palette: 12 vibrant colors, hash-derived per company name

## AI model

- Chat + coach: `claude-sonnet-4-6`, streaming via `anthropic.messages.stream()`
- Discovery search: `claude-sonnet-4-6` with `betas: ['web-search-2025-03-05']` and `web_search_20250305` tool; fallback to knowledge-only on error
- Suggestions (auto-leads): `claude-haiku-4-5-20251001`, non-streaming, ~9s response
- Memory extraction: `claude-haiku-4-5-20251001`, non-streaming, lightweight prompt
- Profile summary: `claude-sonnet-4-6`, returns JSON `{strengths, gaps, readiness_score, summary}`
- JD fit analysis: `claude-haiku-4-5-20251001`, non-streaming, ~10-15s
- Weekly brief: `claude-haiku-4-5-20251001`, non-streaming, ~15s
- URL import parsing: `claude-haiku-4-5-20251001`, non-streaming, ~5-10s

## Rate limit note

`claude-sonnet-4-6` has a 30,000 input tokens/minute org limit. All on-load background calls (suggestions, import parsing, JD analysis, brief) use Haiku which has a separate limit and is significantly faster. Only use Sonnet for user-initiated chat and manual search.

## Updating personal info

All Nicholas's info is hardcoded in `lib/db.ts` `seedData()`. The seed only runs when the DB is empty (fresh install). To re-seed: delete `data/career.db` and restart.

To update profile without deleting DB: use the Profile page UI (editable fields) or run SQL directly on `data/career.db`.

**Important:** Deleting `data/career.db` resets ALL data including jobs and memories. There is no separate reset for just the jobs table.

## Resume PDF

Located at: `../NicholasMoffettResume(5:15).pdf` (one level above `career-dashboard/`).
On first API call, `lib/resume-parser.ts` checks the `resume` table. If empty, parses the PDF and stores the text. If PDF parsing fails, uses the hardcoded fallback text in `lib/db.ts`.

## Priority roadmap

### Done
1. URL import → parse → add to tracker (core workflow)
2. Multi-source import context (paste text, screenshot vision, extra link)
3. Empty tracker (no fake data)
4. Company grouping / collapsible rows
5. Job detail slide panel
6. Match analysis scorecard (5 categories × 100, auto-fires on panel open, cached per session)
7. Timeline shows job deadlines from tracker
8. JD Fit Analyzer
9. Weekly Brief

### Next
10. Deploy to Vercel — app must be hosted for alerts/nudges to work; usable anywhere
11. Email deadline alerts (7d + 3d before deadline) — needs hosting + email service (Resend recommended)
12. Follow-up nudge — flag "applied" jobs with no status change after 14 days

### Later
11. Full cover letter generator (not just prefill shortcut)
12. Mock interview mode in Coach
13. Quick stats / analytics dashboard
14. Weekly summary email (Sunday pipeline snapshot)
15. Mobile-responsive layout
16. Chrome bookmarklet

## Job Detail Analysis (planned)

When the detail panel opens for any saved job, auto-generate a 5-category scorecard against Nicholas's resume and preferences. Trigger on panel open, Haiku (~5s), cached in component state per session (reopening a panel doesn't re-call).

**5 categories, each scored 0–100:**
1. **Industry Fit** — how well the company/role aligns with CRE, proptech, AI automation
2. **Skills Match** — overlap between JD requirements and his stack (Python, n8n, Zapier, APIs, Excel, Claude)
3. **Role Alignment** — internship vs full-time vs his current search stage; timing fit
4. **Location Match** — Remote/Miami for internships; SF/NYC/ATL/DFW/Miami for full-time
5. **Growth Potential** — learning value, network quality, and career trajectory fit

**Total score** = weighted average displayed prominently at top of scorecard.

**Color coding:** 80+ green, 60–79 amber, <60 red.

**Fallback:** if job has no description, base analysis on title + company name only (lower confidence, noted in UI).

**API:** `POST /api/jobs/[id]/analyze` — reads the job record + `buildSystemPrompt()`, returns `{ categories: [{name, score, rationale}], total }`.

**UI placement:** inside the detail slide panel, below Status + Match badge row. Lazy-loaded — shows "Analyzing..." spinner on first open, then renders the scorecard.
