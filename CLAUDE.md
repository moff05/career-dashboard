# Career Dashboard — CLAUDE.md

Multi-user, self-hostable job tracker with two AI features bolted on deliberately: per-job fit scoring, and a coach that knows your background. Next.js 16 (App Router), TypeScript, Tailwind CSS, Turso (libsql) for storage, Anthropic SDK for AI. No accounts or passwords — each visitor gets a client-generated UUID identity and brings their own Anthropic API key (BYOK). Live at `career-dashboard-ten.vercel.app`, repo `github.com/moff05/career-dashboard`.

Originally built as a single-user tool for Nicholas Moffett (University of Miami junior, CRE/AI intern) — his is still the reference persona for feature priorities and tone, but as of the multi-user launch (June 2026) the app no longer hardcodes his data. Anyone using the live instance or a self-hosted copy gets their own isolated profile, jobs, memories, and chat history.

**Product philosophy (post-reshape, June 2026):** this is meant to feel like a great spreadsheet job tracker, not an AI platform. AI earns its place only where it removes real friction — parsing a job posting, scoring fit, knowing your background in chat — not as a feature-count exercise. See "Cut" in the roadmap below for what got removed and why; if a new feature idea reads as "AI restates something already visible elsewhere," that's a signal to cut, not build.

## Multi-user model

- First visit with no `cid_user_id`/`cid_api_key` in `localStorage` → `ClientRoot` (`app/ClientRoot.tsx`) redirects to `/welcome`.
- `/welcome` (`app/welcome/page.tsx`) offers two paths: **Get Started** → `/setup`'s 4-step onboarding flow (**identity** → **background** → **resume** → **API key**, validated as starting with `sk-ant-`), or **"Already have a backup? Restore it instead"** — an inline panel (API key + backup `.json` file) that skips the form entirely: generates a UUID, `POST`s straight to `/api/import` under that new id, and only persists the identity to `localStorage` once the import actually succeeds. This is the only way to reach a restore on a fresh browser/device — without it, `/api/import`'s target user_id doesn't exist until `/setup` creates one, and the "Restore from backup" button on Profile is unreachable pre-setup.
- On finish (either path): client generates a UUID (`crypto.randomUUID()`), saves `cid_user_id` / `cid_api_key` / `cid_display_name` to `localStorage`, then `PUT`s the profile (and resume, if provided) or `POST`s the imported backup to the API with those values as headers.
- Every later request goes through `lib/apiFetch.ts`, which auto-injects `x-user-id` and `x-api-key` headers from `localStorage`.
- Server-side, `lib/user.ts`'s `getUserId`/`getApiKey` read `x-user-id`/`x-api-key` from every request. Neither fails open: a missing `x-api-key` only falls back to `process.env.ANTHROPIC_API_KEY` outside production (admin/dev convenience — production 401s instead of silently billing whatever key is configured on the deployment); a missing `x-user-id` gets a fresh `randomUUID()` per request rather than the old shared `'anonymous'` bucket, so two different header-less callers can no longer read or overwrite each other's data. Every route that takes an `[id]` param scopes both the write *and* any response lookup by `user_id` — a guessed/enumerated id should 404, never leak another user's record (see the IDOR fix in the roadmap).
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

Schema lives in `scripts/migrate-multi-user.ts` — `npm run migrate` creates all tables (if missing) and adds `user_id` columns + indexes (safe to re-run). The legacy single-user migrations (`migrate.ts`, `migrate-v2.ts`, `migrate-v3.ts`) have been deleted — this is the only migration script now.

**Active tables (all scoped by `user_id` unless noted):**
- `profile` — name, email, phone, linkedin, university, degree, graduation_date, gpa, honors, minors, target_roles, target_cities, notes, resume_text. Unique per `user_id`.
- `jobs` — company, title, type, status, match_score, posting_date, deadline, url, description, salary_range, location, source, notes, starred, status_updated_at. `url` is nullable — a job can be pasted-text-only with no link.
- `chat_messages` — role, content, session_id (UUID per browser session). Coach chat only.
- `memories` — AI-extracted facts from Coach conversations. Categories: preference, goal, insight, company, role, location, skill, other, story_bank.
- `resume` — name, raw_text, parsed_at, is_default. Multiple resumes per `user_id` are allowed; a partial unique index (`idx_resume_one_default`) enforces at most one `is_default = 1` row per user. AI features always read whichever resume is currently default.
- `connections` — company, name, relationship, notes, status (`not_reached_out` → `reached_out` → `responded` → `warm`).
- `usage_log` — one row per Claude API call: route, model, input/output/cache tokens, web_search_requests, cost_usd. Written by `lib/usage.ts`, read by the Profile page's Usage & Cost card.

