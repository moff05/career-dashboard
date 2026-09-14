import { getDb } from '@/lib/db';
import { scoreJobFit } from '@/lib/scoreJobFit';
import { resolveBoard, fetchBoardPostings, SOURCE_LABEL, type RawPosting } from '@/lib/boardCompanies';

// Shared by the weekly cron (app/api/cron/scan-boards, all users) and the
// on-demand refresh a user can trigger themselves once they've cleared their
// current review queue (app/api/discovered/refresh, one user). See the
// cron route for the full incident history behind the matching/staging
// safeguards here — this is a straight extraction, not a rewrite.

export const TIME_BUDGET_MS = 50_000; // leave headroom under the 60s ceiling
export const TOP_N = 20; // staged per run, per user (raised from 10 now that scans are weekly, not daily)
export const MAX_CANDIDATES_PER_USER = 40; // raised from 20 alongside TOP_N, same reasoning

const STOPWORDS = new Set(['and', 'the', 'for', 'of', 'to', 'a', 'an', 'in', 'or', 'with']);

function keywordPhrasesFromRoles(targetRoles: string): string[] {
  const phrases = new Set<string>();
  for (const rawPhrase of targetRoles.split(',')) {
    const words = rawPhrase.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && !STOPWORDS.has(w));
    if (words.length === 0) continue;
    if (words.length === 1) { phrases.add(words[0]); continue; }
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

interface CompanyRow {
  id: number;
  name: string;
  career_url: string | null;
}

export interface ScanUserStats {
  companiesScanned: number;
  companiesSkipped: string[];
  candidatesFiltered: number;
  staged: number;
  scored: number;
}

export interface ScanUserResult {
  stats: ScanUserStats;
  notes: string[];
  dryRunCandidates?: { company: string; title: string; location: string; url: string }[];
}

// Cache of in-flight board fetches keyed by career_url, so a caller scanning
// several users in one process (the cron loop) doesn't re-fetch the same
// company's board once per user. A one-off single-user refresh can just pass
// a fresh empty map.
export type PostingsCache = Map<string, Promise<RawPosting[]>>;

export async function scanBoardsForUser(
  userId: string,
  profile: { target_roles: string; target_cities: string },
  opts: { dryRun?: boolean; postingsCache?: PostingsCache; startedAt?: number } = {}
): Promise<ScanUserResult> {
  const startedAt = opts.startedAt ?? Date.now();
  const dryRun = !!opts.dryRun;
  const postingsCache: PostingsCache = opts.postingsCache ?? new Map();
  const db = getDb();
  const notes: string[] = [];

  function getPostingsCached(careerUrl: string, board: ReturnType<typeof resolveBoard>) {
    if (!postingsCache.has(careerUrl)) postingsCache.set(careerUrl, fetchBoardPostings(board!));
    return postingsCache.get(careerUrl)!;
  }

  const keywordPhrases = keywordPhrasesFromRoles(profile.target_roles);
  const cities = citiesFromProfile(profile.target_cities);
  const skipped: string[] = [];
  const stats: ScanUserStats = { companiesScanned: 0, companiesSkipped: skipped, candidatesFiltered: 0, staged: 0, scored: 0 };

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
  stats.companiesScanned = scannable.length;

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
  stats.candidatesFiltered = candidates.length;

  if (candidates.length > MAX_CANDIDATES_PER_USER) {
    notes.push(`${userId}: ${candidates.length} candidates matched, capped to ${MAX_CANDIDATES_PER_USER} before scoring.`);
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

  const newCandidates: Candidate[] = [];
  for (const c of candidates) {
    const existingJob = await db.execute({ sql: 'SELECT id FROM jobs WHERE user_id = ? AND url = ?', args: [userId, c.url] });
    if (existingJob.rows.length > 0) continue;
    const existingDiscovered = await db.execute({ sql: 'SELECT id FROM discovered_jobs WHERE user_id = ? AND url = ?', args: [userId, c.url] });
    if (existingDiscovered.rows.length > 0) continue;
    newCandidates.push(c);
  }

  if (dryRun) {
    return { stats, notes, dryRunCandidates: newCandidates.map((c) => ({ company: c.company, title: c.title, location: c.location, url: c.url })) };
  }

  for (let i = newCandidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newCandidates[i], newCandidates[j]] = [newCandidates[j], newCandidates[i]];
  }

  const scored: { candidate: Candidate; result: Awaited<ReturnType<typeof scoreJobFit>> }[] = [];
  for (const candidate of newCandidates) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      notes.push(`${userId}: time budget hit — ${newCandidates.length - scored.length} candidate(s) left unscored this run.`);
      break;
    }
    try {
      const result = await scoreJobFit(userId, { id: -1, company: candidate.company, title: candidate.title, type: inferType(candidate.title), location: candidate.location || null, description: candidate.description || null });
      scored.push({ candidate, result });
      stats.scored++;
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
    stats.staged++;
  }
  // Scored-but-not-top-N rows are still recorded (status 'discarded') so the
  // (user_id, url) unique index keeps them from being re-fetched/re-scored
  // on a future run.
  for (const { candidate, result } of rest) {
    await db.execute({
      sql: `INSERT OR IGNORE INTO discovered_jobs (user_id, company, title, type, location, url, description, posting_date, source, match_score, score_data, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'discarded')`,
      args: [userId, candidate.company, candidate.title, inferType(candidate.title), candidate.location || null, candidate.url, candidate.description || null, candidate.postedAt, candidate.source, result.total, JSON.stringify(result)],
    });
  }

  return { stats, notes };
}
