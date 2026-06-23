# Career Dashboard — CLAUDE.md

Multi-user, self-hostable AI-powered job search command center. Next.js 16 (App Router), TypeScript, Tailwind CSS, Turso (libsql) for storage, Anthropic SDK for AI. No accounts or passwords — each visitor gets a client-generated UUID identity and brings their own Anthropic API key (BYOK). Live at `career-dashboard-ten.vercel.app`, repo `github.com/moff05/career-dashboard`.

Originally built as a single-user tool for Nicholas Moffett (University of Miami junior, CRE/AI intern, active job seeker) — his is still the reference persona for feature priorities and tone, but as of the multi-user launch (June 2026) the app no longer hardcodes his data. Anyone using the live instance or a self-hosted copy gets their own isolated profile, jobs, leads, memories, and chat history.

## Multi-user model

- First visit with no `cid_user_id`/`cid_api_key` in `localStorage` → `ClientRoot` (`app/ClientRoot.tsx`) redirects to `/setup`.
- `/setup` (`app/setup/page.tsx`) is a 4-step onboarding flow: **identity** (name/email/linkedin) → **background** (school, grad date, target roles/cities, free-text notes) → **resume** (pasted plain text) → **API key** (validated as starting with `sk-ant-`).
- On finish: client generates a UUID (`crypto.randomUUID()`), saves `cid_user_id` / `cid_api_key` / `cid_display_name` to `localStorage`, then `PUT`s the profile (and resume, if provided) to the API with those values as headers.
- Every later request goes through `lib/apiFetch.ts`, which auto-injects `x-user-id` and `x-api-key` headers from `localStorage`.
- Server-side, `lib/user.ts` reads `x-user-id` (defaults to `'anonymous'` if absent) and `x-api-key` (falls back to `process.env.ANTHROPIC_API_KEY` if unset — an admin/dev convenience, not meant for the public flow) from every request. All 31 API routes scope their queries by `user_id`.
- API keys are never persisted server-side — they travel per-request only and live in the user's browser.

## How to run

```bash
cd career-dashboard
npm install
npm run dev     # http://localhost:3000
npm run build   # production build check
```

`.env.local` is optional for local dev — see `.env.local.example`:
```
# ANTHROPIC_API_KEY=sk-ant-...     (admin/dev fallback only; real users supply their own key via /setup)
# TURSO_DATABASE_URL=libsql://...  (omit to fall back to local file:./data/career.db)
# TURSO_AUTH_TOKEN=...
```

## Database

`lib/db.ts` → `getDb()` returns a singleton `@libsql/client`, pointed at `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` in production or a local SQLite file (`file:./data/career.db`) when those env vars are absent.

Schema lives in `scripts/migrate-multi-user.ts` — `npm run migrate` creates all 9 tables (if missing) and adds `user_id` columns + indexes (safe to re-run). The legacy single-user migrations (`migrate.ts`, `migrate-v2.ts`, `migrate-v3.ts`) have been deleted — this is the only migration script now.

**Tables (all scoped by `user_id` unless noted):**
- `profile` — name, email, phone, linkedin, university, degree, graduation_date, gpa, honors, minors, target_roles, target_cities, notes, resume_text. Unique per `user_id`.
- `jobs` — company, title, type, status, match_score, posting_date, deadline, url, description, salary_range, location, source, notes, starred, status_updated_at.
- `chat_messages` — role, content, session_id (UUID per browser session).
- `memories` — AI-extracted facts. Categories: preference, goal, insight, company, role, location, skill, other.
- `timeline_events` — milestone, deadline, goal, application.
- `resume` — name, raw_text, parsed_at, is_default. Multiple resumes per `user_id` are allowed; a partial unique index (`idx_resume_one_default`) enforces at most one `is_default = 1` row per user. AI features always read whichever resume is currently default.
- `connections` — company, name, relationship, notes, status (`not_reached_out` → `reached_out` → `responded` → `warm`).
- `leads` — company, title, url, location, type, fit_score, fit_reasoning, tags, source_query, dismissed. Written by the Job Hunt Agent.
- `usage_log` — one row per Claude API call: route, model, input/output/cache tokens, web_search_requests, cost_usd. Written by `lib/usage.ts`, read by the Profile page's Usage & Cost card. Not scoped to a user for billing purposes server-side (the underlying Anthropic key is the real meter) — `user_id` here is for the per-user breakdown UI only.