**Legacy/orphaned tables** (still created by the migration for backward compatibility with old data, no longer written by any current feature): `timeline_events`, `leads`, `company_ats_cache` — these backed the cut Timeline, Discover/Hunt Agent, and Discover/leads-liveness features. Not deleted on purpose (no destructive `DROP TABLE` without being asked); if you're touching this schema, don't build new features against them without checking they're really meant to come back.

There is no hardcoded seed data anymore — a fresh `user_id` starts with empty tables until they complete `/setup` and start using the app.

## Architecture

```
app/
├── layout.tsx          # Sidebar nav (Home, Jobs, Coach, Profile, Memory) + mobile bottom nav
├── ClientRoot.tsx       # Redirects to /welcome if cid_user_id/cid_api_key missing from localStorage
├── globals.css          # Design tokens (see Design system below)
├── page.tsx             # Home dashboard — stats, free fit-score-sorted priorities, recent jobs
├── welcome/page.tsx     # Landing page — Get Started, or restore-from-backup shortcut
├── setup/page.tsx       # 4-step onboarding
├── tracker/page.tsx     # Job tracker — import (URL or pasted text), company groups, detail panel
├── coach/page.tsx       # General chat only — knows resume/profile/memories/jobs, no job-specific analysis
├── profile/page.tsx     # Editable profile + rubric-scored Candidate Strength + Usage & Cost card
├── memory/page.tsx      # Memory CRUD panel
├── hooks/useUser.ts      # Reads cid_user_id / display name from localStorage
└── api/
    ├── export/route.ts, import/route.ts # Full data export/restore (no accounts — this is the only recovery path)
    ├── chat/route.ts, chat/history/route.ts, chat/memories/route.ts
    ├── connections/route.ts, connections/[id]/route.ts
    ├── jobs/route.ts, jobs/[id]/route.ts, jobs/import/route.ts   # import accepts a URL, pasted text, or both
    ├── jobs/[id]/analyze/route.ts       # 5-category fit scorecard — the AI score per imported job
    ├── jobs/[id]/bullets/route.ts       # Resume bullet tailoring
    ├── jobs/[id]/cover-letter/route.ts
    ├── jobs/[id]/details/route.ts       # AI-enriched job details tab
    ├── jobs/[id]/gaps/route.ts          # Fit gaps + positioning
    ├── memories/route.ts, memories/[id]/route.ts
    ├── profile/route.ts, profile/resume/route.ts, profile/resume/extract/route.ts, profile/summary/route.ts
    ├── resumes/route.ts, resumes/[id]/route.ts  # Multi-resume CRUD — list/create/rename/set-default/delete
    └── usage/route.ts                   # Aggregated cost/token totals for the current user, consumed by Profile

lib/
├── db.ts              # Turso/libsql singleton
├── user.ts            # getUserId / getApiKey from request headers — see Multi-user model for the fail-closed behavior
├── apiFetch.ts         # Client fetch wrapper — injects x-user-id / x-api-key
├── ai-context.ts       # buildSystemPrompt(userId) — resume + profile + dated memories + jobs, scoped per user
├── usage.ts            # computeCost() + logUsage() — every Claude call site awaits this after the response comes back
└── resume-parser.ts    # getResumeText(userId) — reads the resume table, no hardcoded fallback

scripts/
└── migrate-multi-user.ts   # current schema — `npm run migrate`
```

## Core workflow

