import { getDb } from './db';

export type AtsProvider = 'greenhouse' | 'lever' | 'ashby';

export interface AtsJob {
  title: string;
  url: string;
  location: string;
  jobId?: string;
}

export type AtsResolution =
  | { outcome: 'confirmed'; job: AtsJob }
  | { outcome: 'dead' }
  | { outcome: 'unresolved' };

const FETCH_TIMEOUT_MS = 3000;
const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const TITLE_MATCH_THRESHOLD = 0.6;

const COMPANY_SUFFIX_PATTERN = /\b(inc|llc|corp|co|group|ltd|holdings|company)\b\.?/gi;

async function safeFetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function extractAtsRef(url: string | undefined): { provider: AtsProvider; slug: string; jobId?: string } | null {
  if (!url) return null;
  let host: string, pathname: string;
  try {
    const u = new URL(url);
    host = u.hostname.toLowerCase();
    pathname = u.pathname;
  } catch {
    return null;
  }

  if (host.includes('greenhouse.io')) {
    const job = pathname.match(/\/([^/]+)\/jobs\/(\d+)/);
    if (job) return { provider: 'greenhouse', slug: job[1], jobId: job[2] };
    const board = pathname.match(/^\/([^/]+)\/?$/);
    if (board) return { provider: 'greenhouse', slug: board[1] };
    return null;
  }

  if (host.includes('lever.co')) {
    const job = pathname.match(/\/([^/]+)\/([0-9a-f-]{8,})/i);
    if (job) return { provider: 'lever', slug: job[1], jobId: job[2] };
    const board = pathname.match(/^\/([^/]+)\/?$/);
    if (board) return { provider: 'lever', slug: board[1] };
    return null;
  }

  if (host.includes('ashbyhq.com')) {
    if (host === 'jobs.ashbyhq.com') {
      const job = pathname.match(/\/([^/]+)\/([0-9a-f-]{8,})/i);
      if (job) return { provider: 'ashby', slug: job[1], jobId: job[2] };
      const board = pathname.match(/^\/([^/]+)\/?$/);
      if (board) return { provider: 'ashby', slug: board[1] };
      return null;
    }
    const sub = host.split('.')[0];
    if (sub && sub !== 'api' && sub !== 'www') {
      const job = pathname.match(/\/([0-9a-f-]{8,})/i);
      return { provider: 'ashby', slug: sub, jobId: job ? job[1] : undefined };
    }
  }

  return null;
}

export function guessSlugCandidates(companyName: string): string[] {
  const cleaned = companyName
    .toLowerCase()
    .replace(COMPANY_SUFFIX_PATTERN, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!cleaned) return [];
  const squashed = cleaned.replace(/\s+/g, '');
  const hyphenated = cleaned.replace(/\s+/g, '-');
  const firstWord = cleaned.split(' ')[0];
  return Array.from(new Set([squashed, hyphenated, firstWord].filter(Boolean)));
}

function normalizeWords(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1)
  );
}

export function findBestTitleMatch(proposedTitle: string, jobs: AtsJob[]): AtsJob | null {
  const proposed = normalizeWords(proposedTitle);
  if (proposed.size === 0) return null;
  let best: AtsJob | null = null;
  let bestScore = 0;
  for (const job of jobs) {
    const jobWords = normalizeWords(job.title);
    if (jobWords.size === 0) continue;
    let overlap = 0;
    for (const w of proposed) if (jobWords.has(w)) overlap++;
    const score = overlap / Math.max(proposed.size, jobWords.size);
    if (score > bestScore) { bestScore = score; best = job; }
  }
  return bestScore >= TITLE_MATCH_THRESHOLD ? best : null;
}

async function fetchGreenhouseJob(slug: string, jobId: string): Promise<AtsJob | null> {
  const data = await safeFetchJson(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs/${jobId}`) as {
    title?: string; absolute_url?: string; location?: { name?: string }; id?: number;
  } | null;
  if (!data?.title) return null;
  return {
    title: data.title,
    url: data.absolute_url || `https://boards.greenhouse.io/${slug}/jobs/${jobId}`,
    location: data.location?.name || '',
    jobId: String(data.id ?? jobId),
  };
}

async function fetchGreenhouseBoard(slug: string): Promise<AtsJob[]> {
  const data = await safeFetchJson(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`) as {
    jobs?: { title?: string; absolute_url?: string; location?: { name?: string }; id?: number }[];
  } | null;
  if (!Array.isArray(data?.jobs)) return [];
  return data.jobs
    .map(j => ({ title: j.title || '', url: j.absolute_url || '', location: j.location?.name || '', jobId: String(j.id ?? '') }))
    .filter(j => j.title && j.url);
}

async function fetchLeverJob(slug: string, id: string): Promise<AtsJob | null> {
  const data = await safeFetchJson(`https://api.lever.co/v0/postings/${slug}/${id}?mode=json`) as {
    text?: string; hostedUrl?: string; categories?: { location?: string };
  } | null;
  if (!data?.text) return null;
  return {
    title: data.text,
    url: data.hostedUrl || `https://jobs.lever.co/${slug}/${id}`,
    location: data.categories?.location || '',
    jobId: id,
  };
}

