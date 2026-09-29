// Research step for the job-board scan (see lib/scanBoards.ts): when a
// user's own tracked Companies don't turn up enough matches in a run, ask a
// web-search-grounded model for other real companies in a similar space that
// might be worth scanning too. This is deliberately a separate, rare call —
// not part of the normal per-company fetch — since it's the one place in
// this feature that can suggest something not already vetted by the user.
//
// Safety note: nothing here is trusted at face value. Every suggestion this
// returns still has to independently resolve via resolveBoard() AND
// successfully fetch real postings before it's ever staged — see the
// caller in scanBoards.ts. A hallucinated company name or a URL that looks
// right but isn't live is filtered out there, not here.
import { getDb } from '@/lib/db';

export interface SimilarCompanyCandidate {
  name: string;
  careerUrl: string;
}

// Google Search grounding requires a billing account linked to the Gemini
// project to work at all (confirmed live 2026-09-28 — without it, every
// grounded call 429s even on a brand-new key). Once linked, Google gives
// 5,000 free grounded requests/month, shared across all Gemini 3.x models —
// this feature realistically uses a handful a month (called at most once per
// scan, and scans are weekly-cron or manually-gated). This cap sits just
// below the actual free allotment (not an arbitrary fraction of it) so real
// usage can use the whole free tier, while still guaranteeing a bug (a retry
// loop, a stuck cron re-firing) hits this cap before ever reaching Google's
// own billed overage.
const MONTHLY_GROUNDING_CAP = 4500;

async function ensureGroundingUsageTable() {
  const db = getDb();
  await db.execute(`CREATE TABLE IF NOT EXISTS gemini_grounding_calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    called_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  return db;
}

async function underMonthlyGroundingCap(): Promise<boolean> {
  const db = await ensureGroundingUsageTable();
  const result = await db.execute(
    `SELECT COUNT(*) as count FROM gemini_grounding_calls WHERE called_at >= date('now', 'start of month')`
  );
  const count = Number((result.rows[0] as unknown as { count: number | string }).count);
  return count < MONTHLY_GROUNDING_CAP;
}

async function recordGroundingCall() {
  const db = await ensureGroundingUsageTable();
  await db.execute(`INSERT INTO gemini_grounding_calls (called_at) VALUES (datetime('now'))`);
}

// Pinned rather than an alias like gemini-flash-latest, matching this repo's
// existing convention for the Groq models — but that same pinning is what
// caused a real outage once already (see the 2026-08-21 Groq model-removal
// note in the project's CLAUDE.md): if this starts 404ing with "no longer
// available", check `GET /v1beta/models` with the live key for whatever
// Google's current recommended replacement is.
const GEMINI_MODEL = 'gemini-3.8-flash';

export async function findSimilarCompanies(opts: {
  existingCompanyNames: string[];
  targetRoles: string;
  targetCities: string;
  count: number;
}): Promise<SimilarCompanyCandidate[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return [];

  if (!(await underMonthlyGroundingCap())) {
    console.error(`findSimilarCompanies: monthly grounding cap (${MONTHLY_GROUNDING_CAP}) reached, skipping until next month`);
    return [];
  }

  const prompt = `You are helping a job seeker widen their company search. They already track these companies: ${opts.existingCompanyNames.join(', ') || '(none yet)'}.
Their target roles: ${opts.targetRoles || '(not specified)'}.
Their target cities: ${opts.targetCities || '(not specified)'}.

Search the web and find up to ${opts.count} OTHER real companies (not in the tracked list above) that:
- Are similar in industry, size, or stage to the tracked companies, and would plausibly have openings matching the target roles
- Have a careers page you have actually found and confirmed is currently live, hosted on exactly one of these platforms:
  - Greenhouse: https://job-boards.greenhouse.io/{slug} or https://boards.greenhouse.io/{slug}
  - Lever: https://jobs.lever.co/{slug}
  - Ashby: https://jobs.ashbyhq.com/{slug}
  - Workday: https://{tenant}.wd#.myworkdayjobs.com/{site}

Only include a company if you found its real URL through search just now — never construct or guess a plausible-looking URL. If you can't verify a live careers page on one of those exact platforms, leave that company out entirely.

Respond with ONLY a JSON array, no other text, in this exact shape:
[{"name": "Company Name", "careerUrl": "https://..."}]`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ googleSearch: {} }],
        }),
        signal: AbortSignal.timeout(45000),
      }
    );
    // Recorded as soon as a response comes back (ok or not) — a request
    // that reached Google and got any reply consumed a grounded call
    // against the quota, even if the reply itself was an error.
    await recordGroundingCall();
    if (!res.ok) {
      console.error('findSimilarCompanies: Gemini request failed', res.status, await res.text());
      return [];
    }
    const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]) as { name?: unknown; careerUrl?: unknown }[];
    return parsed
      .filter((c): c is { name: string; careerUrl: string } => typeof c.name === 'string' && typeof c.careerUrl === 'string' && !!c.name.trim() && !!c.careerUrl.trim())
      .map((c) => ({ name: c.name.trim(), careerUrl: c.careerUrl.trim() }));
  } catch (err) {
    console.error('findSimilarCompanies: failed', err);
    return [];
  }
}