There is no hardcoded seed data anymore — a fresh `user_id` starts with empty tables until they complete `/setup` and start using the app.

## Architecture

```
app/
├── layout.tsx          # Sidebar nav (Home, Jobs, Discover, Coach, Analytics, Timeline, Profile, Memory) + mobile bottom nav
├── ClientRoot.tsx       # Redirects to /setup if cid_user_id/cid_api_key missing from localStorage
├── globals.css          # Design tokens (see Design system below)
├── page.tsx             # Home dashboard — stats, weekly brief, strategy advisor, deadlines
├── setup/page.tsx       # 4-step onboarding
├── tracker/page.tsx     # Job tracker — URL import, company groups, detail panel
├── discover/page.tsx    # Lead feed, company research, Hunt Agent trigger
├── coach/page.tsx       # Streaming chat + mock interview mode
├── analytics/page.tsx   # Pipeline stats
├── timeline/page.tsx    # Vertical timeline — manual events + job deadlines from tracker
├── profile/page.tsx     # Editable profile + AI strength summary + Usage & Cost card
├── memory/page.tsx      # Memory CRUD panel
├── hooks/useUser.ts      # Reads cid_user_id / display name from localStorage
└── api/
    ├── analytics/route.ts
    ├── brief/route.ts                   # Weekly brief, consumed by Home
    ├── export/route.ts, import/route.ts # Full data export/restore (no accounts — this is the only recovery path)
    ├── chat/route.ts, chat/history/route.ts, chat/memories/route.ts
    ├── connections/route.ts, connections/[id]/route.ts
    ├── discover/route.ts                # Manual company/role search (web_search beta)
    ├── discover/suggestions/route.ts    # Auto leads feed (Haiku)
    ├── discover/hunt/route.ts           # Job Hunt Agent (multi-turn Sonnet + web_search)
    ├── discover/leads/route.ts, discover/leads/[id]/route.ts
    ├── interview/route.ts               # Mock interview mode
    ├── jobs/route.ts, jobs/[id]/route.ts, jobs/import/route.ts
    ├── jobs/[id]/analyze/route.ts       # 5-category fit scorecard
    ├── jobs/[id]/bullets/route.ts       # Resume bullet tailoring
    ├── jobs/[id]/cover-letter/route.ts
    ├── jobs/[id]/details/route.ts       # AI-enriched job details tab
    ├── jobs/[id]/gaps/route.ts          # Fit gaps + positioning
    ├── memories/route.ts, memories/[id]/route.ts
    ├── profile/route.ts, profile/resume/route.ts, profile/summary/route.ts
    ├── resumes/route.ts, resumes/[id]/route.ts  # Multi-resume CRUD — list/create/rename/set-default/delete
    ├── strategy/route.ts                # Application strategy advisor, consumed by Home
    ├── timeline/route.ts, timeline/[id]/route.ts
    └── usage/route.ts                   # Aggregated cost/token totals for the current user, consumed by Profile

lib/
├── db.ts              # Turso/libsql singleton
├── user.ts            # getUserId / getApiKey from request headers
├── apiFetch.ts         # Client fetch wrapper — injects x-user-id / x-api-key
├── ai-context.ts       # buildSystemPrompt(userId) — resume + profile + memories + jobs, scoped per user
├── usage.ts            # computeCost() + logUsage() — every Claude call site awaits this after the response comes back
└── resume-parser.ts    # getResumeText(userId) — reads the resume table, no hardcoded fallback

scripts/
└── migrate-multi-user.ts   # current schema — `npm run migrate`
```

