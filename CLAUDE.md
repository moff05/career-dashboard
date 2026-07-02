# Career Dashboard — CLAUDE.md

Multi-user, self-hostable job tracker with two AI features bolted on deliberately: per-job fit scoring, and a coach that knows your background. Next.js 16 (App Router), TypeScript, Tailwind CSS, Turso (libsql) for storage, Groq (OpenAI-compatible SDK, `lib/gemini.ts`) for AI. No accounts or passwords — each visitor gets a client-generated UUID identity. AI runs server-side on a shared `GROQ_API_KEY`; users do not supply their own AI key. Live at `career-dashboard-ten.vercel.app`, repo `github.com/moff05/career-dashboard`.

Originally built as a single-user tool for Nicholas Moffett (University of Miami junior, CRE/AI intern) — his is still the reference persona for feature priorities and tone, but as of the multi-user launch (June 2026) the app no longer hardcodes his data. Anyone using the live instance or a self-hosted copy gets their own isolated profile, jobs, memories, and chat history.

**Product philosophy (post-reshape, June 2026):** this is meant to feel like a great spreadsheet job tracker, not an AI platform. AI earns its place only where it removes real friction — parsing a job posting, scoring fit, knowing your background in chat — not as a feature-count exercise. See "Cut" in the roadmap below for what got removed and why; if a new feature idea reads as "AI restates something already visible elsewhere," that's a signal to cut, not build.

## Multi-user model

- First visit with no `cid_user_id` in `localStorage` → `ClientRoot` (`app/ClientRoot.tsx`) redirects to `/welcome`.
- `/welcome` (`app/welcome/page.tsx`) offers two paths: **Get Started** → `/setup`'s 3-step onboarding flow (**resume** → **identity** → **background**), or **"Already have a backup? Restore it instead"** — an inline panel (backup `.json` file) that skips the form entirely: generates a UUID, `POST`s straight to `/api/import` under that new id, and only persists the identity to `localStorage` once the import actually succeeds. This is the only way to reach a restore on a fresh browser/device — without it, `/api/import`'s target user_id doesn't exist until `/setup` creates one, and the "Restore from backup" button on Profile is unreachable pre-setup.
- On finish (either path): client generates a UUID (`crypto.randomUUID()`), saves `cid_user_id` / `cid_display_name` to `localStorage`, then `PUT`s the profile (and resume, if provided) or `POST`s the imported backup to the API with those values as headers.
- Every later request goes through `lib/apiFetch.ts`, which auto-injects the `x-user-id` header from `localStorage`.
- Server-side, `lib/user.ts`'s `getUserId` reads `x-user-id` from every request. A missing `x-user-id` gets a fresh `randomUUID()` per request rather than the old shared `'anonymous'` bucket, so two different header-less callers can no longer read or overwrite each other's data. Every route that takes an `[id]` param scopes both the write *and* any response lookup by `user_id` — a guessed/enumerated id should 404, never leak another user's record (see the IDOR fix in the roadmap).
- AI calls use the server-side `GROQ_API_KEY` env var only — no per-user key required. `isSystemUser()` gates AI routes to reject synthetic/health-check user IDs (those starting with `__`).

## How to run

```bash
cd career-dashboard
npm install
npm run dev     # http://localhost:3000
npm run build   # production build check
```

