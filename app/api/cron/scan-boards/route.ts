import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { scoreJobFit } from '@/lib/scoreJobFit';
import { resolveBoard, fetchBoardPostings, SOURCE_LABEL, type RawPosting } from '@/lib/boardCompanies';

// Daily job-board scan: for every user who has both target_roles and
// target_cities set, scans that user's own tracked Companies list (whichever
// of them resolve to a Greenhouse/Lever/Ashby/Workday board via
// companies.career_url — see lib/boardCompanies.ts), filters postings
// against that user's own profile, scores the survivors with the same fit
// rubric as a manual "AI Score" click, and stages the best 10 as *pending
// review* rows in `discovered_jobs` — nothing is added to the real tracker
// automatically. The user reviews and adds/dismisses each one from the
// dashboard (GET/PATCH /api/discovered).
//
// This is the productionized version of the `job_board_agent` skill piloted
// by hand on 2026-09-08 (~/aios/.claude/skills/job_board_agent.md).
//
// IMPORTANT HISTORY: an earlier version of this route matched on single
// words extracted from target_roles ("engineer", "data", "analyst", ...)
// and inserted directly into the real tracker. Tested once against
// production, it matched almost every posting on a few large boards and
// wrote 1,030 junk rows into two real users' trackers before being caught
// and cleaned up. Two independent fixes came out of that:
//   1. Matching now requires a bigram (two-word phrase) from target_roles,
//      or an exact phrase match — a single generic word is never enough
//      (see keywordPhrasesFromRoles/matchesKeywords below).
//   2. Nothing touches the real `jobs` table until the user explicitly
//      approves a specific posting — see the staging table above.
// Treat any further change to the matching logic here as production code
// that writes real users' data on the first run, not a script to iterate on
// live — use ?dryRun=1 (below) and/or a local sqlite DB to test changes.

export const maxDuration = 60;
const TIME_BUDGET_MS = 50_000; // leave headroom under the 60s ceiling
const TOP_N = 10;
// Safety cap on how many postings get filtered-in per run, even before
// scoring. Kept modest (not just a defensive ceiling) because each fit-score
// call is genuinely slow (~15-20s observed) — a 60s serverless run can only
// get through a handful sequentially, so a much larger pool would mostly
// just sit as dead weight re-fetched and re-filtered on every run without
// ever being reached.
const MAX_CANDIDATES_PER_USER = 20;

interface ProfileRow {
  user_id: string;
  target_roles: string;
  target_cities: string;
}
interface CompanyRow {
  id: number;
  name: string;
  career_url: string | null;
}

const STOPWORDS = new Set(['and', 'the', 'for', 'of', 'to', 'a', 'an', 'in', 'or', 'with']);

// Bigrams (and the full phrase itself) from each comma-separated target-role
// phrase — e.g. "Business Technology Analyst" -> ["business technology",
// "technology analyst", "business technology analyst"]. A single word is
// deliberately never enough to match on its own: "Data Analyst" as a target
// role should not match a posting titled just "Software Engineer" through
// the shared word "engineer" — see the incident note above.
function keywordPhrasesFromRoles(targetRoles: string): string[] {
  const phrases = new Set<string>();
  for (const rawPhrase of targetRoles.split(',')) {
    const words = rawPhrase.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && !STOPWORDS.has(w));
    if (words.length === 0) continue;
    if (words.length === 1) { phrases.add(words[0]); continue; } // a genuinely one-word target role is kept as-is
    phrases.add(words.join(' '));
    for (let i = 0; i < words.length - 1; i++) phrases.add(`${words[i]} ${words[i + 1]}`);
  }
  return [...phrases];
}

function citiesFromProfile(targetCities: string): string[] {
  return targetCities.split(',').map((c) => c.trim().toLowerCase()).filter(Boolean);
}

function matchesKeywords(title: string, phrases: string[]): boolean {
  const lowerTitle = title.toLowerCase();
  return phrases.some((p) => lowerTitle.includes(p));
}

function matchesCity(location: string, cities: string[]): boolean {
  const lowerLoc = location.toLowerCase();
  if (!lowerLoc) return false;
  if (lowerLoc.includes('remote')) return true;
  return cities.some((city) => lowerLoc.includes(city));
}