## Core workflow

The primary use case is unchanged: **find a job posting → paste the URL → it gets parsed and added to the tracker**. No data is seeded — every job entry comes from a real link, pasted context, or manual entry.

## AI context (system prompt)

`buildSystemPrompt(userId)` in `lib/ai-context.ts` builds every AI call's system prompt from, all scoped to that `user_id`:
- Resume text (or `'Resume not yet added.'` if none saved)
- Profile fields: name, graduation date, target roles, target cities, notes
- Memories grouped by category
- Job tracker summary, grouped by status
- Today's date (dynamic)

An unconfigured user (hasn't completed `/setup`) gets a generic prompt with placeholders — there's no hardcoded personal data anywhere in this path anymore.

## Memory system

After each coach chat response, `/api/chat/memories` is called with the user message + AI response. A lightweight Haiku call extracts new facts about that user and saves them to their `memories` rows. The coach page shows a toast when a memory is saved.

## Company badges

Companies display vibrant hash-based initials badges — no network calls, no Clearbit dependency. Color is deterministic per company name using a 12-color palette. `CompanyBadge` is defined locally in both `tracker/page.tsx` and `discover/page.tsx`.

## Job Tracker features

- **URL import (primary)** — "Import from URL" opens a two-step modal: fetch → review/edit → save. Combines up to 4 context sources before extracting structured fields. Fields not found anywhere are left blank — no data is invented.
- **Multi-source context** — accepts (1) primary URL, (2) pasted recruiter message/JD/email text, (3) optional second URL, (4) screenshot upload (Claude vision extracts text). All sources are concatenated and sent together to Haiku for one extraction pass.
- **Source detection** — URL hostname mapped to a source label (LinkedIn, Greenhouse, Lever, Workday, Handshake, etc.)
- **Company groups** — jobs grouped by company, collapsible, with aggregate match score.
- **Inline status change** — click status badge → dropdown → `PATCH` partial update.
- **Detail slide panel** — location, deadline countdown, source, salary, URL, notes, description, plus AI Score / Gaps / Bullets / Cover Letter / Connections tabs.
- **Search + filter, column sorting, smart deadline countdown** — unchanged.
- **Cover letter shortcut** — prefills Coach page via `/coach?prefill=cover-letter&company=...&title=...`.
- **Empty state** — tracker starts empty; prompts the user to import from a URL.

## Discover page features

- **Job Hunt Agent (primary)** — "Hunt for Jobs" button triggers `POST /api/discover/hunt`: builds search queries dynamically from the user's own profile (target roles × target cities, no hardcoded role/location assumptions), runs a multi-turn Sonnet + `web_search` tool loop, then cross-references every lead's URL against the actual `web_search_tool_result` blocks returned by the API — a URL that didn't literally appear in a real search result is dropped. No fallback to a no-search completion if the tool call fails (would risk hallucinated URLs); the call just fails honestly instead. Deduplicates against the user's tracker, persists survivors to the `leads` table. Leads render as a persistent card grid (survive refresh), can be dismissed or saved to tracker.
- **Idea Feed — Unverified (secondary, demoted)** — AI-guessed leads loaded on mount (Haiku, no web search), cached client-side. Explicitly labeled unverified since these have no real posting URL; positioned below Hunt Agent on purpose.
- **Company research** — search any company or role type → overview, culture signals, open role types, personalized fit reasoning.
- **Location badges** — internships get "Student-friendly" (green) if Remote/student-friendly per profile constraints, "On-site only" (red) otherwise.

## Coach features

- Streaming chat with persistent memory extraction.
- **Mock interview mode** — pick behavioral, product, technical, case, or fit; answer 5 questions; get per-answer feedback + final assessment (`POST /api/interview`).
- Quick-action prefills and cover letter shortcut from the tracker.

## Home dashboard

- Pipeline stats, upcoming deadlines, follow-up nudges.
- **Weekly Brief** (`GET /api/brief`) — personalized snapshot: headline, priority actions, recommended roles, this-week focus, honest assessment. Haiku, ~15s, client-cached.
- **Application strategy advisor** (`GET /api/strategy`) — ranked list of which jobs to prioritize and why, based on fit score, deadline, and stage.

## Timeline features

- Vertical chronological timeline of milestones, deadlines, and goals.
- **Tracker sync** — job deadlines are pulled on load and merged in as read-only "application" events labeled "from tracker."
- Manual events can be added, toggled done, and deleted.

## Networking / connections

- Save contacts per company, track outreach status (`not_reached_out` → `reached_out` → `responded` → `warm`).
- Company-keyed — contacts at a company show up across every job tracked at that company.
- `app/api/connections/route.ts`, `connections/[id]/route.ts`.

## API notes

- `PUT /api/jobs/[id]` — full update, requires all fields. `PATCH` — partial update (e.g. status only).
- `POST /api/jobs/import` — `{ url, extraText?, imageBase64?, imageMediaType?, extraLink? }` → Haiku extraction, returns `{ company, title, location, type, deadline, salary_range, description, url, source, warning? }`.
- `POST /api/jobs/[id]/analyze` — 5-category fit scorecard (0–100 each): Industry Fit, Skills Match, Role Alignment, Location Match, Growth Potential. Color coding: 80+ green, 60–79 amber, <60 red.
- `POST /api/jobs/[id]/gaps`, `POST /api/jobs/[id]/bullets`, `POST /api/jobs/[id]/cover-letter`, `GET /api/jobs/[id]/details` — per-job AI panels, all read from `buildSystemPrompt(userId)` + the job record.
- `POST /api/discover/hunt` — the Hunt Agent loop (see Discover page features above).
- `GET /api/export` — full data dump for the current user across all 8 tables. `POST /api/import` — restores from that dump into the current user (upserts profile, appends everything else including resumes). Used by Profile's Backup & Restore card; the only recovery path since there are no accounts.
- `GET /api/resumes` — list the user's resumes (default first). `POST /api/resumes` — create one (`{name, raw_text}`); the first resume for a user is auto-marked default. `PUT /api/resumes/[id]` — update `name`/`raw_text`, or pass `{set_default: true}` to make it the one AI features read (clears the previous default first to respect the partial unique index). `DELETE /api/resumes/[id]` — deletes it; if it was the default, the oldest remaining resume is auto-promoted.

## Design system (icy glass)

Tokens defined in `app/globals.css`:
- Background: `--void #07152B` / `--void-2 #0B1D38`, layered radial-gradient glow + faint grid overlay
- Glass surfaces: `--glass rgba(125,220,255,0.055)` and `--glass-hi` with `backdrop-filter: blur(...)`
- Accent: `--ice #7DF4FC` (icy cyan), `--blue #4A9EF8` (electric blue) — replaces the old amber (`#d97706`) accent entirely
- Text: `--text rgba(232,244,255,0.95)` down through `--text-4` for the dimmest tier
- Status colors: dedicated `--s-saved` / `--s-applied` / `--s-interview` / `--s-offer` / `--s-rejected` tokens
- Font: Inter (Google Fonts) — replaces the old system-font fallback
- Sidebar avatar/brand mark: gradient square (`#4A9EF8` → `#7DF4FC`) with user initials, derived from `cid_display_name`

There is no dark-navy/amber single-user theme left in the codebase — the full UI (8 pages + setup) runs on this glass palette.

## AI model usage

- Chat + coach: `claude-sonnet-4-6`, streaming via `anthropic.messages.stream()`
- Discovery search + Hunt Agent: `claude-sonnet-4-6` with `betas: ['web-search-2025-03-05']` and the `web_search_20250305` tool; fallback to knowledge-only on error
- Suggestions (auto-leads), memory extraction, JD fit analysis, weekly brief, URL import parsing: `claude-haiku-4-5-20251001`, non-streaming
- Profile summary: `claude-sonnet-4-6`, returns JSON `{strengths, gaps, readiness_score, summary}`

Each call uses the requesting user's own API key (from `x-api-key`, via `lib/user.ts`), not a shared server key — so the old shared-key rate-limit ceiling no longer applies to public users. The `ANTHROPIC_API_KEY` env var is only a fallback for local/admin use without going through `/setup`.

## Priority roadmap

### Done
1. URL import → parse → add to tracker (core workflow)
2. Multi-source import context (paste text, screenshot vision, extra link)
3. Company grouping / collapsible rows, job detail slide panel
4. Match analysis scorecard, fit gaps, resume bullet tailoring, cover letter generator (per-job AI tabs)
5. Weekly Brief + application strategy advisor on Home
6. Company research + Job Hunt Agent (agentic web search, deduplicated, persisted leads, grounded URLs only) on Discover
7. Mock interview mode on Coach
8. Networking / connections tracking
9. Vercel deploy (Turso cloud DB, GitHub-linked)
10. **Multi-user public launch** — icy glass redesign, `/setup` onboarding, UUID identity, BYOK, all API routes scoped by `user_id`
11. **De-personalization pass** — removed hardcoded "Nicholas"/CRE-PropTech framing from every shared AI prompt (`discover`, `discover/hunt`, `discover/suggestions`, `interview`, `brief`, `analyze/jd`) plus two routes that silently ignored the real `userId` and used `'anonymous'`. AI prompt now instructs no emojis app-wide.
12. **Data export/backup** — `/api/export` + `/api/import`, surfaced on Profile. The only account-recovery path since there are no logins.
13. **Welcome/landing page** (`/welcome`) before `/setup` — explains the product to a cold visitor; onboarding screens (`/welcome`, `/setup`) now render full-bleed without the app sidebar.
14. **Multi-resume support** — `resume` table now allows many rows per user (`name` + `is_default`), managed via `/api/resumes` + `/api/resumes/[id]` and a resume-switcher UI on Profile. AI features always read whichever resume is the user's current default.
15. Discover restructured so Hunt Agent (real, grounded links) leads; the AI-guessed feed is relabeled "Idea Feed — Unverified" and demoted.
16. Resume auto-populate extended to infer `target_roles` from resume content (the one field that's reasonable to infer rather than extract verbatim).
17. **In-app usage/cost meter** — `lib/usage.ts` logs every Claude API call (all 14 call sites: chat, mock interview, hunt agent, company research, weekly brief, strategy advisor, per-job AI tabs, resume parsing, job import, memory extraction, profile summary) to the `usage_log` table with computed `cost_usd` based on published per-model pricing, cache write/read multipliers, and the flat web-search-per-call fee. `GET /api/usage` aggregates totals + a per-feature breakdown, surfaced on Profile via a "Usage & Cost" card — so BYOK users can see what their key has spent without checking the Anthropic console.

### Cut
- `/api/analyze/jd` — deleted (was dead code, no UI consumer).
- Analytics and Timeline pages — removed (low utility for new users with few/no jobs tracked; see audit memory for reasoning).
- Legacy single-user migration scripts (`migrate.ts`, `migrate-v2.ts`, `migrate-v3.ts`) — deleted; `migrate-multi-user.ts` is the only migration now.

### Not yet done
- Chrome extension for one-click save from any tab.
- Mobile-responsive pass beyond the existing bottom nav (spot-check tracker/detail panel on small screens) — in progress.
- Weekly email digest (Sunday summary via Resend or similar) — needs a cron/scheduling decision (Vercel Cron is paid-tier, or use an external trigger).
- BYOK onboarding friction — getting an Anthropic API key is real friction for non-technical users; consider a hand-holding flow or a capped trial key pool.
- The legacy orphaned `profile` row (`id=1`, `user_id` still `NULL` — predates the multi-user migration) is dead/unreachable but hasn't been deleted. The equivalent legacy `resume` row was migrated to `user_id='anonymous'` as part of the multi-resume migration.