`.env.local` is optional for local dev — see `.env.local.example`:
```
# GROQ_API_KEY=gsk_...             (required for AI features; set on Vercel + in .env.local)
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
- `connections` — company, name, email, role, linkedin, relationship, notes, status (`not_reached_out` → `reached_out` → `responded` → `warm`). `company` is free text, not a foreign key to `jobs` — a connection never requires a tracked job to exist.
- `usage_log` — one row per Claude API call: route, model, input/output/cache tokens, web_search_requests, cost_usd. Written by `lib/usage.ts`, read by the Profile page's Usage & Cost card.

**Legacy/orphaned tables** (still created by the migration for backward compatibility with old data, no longer written by any current feature): `timeline_events`, `leads`, `company_ats_cache` — these backed the cut Timeline, Discover/Hunt Agent, and Discover/leads-liveness features. Not deleted on purpose (no destructive `DROP TABLE` without being asked); if you're touching this schema, don't build new features against them without checking they're really meant to come back.

There is no hardcoded seed data anymore — a fresh `user_id` starts with empty tables until they complete `/setup` and start using the app.

## Architecture

One page, three overlays (June 2026 redesign — see Design system below). `app/page.tsx` carries the greeting, free Priorities strip, stats, and the full job tracker table — this is the whole app for a logged-in user. Coach, Profile/Memory, and Connections are summonable panels rendered globally from `layout.tsx`, opened via `useOverlays()` (`app/OverlayContext.tsx`), not routes. There is no sidebar and no per-page nav; the header (`app/layout.tsx`) is a slim, sticky top bar with the `jobs_` wordmark on the left (no icon mark — tried a fox-head logo, cut it, see roadmap) and Connections/Coach/Profile triggers on the right.

```
app/
├── layout.tsx              # Slim sticky header (jobs_ wordmark, no icon mark, Connections/Coach/Profile triggers) + OverlayProvider, renders all three panels globally
├── OverlayContext.tsx      # useOverlays() — open/close state for all three overlays: openCoach(prefill?), openProfile(tab?), openConnections(prefillCompany?)
├── ClientRoot.tsx          # Redirects to /welcome if cid_user_id missing from localStorage (the API key is optional — see Multi-user model)
├── globals.css             # Design tokens (see Design system below)
├── page.tsx                # THE app: greeting + Priorities strip + stats + the full job tracker (import, company groups, detail panel) — everything lives here now
├── welcome/page.tsx        # Landing page (pre-auth, full-bleed) — Get Started, or restore-from-backup shortcut
├── setup/page.tsx          # 4-step onboarding (pre-auth, full-bleed)
├── components/
│   ├── CoachPanel.tsx        # General chat overlay — knows resume/profile/memories/jobs, no job-specific analysis. Slides in from the right.
│   ├── ProfilePanel.tsx      # Profile + Memory merged into one tabbed overlay (Profile / Strength / Usage / Memory). Centered modal.
│   └── ConnectionsPanel.tsx  # All connections, independent of any tracked job. Centered modal. Exports the Connection type + CONN_STATUS/CONN_CYCLE that page.tsx's in-job Network view imports.
├── hooks/useUser.ts        # Reads cid_user_id / display name from localStorage
└── api/
    ├── export/route.ts, import/route.ts # Full data export/restore (no accounts — this is the only recovery path)
    ├── chat/route.ts, chat/history/route.ts, chat/memories/route.ts
    ├── connections/route.ts, connections/[id]/route.ts  # not job-scoped — see Networking / connections below
    ├── jobs/route.ts, jobs/[id]/route.ts, jobs/import/route.ts   # import accepts a URL, pasted text, or both
    ├── jobs/[id]/analyze/route.ts       # 5-category fit scorecard — the AI score per imported job
    ├── jobs/[id]/bullets/route.ts       # Resume bullet tailoring
    ├── jobs/[id]/cover-letter/route.ts
    ├── jobs/[id]/gaps/route.ts          # Fit gaps + positioning
    ├── memories/route.ts, memories/[id]/route.ts
    ├── profile/route.ts, profile/resume/route.ts, profile/resume/extract/route.ts
    ├── resumes/route.ts, resumes/[id]/route.ts  # Multi-resume CRUD — list/create/rename/set-default/delete
    └── usage/route.ts                   # Aggregated cost/token totals for the current user, consumed by Profile

lib/
├── db.ts              # Turso/libsql singleton
├── user.ts            # getUserId / isSystemUser from request headers — see Multi-user model
├── apiFetch.ts         # Client fetch wrapper — injects x-user-id header
├── gemini.ts           # Groq AI client (name is legacy). Exports getAIClient() (OpenAI-compat pointed at Groq), GEMINI_MODEL (= llama-3.3-70b-versatile), getModel(), geminiUsage()
├── ai-context.ts       # buildSystemPrompt(userId) — resume + profile + dated memories + jobs, scoped per user
└── usage.ts            # computeCost() + logUsage() — every AI call site awaits this after the response comes back

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