async function fetchLeverBoard(slug: string): Promise<AtsJob[]> {
  const data = await safeFetchJson(`https://api.lever.co/v0/postings/${slug}?mode=json`) as {
    text?: string; hostedUrl?: string; categories?: { location?: string }; id?: string;
  }[] | null;
  if (!Array.isArray(data)) return [];
  return data
    .map(j => ({ title: j.text || '', url: j.hostedUrl || '', location: j.categories?.location || '', jobId: String(j.id ?? '') }))
    .filter(j => j.title && j.url);
}

async function fetchAshbyBoard(slug: string): Promise<AtsJob[]> {
  const data = await safeFetchJson(`https://api.ashbyhq.com/posting-api/job-board/${slug}`) as {
    jobs?: { title?: string; jobUrl?: string; applyUrl?: string; location?: string; id?: string }[];
  } | null;
  if (!Array.isArray(data?.jobs)) return [];
  return data.jobs
    .map(j => ({ title: j.title || '', url: j.jobUrl || j.applyUrl || '', location: j.location || '', jobId: String(j.id ?? '') }))
    .filter(j => j.title && j.url);
}

async function fetchBoard(provider: AtsProvider, slug: string): Promise<AtsJob[]> {
  if (provider === 'greenhouse') return fetchGreenhouseBoard(slug);
  if (provider === 'lever') return fetchLeverBoard(slug);
  return fetchAshbyBoard(slug);
}

export async function ensureAtsCacheTable() {
  const db = getDb();
  await db.execute(`CREATE TABLE IF NOT EXISTS company_ats_cache (
    company_key TEXT PRIMARY KEY,
    provider TEXT,
    slug TEXT,
    resolved_at TEXT NOT NULL
  )`);
}

function companyKey(companyName: string): string {
  return companyName.trim().toLowerCase();
}

async function getCachedAts(companyName: string): Promise<{ provider: AtsProvider; slug: string } | 'unresolved' | null> {
  const db = getDb();
  const row = (await db.execute({
    sql: 'SELECT provider, slug, resolved_at FROM company_ats_cache WHERE company_key = ?',
    args: [companyKey(companyName)],
  })).rows[0] as unknown as { provider: string | null; slug: string | null; resolved_at: string } | undefined;
  if (!row) return null;
  const age = Date.now() - new Date(row.resolved_at).getTime();
  if (age > CACHE_TTL_MS) return null;
  if (!row.provider || !row.slug) return 'unresolved';
  return { provider: row.provider as AtsProvider, slug: row.slug };
}

async function setCachedAts(companyName: string, resolved: { provider: AtsProvider; slug: string } | null) {
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO company_ats_cache (company_key, provider, slug, resolved_at) VALUES (?, ?, ?, ?)
          ON CONFLICT(company_key) DO UPDATE SET provider = excluded.provider, slug = excluded.slug, resolved_at = excluded.resolved_at`,
    args: [companyKey(companyName), resolved?.provider ?? null, resolved?.slug ?? null, new Date().toISOString()],
  });
}

async function guessCompanyAts(companyName: string): Promise<{ provider: AtsProvider; slug: string; jobs: AtsJob[] } | null> {
  const candidates = guessSlugCandidates(companyName);
  const providers: AtsProvider[] = ['greenhouse', 'lever', 'ashby'];
  for (const provider of providers) {
    for (const slug of candidates) {
      const jobs = await fetchBoard(provider, slug);
      if (jobs.length > 0) return { provider, slug, jobs };
    }
  }
  return null;
}

export async function resolveCompanyAts(companyName: string, proposedTitle: string, proposedUrl: string | undefined): Promise<AtsResolution> {
  const ref = extractAtsRef(proposedUrl);

  if (ref?.jobId) {
    if (ref.provider === 'greenhouse') {
      const job = await fetchGreenhouseJob(ref.slug, ref.jobId);
      return job ? { outcome: 'confirmed', job } : { outcome: 'dead' };
    }
    if (ref.provider === 'lever') {
      const job = await fetchLeverJob(ref.slug, ref.jobId);
      return job ? { outcome: 'confirmed', job } : { outcome: 'dead' };
    }
    // Ashby has no documented single-job endpoint — fall through to board match by exact id.
    const jobs = await fetchAshbyBoard(ref.slug);
    if (jobs.length === 0) return { outcome: 'unresolved' };
    const exact = jobs.find(j => j.jobId === ref.jobId);
    if (exact) return { outcome: 'confirmed', job: exact };
    return { outcome: 'dead' };
  }

  if (ref?.slug) {
    const jobs = await fetchBoard(ref.provider, ref.slug);
    if (jobs.length === 0) return { outcome: 'unresolved' };
    const match = findBestTitleMatch(proposedTitle, jobs);
    return match ? { outcome: 'confirmed', job: match } : { outcome: 'dead' };
  }

  const cached = await getCachedAts(companyName);
  if (cached === 'unresolved') return { outcome: 'unresolved' };
  if (cached) {
    const jobs = await fetchBoard(cached.provider, cached.slug);
    const match = findBestTitleMatch(proposedTitle, jobs);
    return match ? { outcome: 'confirmed', job: match } : { outcome: 'unresolved' };
  }

  const guessed = await guessCompanyAts(companyName);
  if (!guessed) {
    await setCachedAts(companyName, null);
    return { outcome: 'unresolved' };
  }
  await setCachedAts(companyName, { provider: guessed.provider, slug: guessed.slug });
  const match = findBestTitleMatch(proposedTitle, guessed.jobs);
  return match ? { outcome: 'confirmed', job: match } : { outcome: 'unresolved' };
}