function inferType(title: string): string {
  return /\bintern(ship)?\b/i.test(title) ? 'internship' : 'full-time';
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }
  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';

  const db = getDb();
  const notes: string[] = [];

  const profiles = (await db.execute(
    `SELECT user_id, target_roles, target_cities FROM profile
     WHERE target_roles IS NOT NULL AND trim(target_roles) != ''
       AND target_cities IS NOT NULL AND trim(target_cities) != ''`
  )).rows as unknown as ProfileRow[];

  const perUser: Record<string, { companiesScanned: number; companiesSkipped: string[]; candidatesFiltered: number; staged: number; scored: number }> = {};
  const dryRunCandidates: Record<string, { company: string; title: string; location: string; url: string }[]> = {};

  // Two users can track the same company (e.g. both have Anduril) — cache
  // each distinct career_url's fetch across the whole run instead of
  // re-fetching it per user. Also fetch a user's companies in parallel
  // rather than one at a time: these are independent network calls, and
  // sequential fetching (especially with Workday's multi-page pagination)
  // was eating enough of the time budget on its own to meaningfully cut
  // into how many candidates got scored — see MAX_CANDIDATES_PER_USER note.
  const postingsCache = new Map<string, Promise<RawPosting[]>>();
  function getPostingsCached(careerUrl: string, board: ReturnType<typeof resolveBoard>) {
    if (!postingsCache.has(careerUrl)) postingsCache.set(careerUrl, fetchBoardPostings(board!));
    return postingsCache.get(careerUrl)!;
  }

  for (const profile of profiles) {
    const userId = profile.user_id;
    const keywordPhrases = keywordPhrasesFromRoles(profile.target_roles);
    const cities = citiesFromProfile(profile.target_cities);
    const skipped: string[] = [];
    perUser[userId] = { companiesScanned: 0, companiesSkipped: skipped, candidatesFiltered: 0, staged: 0, scored: 0 };

    const companies = (await db.execute({
      sql: 'SELECT id, name, career_url FROM companies WHERE user_id = ?',
      args: [userId],
    })).rows as unknown as CompanyRow[];

    type Candidate = RawPosting & { company: string; source: string };
    const candidates: Candidate[] = [];

    const scannable = companies
      .map((company) => ({ company, board: resolveBoard(company.career_url) }))
      .filter((entry): entry is { company: CompanyRow; board: NonNullable<ReturnType<typeof resolveBoard>> } => {
        if (!entry.board) { skipped.push(entry.company.name); return false; }
        return true;
      });
    perUser[userId].companiesScanned = scannable.length;

    const results = await Promise.allSettled(
      scannable.map(({ company, board }) => getPostingsCached(company.career_url!, board).then((postings) => ({ company, board, postings })))
    );
    for (let i = 0; i < results.length; i++) {
      const outcome = results[i];
      const { company, board } = scannable[i];
      if (outcome.status === 'rejected') {
        const message = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
        console.error(`scan-boards: ${company.name} fetch failed for user ${userId}:`, message);
        notes.push(`${company.name}: scan failed (${message}) — skipped this run.`);
        continue;
      }
      for (const posting of outcome.value.postings) {
        if (!matchesKeywords(posting.title, keywordPhrases)) continue;
        if (!matchesCity(posting.location, cities)) continue;
        candidates.push({ ...posting, company: company.name, source: SOURCE_LABEL[board.platform] });
      }
    }
    perUser[userId].candidatesFiltered = candidates.length;

    if (candidates.length > MAX_CANDIDATES_PER_USER) {
      notes.push(`${userId}: ${candidates.length} candidates matched, capped to ${MAX_CANDIDATES_PER_USER} before scoring.`);
      // Round-robin across companies rather than a flat recency sort — a
      // platform that doesn't expose a post date (Workday's list endpoint
      // doesn't) would otherwise always sort last/first as a block and get
      // either starved or overrepresented; this keeps the cap from silently
      // favoring whichever company happens to have the most matches.
      const byCompany = new Map<string, Candidate[]>();
      for (const c of candidates) {
        if (!byCompany.has(c.company)) byCompany.set(c.company, []);
        byCompany.get(c.company)!.push(c);
      }
      const queues = [...byCompany.values()];
      const capped: Candidate[] = [];
      let i = 0;
      while (capped.length < MAX_CANDIDATES_PER_USER && queues.some((q) => q.length > 0)) {
        const q = queues[i % queues.length];
        if (q.length > 0) capped.push(q.shift()!);
        i++;
      }
      candidates.length = 0;
      candidates.push(...capped);
    }

    // Drop anything already seen (any status) for this user before spending
    // a scoring call on it.
    const newCandidates: Candidate[] = [];
    for (const c of candidates) {
      const existingJob = await db.execute({ sql: 'SELECT id FROM jobs WHERE user_id = ? AND url = ?', args: [userId, c.url] });
      if (existingJob.rows.length > 0) continue;
      const existingDiscovered = await db.execute({ sql: 'SELECT id FROM discovered_jobs WHERE user_id = ? AND url = ?', args: [userId, c.url] });
      if (existingDiscovered.rows.length > 0) continue;
      newCandidates.push(c);
    }

    if (dryRun) {
      dryRunCandidates[userId] = newCandidates.map((c) => ({ company: c.company, title: c.title, location: c.location, url: c.url }));
      continue;
    }

    // A real fit-scorecard call is slow enough (observed ~15-20s each, not
    // errors/retries — it's a long rubric prompt over a big system-prompt
    // context) that one run only gets through a handful of the up-to-40
    // candidates. Shuffle before scoring so a time-limited run makes
    // probabilistic progress across the whole matched set instead of always
    // scoring the same head-of-list candidates (stable company/API order)
    // and never reaching the rest.
    for (let i = newCandidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newCandidates[i], newCandidates[j]] = [newCandidates[j], newCandidates[i]];
    }

    // Score candidates one at a time (sequential — Groq's per-account TPM
    // budget is shared, see lib/groq.ts), then keep only the top N.
    const scored: { candidate: Candidate; result: Awaited<ReturnType<typeof scoreJobFit>> }[] = [];
    for (const candidate of newCandidates) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        notes.push(`${userId}: time budget hit — ${newCandidates.length - scored.length} candidate(s) left unscored this run.`);
        break;
      }
      try {
        // scoreJobFit writes to `jobs` by id — since these aren't in that
        // table yet, score with a throwaway id and persist the result
        // ourselves into discovered_jobs instead (see below).
        const result = await scoreJobFit(userId, { id: -1, company: candidate.company, title: candidate.title, type: inferType(candidate.title), location: candidate.location || null, description: candidate.description || null });
        scored.push({ candidate, result });
        perUser[userId].scored++;
      } catch (err) {
        console.error(`scan-boards: scoring "${candidate.title}" at ${candidate.company} for user ${userId} failed:`, err);
      }
    }

    scored.sort((a, b) => b.result.total - a.result.total);
    const top = scored.slice(0, TOP_N);
    const rest = scored.slice(TOP_N);

    for (const { candidate, result } of top) {
      await db.execute({
        sql: `INSERT OR IGNORE INTO discovered_jobs (user_id, company, title, type, location, url, description, posting_date, source, match_score, score_data, status)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        args: [userId, candidate.company, candidate.title, inferType(candidate.title), candidate.location || null, candidate.url, candidate.description || null, candidate.postedAt, candidate.source, result.total, JSON.stringify(result)],
      });
      perUser[userId].staged++;
    }
    // Scored-but-not-top-10 rows are still recorded (status 'discarded') so
    // the (user_id, url) unique index keeps them from being re-fetched and
    // re-scored on tomorrow's run.
    for (const { candidate, result } of rest) {
      await db.execute({
        sql: `INSERT OR IGNORE INTO discovered_jobs (user_id, company, title, type, location, url, description, posting_date, source, match_score, score_data, status)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'discarded')`,
        args: [userId, candidate.company, candidate.title, inferType(candidate.title), candidate.location || null, candidate.url, candidate.description || null, candidate.postedAt, candidate.source, result.total, JSON.stringify(result)],
      });
    }
  }

  return NextResponse.json({
    dryRun,
    usersScanned: profiles.length,
    perUser,
    notes,
    ...(dryRun ? { dryRunCandidates } : {}),
  });
}