Companies display vibrant hash-based initials badges — no network calls, no Clearbit dependency. Color is deterministic per company name using a 12-color palette. `CompanyBadge` is defined locally in `app/page.tsx`. These categorical company/status/score colors are a deliberate exception to the monochrome system (see Design system) — they exist to disambiguate at a glance, not to decorate.

## The main page (`app/page.tsx`)

Greeting + Priorities strip + stats + the job tracker table, top to bottom, one page:
- **Greeting + Priorities** — `getPriorities(jobs)` computes free, no-AI-call priority items from whatever's already loaded: deadlines (≤3 days = urgent, ≤7 = soon), 14+ day no-response follow-ups, interview-prep flags. Sorted by urgency bucket first, then `match_score` descending as a tiebreaker. Clicking a priority item calls `jumpToJob(id)` — expands that job's company group and row in the table below and scrolls to it (`id="job-row-{id}"`), rather than navigating anywhere. An "interview prep" priority instead opens the Coach overlay with a prefilled prompt about that job. This is the only "what should I prioritize" surface — Weekly Brief and the Strategy advisor were both cut as redundant with it (see roadmap).
- **Add a Job (primary)** — one button, one modal, two paths: paste a URL/description for AI auto-fill (review/edit → save), or click "skip straight to typing it in yourself" to jump to the same blank form. A URL alone fetches and parses the page (Jina reader first, falls back to plain fetch); pasted text alone needs no link. Combines up to 4 context sources (URL, pasted text, screenshot, extra link) before extracting structured fields in one Haiku pass. Fields not found anywhere are left blank — no data is invented. No API key → a friendly inline prompt to add one in Profile instead of attempting the call.
- **Source detection** — URL hostname mapped to a source label (LinkedIn, Greenhouse, Lever, Workday, Handshake, etc.); pasted-text-only jobs are labeled "Pasted."
- **Company groups** — jobs grouped by company, collapsible, with aggregate match score.
- **Inline status change** — click status badge → dropdown → `PATCH` partial update.
- **Detail slide panel** — location, deadline countdown, source, salary, URL, notes, a collapsible full-description block, plus AI Score / Cover Letter / Fit Gaps / Bullets tabs. These are the only per-job AI surfaces — there is no "discuss with Coach" handoff anymore (cut deliberately; Coach is general-only, see below). The Overview tab's Network section lists connections at that job's company (view/status-cycle/delete in context) but adding/editing one always opens the standalone Connections overlay — see Networking / connections below.
- **Search + filter, column sorting, smart deadline countdown.**
- **Empty state** — tracker starts empty; prompts the user to import a job.

## Coach (overlay, `app/components/CoachPanel.tsx`)

