// Powers the daily job-board scan (app/api/cron/scan-boards). Given a
// company's `career_url` (stored on its `companies` row), resolves which ATS
// platform it's on and fetches current postings from that platform's free,
// unauthenticated JSON API — no headless browser needed:
//   Greenhouse: https://boards-api.greenhouse.io/v1/boards/{slug}/jobs
//   Lever:      https://api.lever.co/v0/postings/{slug}
//   Ashby:      https://api.ashbyhq.com/posting-api/job-board/{slug}
//   Workday:    POST https://{host}/wday/cxs/{tenant}/{site}/jobs
// A company whose career_url doesn't match one of these (Oracle Cloud HCM,
// UKG/Ultipro, a fully custom portal, or no career_url on file at all) is
// simply not scannable this way — the cron route reports it as skipped
// rather than silently dropping it (see notes[] in that route).
export type AtsPlatform = 'greenhouse' | 'lever' | 'ashby' | 'workday';

export interface ResolvedBoard {
  platform: AtsPlatform;
  // greenhouse/lever/ashby:
  slug?: string;
  // workday:
  host?: string;
  tenant?: string;
  site?: string;
}

export function resolveBoard(careerUrl: string | null | undefined): ResolvedBoard | null {
  if (!careerUrl) return null;
  let url: URL;
  try { url = new URL(careerUrl); } catch { return null; }
  const host = url.hostname.toLowerCase();

  if (host.includes('greenhouse.io')) {
    // job-boards.greenhouse.io/{slug} or boards.greenhouse.io/{slug}
    const slug = url.pathname.split('/').filter(Boolean)[0];
    return slug ? { platform: 'greenhouse', slug } : null;
  }
  if (host === 'jobs.lever.co') {
    const slug = url.pathname.split('/').filter(Boolean)[0];
    return slug ? { platform: 'lever', slug } : null;
  }
  if (host === 'jobs.ashbyhq.com') {
    const slug = url.pathname.split('/').filter(Boolean)[0];
    return slug ? { platform: 'ashby', slug } : null;
  }
  const workdayMatch = host.match(/^([a-z0-9-]+)\.wd\d+\.myworkdayjobs\.com$/);
  if (workdayMatch) {
    const tenant = workdayMatch[1];
    const segments = url.pathname.split('/').filter(Boolean);
    const site = segments[segments.length - 1];
    return site ? { platform: 'workday', host, tenant, site } : null;
  }
  return null;
}

export interface RawPosting {
  externalId: string;
  title: string;
  location: string;
  url: string;
  description: string;
  postedAt: string | null; // YYYY-MM-DD if known
}