**Import a job → get an AI fit score → track it.** `/api/jobs/import` accepts a URL, pasted job description text, or both (a URL alone fetches and parses the page; pasted text alone works with no link at all — this was deliberately relaxed so a JD without a link doesn't need Coach as a workaround). No data is seeded — every job entry comes from a real link, pasted text, or manual entry.

## AI context (system prompt)

`buildSystemPrompt(userId)` in `lib/ai-context.ts` builds every AI call's system prompt, all scoped to that `user_id`:
- Resume text (or `'Resume not yet added.'` if none saved)
- Profile fields: name, graduation date, target roles, target cities, notes
- Memories grouped by category, each tagged with its save date
- Job tracker summary, grouped by status
- Today's date (dynamic)
- An explicit instruction that memories are notes from past conversations, not fixed truth — the model is told to trust a more recent memory or whatever the user is currently saying over an older stored fact, rather than holding someone to a stale stated goal

An unconfigured user (hasn't completed `/setup`) gets a generic prompt with placeholders — there's no hardcoded personal data anywhere in this path anymore.

## Memory system

After each Coach chat response, `/api/chat/memories` is called with the user message + AI response. A lightweight Haiku call extracts new facts about that user and saves them to their `memories` rows. The Coach page shows a toast when a memory is saved. Memories are dated when shown back to the model (see AI context above) so recency can outweigh an older, possibly-stale fact — this was a deliberate fix for the failure mode where the model over-anchors on old memory and resists a user's stated change of plans.

## Company badges

Companies display vibrant hash-based initials badges — no network calls, no Clearbit dependency. Color is deterministic per company name using a 12-color palette. `CompanyBadge` is defined locally in `tracker/page.tsx`.

## Job Tracker features

- **Import (primary)** — opens a modal: paste a URL, paste a job description, or both, then review/edit → save. A URL alone fetches and parses the page (Jina reader first, falls back to plain fetch); pasted text alone needs no link. Combines up to 4 context sources (URL, pasted text, screenshot, extra link) before extracting structured fields in one Haiku pass. Fields not found anywhere are left blank — no data is invented.
- **Source detection** — URL hostname mapped to a source label (LinkedIn, Greenhouse, Lever, Workday, Handshake, etc.); pasted-text-only jobs are labeled "Pasted."
- **Company groups** — jobs grouped by company, collapsible, with aggregate match score.
- **Inline status change** — click status badge → dropdown → `PATCH` partial update.
- **Detail slide panel** — location, deadline countdown, source, salary, URL, notes, description, plus AI Score / Gaps / Bullets / Cover Letter / Connections tabs. These are the only per-job AI surfaces — there is no "discuss with Coach" handoff anymore (cut deliberately; Coach is general-only, see below).
- **Search + filter, column sorting, smart deadline countdown.**
- **Empty state** — tracker starts empty; prompts the user to import a job.

## Coach features

- General streaming chat only — no job-specific analysis (that lives in the tracker's detail-panel tabs) and no mock interview mode (cut — pointless without voice).
- Persistent memory extraction after each response (see Memory system above).
- Quick-action prefills: "What should I apply to?", "Interview prep" (a conversation about prep, not a simulation), "Cold outreach."

## Home dashboard

- Pipeline stats, upcoming deadlines, follow-up nudges.
- **Priorities** — free, no AI call. Computed client-side from tracked jobs: deadlines (≤3 days = urgent, ≤7 = soon), 14+ day no-response follow-ups, interview-prep flags. Sorted by urgency bucket first, then by `match_score` descending as a tiebreaker within each bucket. This is the only "what should I prioritize" surface on Home — Weekly Brief and the Strategy advisor were both cut as redundant with it (see roadmap).

## Networking / connections

- Save contacts per company, track outreach status (`not_reached_out` → `reached_out` → `responded` → `warm`).
- Company-keyed — contacts at a company show up across every job tracked at that company.
- `app/api/connections/route.ts`, `connections/[id]/route.ts`.

## API notes

- `PUT /api/jobs/[id]` — full update, requires all fields. `PATCH` — partial update (e.g. status only). Both scope the response lookup by `user_id`, not just the write — see Multi-user model.
- `POST /api/jobs/import` — `{ url?, extraText?, imageBase64?, imageMediaType?, extraLink? }`, requires at least one of `url`/`extraText` → Haiku extraction, returns `{ company, title, location, type, deadline, salary_range, description, url, source, warning? }`. `url` in the response is `null` when none was given.
- `POST /api/jobs/[id]/analyze` — 5-category fit scorecard (0–100 each): Industry Fit, Skills Match, Role Alignment, Location Match, Growth Potential. Color coding: 80+ green, 60–79 amber, <60 red. This is the per-job AI score the whole tracker is built around.
- `POST /api/jobs/[id]/gaps`, `POST /api/jobs/[id]/bullets`, `POST /api/jobs/[id]/cover-letter`, `GET /api/jobs/[id]/details` — per-job AI panels, all read from `buildSystemPrompt(userId)` + the job record.
- `POST /api/profile/summary` — the rubric-scored Candidate Strength. Returns `{strengths, gaps, score_breakdown, readiness_score, summary}`; `readiness_score` is computed server-side as the sum of `score_breakdown`'s sub-scores using Anthropic structured outputs (each sub-score constrained to an enum of anchored values), not read directly from free-form model output.
- `GET /api/export` — full data dump for the current user across all active tables. `POST /api/import` — restores from that dump into the current user (upserts profile, appends everything else including resumes). Used by Profile's Backup & Restore card, and by `/welcome`'s restore shortcut for a fresh browser/device; the only recovery path since there are no accounts.
- `GET /api/resumes` — list the user's resumes (default first). `POST /api/resumes` — create one (`{name, raw_text}`); the first resume for a user is auto-marked default. `PUT /api/resumes/[id]` — update `name`/`raw_text`, or pass `{set_default: true}` to make it the one AI features read (clears the previous default first to respect the partial unique index). `DELETE /api/resumes/[id]` — deletes it; if it was the default, the oldest remaining resume is auto-promoted.

## Design system (icy glass)

Tokens defined in `app/globals.css`:
- Background: `--void #07152B` / `--void-2 #0B1D38`, layered radial-gradient glow + faint grid overlay
- Glass surfaces: `--glass rgba(125,220,255,0.055)` and `--glass-hi` with `backdrop-filter: blur(...)`
- Accent: `--ice #7DF4FC` (icy cyan), `--blue #4A9EF8` (electric blue)
- Text: `--text rgba(232,244,255,0.95)` down through `--text-4` for the dimmest tier
- Status colors: dedicated `--s-saved` / `--s-applied` / `--s-interview` / `--s-offer` / `--s-rejected` tokens
- Font: Inter (Google Fonts)
- Sidebar avatar/brand mark: gradient square (`#4A9EF8` → `#7DF4FC`) with user initials, derived from `cid_display_name`

## AI model usage

- Coach chat: `claude-sonnet-4-6`, streaming via `anthropic.messages.stream()`
- Memory extraction, fit scorecard, fit gaps, resume bullets, cover letter, job details, job import parsing: `claude-haiku-4-5-20251001`, non-streaming
- Candidate Strength (`/api/profile/summary`): `claude-sonnet-4-6`, `temperature: 0`, structured outputs (`output_config.format` with an enum-constrained JSON schema) so each rubric sub-score can only land on one of its anchored values — see API notes above

Each call uses the requesting user's own API key (from `x-api-key`, via `lib/user.ts`). The `ANTHROPIC_API_KEY` env var is only a fallback for local dev, gated out of production entirely (see Multi-user model).

## Priority roadmap

### Done
1. URL import → parse → add to tracker (core workflow)
2. Multi-source import context (paste text, screenshot vision, extra link)
3. Company grouping / collapsible rows, job detail slide panel
4. Match analysis scorecard, fit gaps, resume bullet tailoring, cover letter generator (per-job AI tabs)
5. Weekly Brief + application strategy advisor on Home *(both later cut — see Cut)*
6. Company research + Job Hunt Agent on Discover *(later cut — see Cut)*
7. Mock interview mode on Coach *(later cut — see Cut)*
8. Networking / connections tracking
9. Vercel deploy (Turso cloud DB, GitHub-linked)
10. **Multi-user public launch** — icy glass redesign, `/setup` onboarding, UUID identity, BYOK, all API routes scoped by `user_id`
11. **De-personalization pass** — removed hardcoded "Nicholas"/CRE-PropTech framing from every shared AI prompt
12. **Data export/backup** — `/api/export` + `/api/import`, surfaced on Profile. The only account-recovery path since there are no logins.
13. **Welcome/landing page** (`/welcome`) before `/setup` — explains the product to a cold visitor.
14. **Multi-resume support** — `resume` table allows many rows per user, managed via `/api/resumes` + `/api/resumes/[id]`.
15. Discover restructured so Hunt Agent leads; the AI-guessed feed demoted *(the whole page was later cut — see Cut)*.
16. Resume auto-populate extended to infer `target_roles` from resume content.
17. **In-app usage/cost meter** — `lib/usage.ts` logs every Claude API call to `usage_log` with computed `cost_usd` based on published per-model pricing, cache write/read multipliers, and the flat web-search-per-call fee. `GET /api/usage` aggregates totals + a per-feature breakdown, surfaced on Profile via a "Usage & Cost" card.
18. **Readiness-score rubric** — `/api/profile/summary` replaced the unanchored "1-10, your call" prompt with a 5-category additive rubric, each category constrained via structured outputs to an enum of explicit point-band anchors (no interpolating between bands). The server sums the model's own sub-scores rather than trusting its arithmetic. Verified against real Claude calls: an early version (rubric + `temperature: 0`, open-ended decimals) still swung ~1.5 points across repeat scoring of the same resume; the enum constraint tightened that to ~0.5 points.
19. **Security pass** — gated the `ANTHROPIC_API_KEY` fallback out of production, fixed an IDOR in `jobs/[id]` and `memories/[id]` where a guessed id leaked the real owner's record through the PUT/PATCH response even though the write was already scoped, and replaced the shared `'anonymous'` fallback identity with a fresh per-request UUID. Each was verified live with an actual cross-user exploit attempt, not just code review.
20. **Restore from `/welcome`** — a backup can now be restored on a brand-new browser/device without first completing `/setup`.
21. **Reshape to tracker-first** (June 2026) — see Cut below. Relaxed `/api/jobs/import` to accept pasted text with no URL, specifically to absorb the "analyze a JD I don't have a link for" use case that Coach used to handle. Added recency-weighting to the memory system (dated memories + an explicit instruction to trust the newer fact or the live conversation over a stale one) so Coach doesn't anchor on an outdated stated goal.

### Cut
- `/api/analyze/jd` — deleted (was dead code, no UI consumer).
- Analytics and Timeline pages — removed (low utility for new users with few/no jobs tracked).
- Legacy single-user migration scripts (`migrate.ts`, `migrate-v2.ts`, `migrate-v3.ts`) — deleted; `migrate-multi-user.ts` is the only migration now.
- **Application Strategy advisor** (`/api/strategy` + its Home card) — overlapped with the free Priorities card and Weekly Brief's `priority_actions`; silently no-op'd with no error UI when a user had zero tracked jobs. Its one distinct value (fit-score ranking) was folded into Priorities as a free sort tiebreaker.
- **Discover page entirely** (`/discover`, Hunt Agent, Idea Feed, company research, `leads` table) — the Hunt Agent wasn't reliable and, more importantly, wasn't specific enough to the user's actual target roles/locations to be worth the agentic-search complexity. Company research was "cool but not necessary — they can ask Google." `lib/ats.ts` and `lib/liveness.ts` were deleted as dead code (only the Hunt Agent used them).
- **Weekly Brief** (`/api/brief` + its Home card) — same redundancy pattern as Strategy: a third AI surface answering "what should I focus on" that the free Priorities card already covers. The one thing it did that nothing else covers (deadline awareness) was already redundant with Import extracting `deadline` and Priorities surfacing it.
- **Mock interview mode on Coach** (`/api/interview`) — "pointless if you can't speak it"; a text Q&A loop doesn't simulate a real interview closely enough to be worth keeping.
- **Job-specific entry points into Coach** — the cover-letter-via-Coach shortcut icon on the tracker (redundant with the dedicated Cover Letter tab, which has tone/angle controls Coach's prompt didn't) and the "Discuss with Coach" score-handoff button (redundant once the fit scorecard is in-depth enough to stand on its own). Coach is now general-chat-only; per-job analysis lives entirely in the tracker's detail panel.
- **"Analyze a JD" Coach quick action** — the gap it covered (a JD with no link) is now handled by Import itself accepting pasted-text-only, which produces a tracked, scored job instead of an ephemeral chat answer.

### Not yet done
- Chrome extension for one-click save from any tab.
- Mobile-responsive pass beyond the existing bottom nav (spot-check tracker/detail panel on small screens) — in progress.
- BYOK onboarding friction — getting an Anthropic API key is real friction for non-technical users; consider a hand-holding flow or a capped trial key pool.
- A "Contact us" / feedback surface (bug reports + feature requests, with screenshot attachment) that routes to an AI which can read, triage, and partially or fully act on submissions — floated as an idea for once there are real outside users (Nicholas's friends), not yet designed or built. Worth thinking through the auto-approve attack surface before building the "AI acts on it directly" part.
- The legacy orphaned `profile` row (`id=1`, `user_id` still `NULL` — predates the multi-user migration) is dead/unreachable but hasn't been deleted.