- General streaming chat only — no job-specific analysis (that lives in the tracker's detail-panel tabs) and no mock interview mode (cut — pointless without voice).
- A right-side slide-in panel summoned via `useOverlays().openCoach(prefill?)`, not a route. `openCoach` accepts an optional prefilled message (used by the Priorities "interview prep" item).
- Persistent memory extraction after each response (see Memory system above).
- Quick-action prefills: "What should I apply to?", "Interview prep" (a conversation about prep, not a simulation), "Cold outreach."

## Profile + Memory (overlay, `app/components/ProfilePanel.tsx`)

- A centered modal summoned via `useOverlays().openProfile(tab?)`, tabbed: **Profile** (personal/education/targets fields, multi-resume management, backup & restore), **Usage** (cost/token breakdown), **Memory** (the memory CRUD list, merged in from the old standalone `/memory` page).

## Networking / connections (overlay, `app/components/ConnectionsPanel.tsx`)

- **Decoupled from tracked jobs.** A connection is `{company, name, email, role, linkedin, relationship, notes, status}` — `company` is free text, never required to match a job you've actually tracked. You can log a recruiter you met at a career fair from a company you have no job tracked at yet; that was the whole point of pulling this out of the per-job panel. `GET /api/connections` (no `company` param) lists everything for the standalone overlay; passing `?company=X` filters, which is what the in-job Network view still uses.
- Outreach status cycles `not_reached_out` → `reached_out` → `responded` → `warm` (`CONN_STATUS`/`CONN_CYCLE`, exported from `ConnectionsPanel.tsx`).
- One add/edit form in the whole app, inside the overlay — the old per-job inline add-form (name/relationship/notes only, no email/role/linkedin) was removed in favor of this. Opening the overlay from a job's Network tab (`openConnections(job.company)`) pre-fills the company field.
- Company-keyed for display — contacts at a company show up across every job tracked at that company, and in the standalone overlay grouped the same way.
- `app/api/connections/route.ts` (`GET`/`POST`), `connections/[id]/route.ts` (`PATCH` — general partial update across any editable field, not status-only; `DELETE`).

## API notes

- `PUT /api/jobs/[id]` — full update, requires all fields. `PATCH` — partial update (e.g. status only). Both scope the response lookup by `user_id`, not just the write — see Multi-user model.
- `POST /api/jobs/import` — `{ url?, extraText?, imageBase64?, imageMediaType?, extraLink? }`, requires at least one of `url`/`extraText` → Haiku extraction, returns `{ company, title, location, type, deadline, salary_range, description, url, source, warning? }`. `url` in the response is `null` when none was given.
- `POST /api/jobs/[id]/analyze` — 5-category fit scorecard, each category constrained to an enum of anchored values, weighted to a total out of 100: Explicit Requirements Met (0-25), Skills Match (0-20), Role Alignment (0-20), Industry Fit (0-20), Logistics/Location Fit (0-15). `qwen/qwen3-32b` (Groq reasoning model), `temperature: 0`. Scores *fit for this specific posting*, not general candidate strength — scored against what's literally on the resume today, with explicit-requirement misses capped low regardless of overall strength. Color coding on the total: 80+ green, 60–79 amber, <60 red; per-category bars are colored by percent-of-that-category's-max, not the raw score. This is the per-job AI score the whole tracker is built around.
- `POST /api/jobs/[id]/gaps`, `POST /api/jobs/[id]/bullets`, `POST /api/jobs/[id]/cover-letter` — per-job AI panels, all read from `buildSystemPrompt(userId)` + the job record.
- `GET /api/export` — full data dump for the current user across all active tables. `POST /api/import` — restores from that dump into the current user (upserts profile, appends everything else including resumes). Used by Profile's Backup & Restore card, and by `/welcome`'s restore shortcut for a fresh browser/device; the only recovery path since there are no accounts.
- `GET /api/resumes` — list the user's resumes (default first). `POST /api/resumes` — create one (`{name, raw_text}`); the first resume for a user is auto-marked default. `PUT /api/resumes/[id]` — update `name`/`raw_text`, or pass `{set_default: true}` to make it the one AI features read (clears the previous default first to respect the partial unique index). `DELETE /api/resumes/[id]` — deletes it; if it was the default, the oldest remaining resume is auto-promoted.

## Design system (terminal, June 2026)

Full rebuild from the old "icy glass" theme (midnight navy, cyan glow, backdrop-blur glass cards, an animated orb mascot) — deliberately replaced per direct user direction: primary black, terminal/monospace, one orange accent, no glow/blur/gradient decoration anywhere, no icon mark of any kind (a fox-head logo was tried, iterated twice, then cut entirely — see roadmap). See PRODUCT.md for the brand rationale and the non-negotiable rule: the terminal look is skin-deep, every interaction stays point-and-click.

Tokens defined in `app/globals.css`, all verified against WCAG AA on the `--bg` canvas (ratios noted in the CSS comment):
- Background: `--bg #0A0A0A` (primary black), `--surface #161616` / `--surface-2 #1F1F1F` for elevated panels — flat fills, no blur
- Borders: `--border #2A2A2A` / `--border-hi #3A3A3A` / `--border-dim #1C1C1C`
- Text: `--text #F5F5F5` (~18:1), `--text-muted #9CA3AF` (~7.8:1, the floor for any real body/label text), `--text-dim #6B7280` (~4.1:1 — large/bold or decorative only, never body copy or placeholders)
- Accent: `--accent #F97316` (orange, ~7.1:1) — the brand color, primary actions, and the "medium score / in-progress" semantic tier. `--accent-hi #FB923C` for hover.
- Semantic (kept to the minimum the product needs, restrained color strategy): `--success #34D399` (~10.3:1 — offer status, high score), `--danger #F87171` (~7.2:1 — rejected status, low score)
- Categorical exceptions: `BADGE_PALETTE` (company initials), `TYPE_COLORS`, `STATUS_STYLE`/`CONN_STATUS` keep distinct varied hues on purpose — they disambiguate data, not decorate chrome. Everything else on the page is monochrome + the one accent.
- Font: JetBrains Mono, one family for everything (headings, labels, data, AI-generated prose) — no sans-serif anywhere
- Radius scale tightened for a sharper, less-rounded feel: `--r-sm 4px` / `--r 6px` / `--r-lg 10px`
- The `>` prompt motif: `.prompt::before` prefixes section headers; the brand wordmark is `jobs_` with the trailing underscore in accent orange
- No brand/icon mark — the `jobs_` wordmark (monospace, trailing underscore in accent orange) is the only brand element. A fox-head SVG mark was built, iterated on twice, then cut entirely (see roadmap) rather than kept as a half-right compromise.
- No sidebar, no per-page chrome — see Architecture above for the one-page-plus-overlays shell

## AI model usage

All AI calls go through Groq via the OpenAI-compatible client in `lib/gemini.ts`, using the server-side `GROQ_API_KEY`. Two models:

- **Generative routes** (coach chat, memory extraction, fit gaps, resume bullets, cover letter, job import parsing): `llama-3.3-70b-versatile`, streaming where applicable via the OpenAI SDK's `.stream()` helper
- **Fit scorecard** (`/api/jobs/[id]/analyze`): `qwen/qwen3-32b` — reasoning model, follows rubric anchors more literally. `temperature: 0`, structured JSON output so each rubric sub-score can only land on one of its anchored values — see API notes above. Reasoning models sometimes emit `<think>…</think>` before JSON; the route strips it before parsing.

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
22. **Fit scorecard rubric rewrite** — same fix as the Candidate Strength rubric, applied to `jobs/[id]/analyze`: dropped the open 0-100-per-category continuum (and the "Growth Potential" category entirely — "could grow into it" is exactly the speculative credit that produces false hope) for 5 categories on anchored, enum-constrained bands, weighted toward a literal Explicit Requirements Met check as the most realistic predictor of clearing a screen. Upgraded Haiku → Sonnet 4.6 given this is now the centerpiece feature. Verified live against two sharply different test jobs (a bulge-bracket IB stretch role vs. a realistic regional-bank match for the same resume): scores landed at 39/100 and 86-92/100 respectively, with specific, falsifiable rationale, and were bit-for-bit identical across repeated runs on the same job after one rubric-wording fix (the "no location stated" case was genuinely ambiguous and caused the only observed wobble).
23. **Terminal redesign** (June 2026, via `/impeccable`) — full visual + IA rebuild on explicit user direction. Replaced the icy-glass theme with the black/white/orange terminal system (see Design system). Collapsed Home + Tracker into one page (`app/page.tsx`) — Coach and Profile/Memory became summonable overlays (`OverlayContext`, `CoachPanel`, `ProfilePanel`) instead of nav destinations, dropping the sidebar entirely for a slim sticky header. Added an original geometric fox-head brand mark (`FoxMark`). Caught and fixed real pre-existing staleness while in there: `/welcome`'s feature copy still advertised the cut Hunt Agent and mock interview mode; `/welcome` and `/setup` both referenced `.brand-orb` CSS classes that no longer existed post-rebuild. Verified via Playwright across the full flow (welcome → setup → populated tracker → AI Score tab → both overlays → mobile viewport) before shipping.
24. **Real-usage fixes after the redesign shipped** — a batch of fixes from actually using the live site, not speculative polish:
    - **API key is now optional.** `/setup` has a "Skip for now" link on the apikey step; `ClientRoot`/`useUser` gate onboarding-completion on identity (`cid_user_id`) alone, not the key. A key can be added or updated anytime from Profile's new API Key card. Every AI-gated action (Import, AI Score, Coach send, Candidate Strength) now checks for a key client-side first and shows a friendly "Add your API key in Profile" prompt with a direct link there, instead of a raw 401.
    - **Fixed a real bug**: `.txt` resume uploads were hard-coded in `lib/resumeExtract.ts` to return `{ text, profile: null }` client-side, completely skipping the server-side field-extraction pipeline — meaning the "auto-fill my profile from my resume" feature silently never worked for plain-text resumes, plausibly the single most common upload type. Now routed through the same `/api/profile/resume/extract` pipeline as PDF/docx/images. Also broadened the Haiku formatting-cleanup pass in that route to run for any non-vision extraction path (not just the narrow "looks like one giant paragraph" heuristic), since mammoth/unpdf fast-path extraction can come back layout-garbled in ways that heuristic missed.
    - **Email/LinkedIn now do something**: `lib/ai-context.ts` passes them (plus phone) into every AI system prompt, and the cover-letter prompt (`jobs/[id]/cover-letter`) is instructed to close with a real signature block using whichever are actually on file. Labeled "(optional — used to sign cover letters)" in both `/setup` and Profile so the reason to fill them in is obvious instead of just trusting an absent asterisk.
    - **Dialed back the terminal affectation** — the `.prompt` (`>`) motif and all-lowercase styling were applied to every page/panel header (Home greeting, Coach title, Profile title), which read as confusing rather than techy. Restricted `.prompt` to the one legitimate brand-mark location (the `jobs_` logo on `/welcome` and `/setup`); everything else is normal sentence case. Added a `.header-btn` class (visible border at rest, not just on hover) so the Coach/Profile header buttons read unambiguously as buttons.
    - **Softened the palette** — `--bg`/`--surface`/`--surface-2`/`--border`/`--text-muted`/`--text-dim` all bumped a notch lighter/brighter (still primary black, just less harsh); see the updated ratios in the `globals.css` comment.
    - **Merged Import + Manual into one "Add a Job" flow** — the two separate buttons/modals were confusing ("which one do I use?"). Now one button opens one modal: paste a link/description for AI auto-fill, or click "skip straight to typing it in yourself" to jump straight to the same review form blank. The standalone Add/Edit modal now only handles editing an already-tracked job (via the row's edit icon); it never opens for new-job creation anymore.
    - **Cut the manual "Add Memory" form** from Profile's Memory tab — kept view/delete (transparency into what the AI has learned), removed the add-it-yourself form since manually feeding the AI facts about yourself isn't a real usage pattern. Added a one-line clarification to the Strength tab explaining it answers a different question than the per-job AI Score (general resume quality vs. fit for one specific posting), since the two looked redundant without that context.
25. **Decoupled Connections from tracked jobs** — `connections.company` was always free text at the DB level, but the only UI to add or view one lived inside a tracked job's detail panel, keyed to that job's company; you couldn't log a contact unless you already had a job tracked at their company. Added a standalone overlay (`ConnectionsPanel.tsx`, third header trigger alongside Coach/Profile) with one add/edit form covering name, company, email, role, LinkedIn, relationship, and notes — `GET /api/connections` already supported listing everything with no `company` filter, that capability just wasn't surfaced anywhere. The in-job Network tab still shows that company's connections in context (view/status-cycle/delete), but its "+ Add" now opens the standalone overlay pre-filled with the company instead of using its own narrower inline form — one add form in the app, not two with diverging field sets. Schema gained `email`/`role`/`linkedin` columns via the existing idempotent `addColumn` migration pattern.
26. **Mobile-responsive pass on the tracker table** — below 768px, the column-grid job row (`app/page.tsx`) switches to a stacked layout: a top line (star, title, edit/delete) and a wrapped second line (type, status, score, due/posted) instead of the fixed `GRID` columns that previously forced `overflowX: auto` horizontal scrolling on phones. The desktop grid is unchanged above that width. The column-header row and the 720px `minWidth` on the company-group header are both gated to desktop-only for the same reason. Caught and fixed two pre-existing overflow bugs surfaced while verifying this at a 390px viewport: the status-filter pills (`all/saved/applied/...`) sat in a nested flex div with no `flexWrap`, and the sticky header's three full-text buttons (Connections/Coach/Profile) didn't fit at narrow widths — both now wrap/collapse instead of pushing the whole page into horizontal scroll (the header drops to icon-only via a new `.header-btn-label` class hidden under 480px). Verified live with Playwright at 390px: page `scrollWidth` matches `clientWidth` exactly (no horizontal scroll) in collapsed, company-expanded, and job-expanded states.

### Cut
- **The fox-head brand mark** (`app/components/FoxMark.tsx`, `app/icon.svg`) — built and iterated on twice (the first pass didn't read as a fox at all; the second pass fixed that but still looked like a jack-o-lantern), then removed entirely on "get rid of the logo everywhere" rather than attempting a third pass. The `jobs_` wordmark alone carries the brand now. Favicon falls back to the pre-existing `app/favicon.ico`.
- `/api/analyze/jd` — deleted (was dead code, no UI consumer).
- Analytics and Timeline pages — removed (low utility for new users with few/no jobs tracked).
- Legacy single-user migration scripts (`migrate.ts`, `migrate-v2.ts`, `migrate-v3.ts`) — deleted; `migrate-multi-user.ts` is the only migration now.
- **Application Strategy advisor** (`/api/strategy` + its Home card) — overlapped with the free Priorities card and Weekly Brief's `priority_actions`; silently no-op'd with no error UI when a user had zero tracked jobs. Its one distinct value (fit-score ranking) was folded into Priorities as a free sort tiebreaker.
- **Discover page entirely** (`/discover`, Hunt Agent, Idea Feed, company research, `leads` table) — the Hunt Agent wasn't reliable and, more importantly, wasn't specific enough to the user's actual target roles/locations to be worth the agentic-search complexity. Company research was "cool but not necessary — they can ask Google." `lib/ats.ts` and `lib/liveness.ts` were deleted as dead code (only the Hunt Agent used them).
- **Weekly Brief** (`/api/brief` + its Home card) — same redundancy pattern as Strategy: a third AI surface answering "what should I focus on" that the free Priorities card already covers. The one thing it did that nothing else covers (deadline awareness) was already redundant with Import extracting `deadline` and Priorities surfacing it.
- **Mock interview mode on Coach** (`/api/interview`) — "pointless if you can't speak it"; a text Q&A loop doesn't simulate a real interview closely enough to be worth keeping.
- **Job-specific entry points into Coach** — the cover-letter-via-Coach shortcut icon on the tracker (redundant with the dedicated Cover Letter tab, which has tone/angle controls Coach's prompt didn't) and the "Discuss with Coach" score-handoff button (redundant once the fit scorecard is in-depth enough to stand on its own). Coach is now general-chat-only; per-job analysis lives entirely in the tracker's detail panel.
- **"Analyze a JD" Coach quick action** — the gap it covered (a JD with no link) is now handled by Import itself accepting pasted-text-only, which produces a tracked, scored job instead of an ephemeral chat answer.
- **Job Details tab** (`jobs/[id]/details` route + its tab in the detail panel) — the weakest of the per-job AI panels on review: company overview and role summary were the same "ask Google" territory already used to justify cutting Discover, and its "Your Angle" blurb outright duplicated Fit Gaps' `positioning` field. The one non-AI thing it provided — viewing the full stored job description — moved to a plain collapsible block in the Overview tab (no API call, just rendering `job.description`).

### Not yet done
- Chrome extension for one-click save from any tab.
- BYOK onboarding friction — getting an Anthropic API key is real friction for non-technical users; consider a hand-holding flow or a capped trial key pool.
- A "Contact us" / feedback surface (bug reports + feature requests, with screenshot attachment) that routes to an AI which can read, triage, and partially or fully act on submissions — floated as an idea for once there are real outside users (Nicholas's friends), not yet designed or built. Worth thinking through the auto-approve attack surface before building the "AI acts on it directly" part.
- The legacy orphaned `profile` row (`id=1`, `user_id` still `NULL` — predates the multi-user migration) is dead/unreachable but hasn't been deleted.