function stripHtml(html: string): string {
  return html
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function toDateOnly(value: string | number | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

async function fetchGreenhouse(slug: string): Promise<RawPosting[]> {
  const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Greenhouse ${slug}: ${res.status}`);
  const data = await res.json() as { jobs: { id: number; title: string; location?: { name?: string }; absolute_url: string; content?: string; first_published?: string }[] };
  return data.jobs.map((j) => ({
    externalId: String(j.id),
    title: j.title,
    location: j.location?.name || '',
    url: j.absolute_url,
    description: j.content ? stripHtml(j.content).slice(0, 12000) : '',
    postedAt: toDateOnly(j.first_published),
  }));
}

async function fetchLever(slug: string): Promise<RawPosting[]> {
  const res = await fetch(`https://api.lever.co/v0/postings/${slug}?mode=json`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Lever ${slug}: ${res.status}`);
  const data = await res.json() as { id: string; text: string; categories?: { location?: string }; hostedUrl: string; descriptionPlain?: string; createdAt?: number }[];
  return data.map((j) => ({
    externalId: j.id,
    title: j.text,
    location: j.categories?.location || '',
    url: j.hostedUrl,
    description: (j.descriptionPlain || '').slice(0, 12000),
    postedAt: toDateOnly(j.createdAt),
  }));
}

async function fetchAshby(slug: string): Promise<RawPosting[]> {
  const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${slug}`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Ashby ${slug}: ${res.status}`);
  const data = await res.json() as { jobs: { id: string; title: string; location?: string; jobUrl: string; descriptionPlain?: string; publishedAt?: string }[] };
  return data.jobs.map((j) => ({
    externalId: j.id,
    title: j.title,
    location: j.location || '',
    url: j.jobUrl,
    description: (j.descriptionPlain || '').slice(0, 12000),
    postedAt: toDateOnly(j.publishedAt),
  }));
}

// Workday's own in-page keyword search is unreliable on several tenants
// (confirmed against JLL: searchText="intern" barely moved the result
// count and returned the same generic facilities-trades postings) — so we
// always fetch with an empty search and filter client-side instead, same as
// every other platform. Some tenants (JLL, CBRE-scale portfolios) carry
// 1500-2000+ total postings; we page through a bounded number (see
// MAX_PAGES) rather than the whole board, so a huge generalist board can't
// balloon run time. This means exhaustive coverage isn't guaranteed on the
// largest boards — an acceptable tradeoff for a daily personal scan, not a
// promise every posting on a 2000-listing board is seen.
const WORKDAY_PAGE_SIZE = 20; // Workday's cxs API 400s on any limit > 20 — confirmed against Blackstone's live endpoint
const WORKDAY_MAX_PAGES = 5; // 100-posting cap per company per run — pagination is sequential per company and eats into the run's time budget

async function fetchWorkday(host: string, tenant: string, site: string): Promise<RawPosting[]> {
  const postings: RawPosting[] = [];
  for (let page = 0; page < WORKDAY_MAX_PAGES; page++) {
    const res = await fetch(`https://${host}/wday/cxs/${tenant}/${site}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: WORKDAY_PAGE_SIZE, offset: page * WORKDAY_PAGE_SIZE, searchText: '' }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Workday ${tenant}/${site}: ${res.status}`);
    const data = await res.json() as { total: number; jobPostings: { title: string; externalPath: string; locationsText?: string; bulletFields?: string[] }[] };
    for (const j of data.jobPostings) {
      postings.push({
        externalId: j.externalPath,
        title: j.title,
        location: j.locationsText || '',
        url: `https://${host}/en-US/${site}${j.externalPath}`,
        description: '', // Workday's list endpoint doesn't include the full JD; scoring falls back to title/location only for these
        postedAt: null,
      });
    }
    if (data.jobPostings.length < WORKDAY_PAGE_SIZE || postings.length >= data.total) break;
  }
  return postings;
}

export async function fetchBoardPostings(board: ResolvedBoard): Promise<RawPosting[]> {
  switch (board.platform) {
    case 'greenhouse': return fetchGreenhouse(board.slug!);
    case 'lever': return fetchLever(board.slug!);
    case 'ashby': return fetchAshby(board.slug!);
    case 'workday': return fetchWorkday(board.host!, board.tenant!, board.site!);
  }
}

export const SOURCE_LABEL: Record<AtsPlatform, string> = {
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  ashby: 'Ashby',
  workday: 'Workday',
};

// Seed career_url values resolved by hand during the 2026-09-08 workshop
// pilot of this same idea (~/aios/.claude/skills/job_board_agent.md) for
// companies whose board lands on one of the 4 supported platforms above.
// Used once by scripts/backfill-career-urls.ts to populate existing
// `companies` rows that don't have a career_url yet — not read at scan time.
export const KNOWN_CAREER_URLS: Record<string, string> = {
  'anduril industries': 'https://job-boards.greenhouse.io/andurilindustries',
  'anthropic': 'https://job-boards.greenhouse.io/anthropic',
  'databricks': 'https://job-boards.greenhouse.io/databricks',
  'metropolis technologies': 'https://job-boards.greenhouse.io/metropolis',
  'actian corporation': 'https://jobs.lever.co/actian',
  'cherre': 'https://jobs.lever.co/cherre',
  'palantir': 'https://jobs.lever.co/palantir',
  'openai': 'https://jobs.ashbyhq.com/openai',
  'rilla': 'https://jobs.ashbyhq.com/rilla',
  'sierra': 'https://jobs.ashbyhq.com/sierra',
  'blackstone': 'https://blackstone.wd1.myworkdayjobs.com/Blackstone_Campus_Careers',
  'brookfield properties': 'https://brookfield.wd5.myworkdayjobs.com/brookfieldproperties',
  'jll': 'https://jll.wd1.myworkdayjobs.com/en-US/jllcareers',
};
