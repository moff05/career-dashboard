export type LivenessStatus = 'live' | 'dead' | 'unverified';

const DEAD_PHRASE_PATTERNS: RegExp[] = [
  /no longer accepting applications/i,
  /position has been filled/i,
  /this job has expired/i,
  /this position is no longer available/i,
  /job posting has closed/i,
  /this listing is no longer active/i,
  /this job is no longer available/i,
  /job.{0,15}no longer open/i,
  /applications? (?:have|are|is) closed/i,
];

const LIVENESS_TIMEOUT_MS = 7000;
const MIN_BODY_CHARS = 200;
const BODY_SCAN_CHARS = 5000;

export async function checkLiveness(url: string): Promise<LivenessStatus> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(LIVENESS_TIMEOUT_MS),
    });
  } catch {
    return 'unverified';
  }

  if (res.status === 404 || res.status === 410) return 'dead';
  if (res.status === 403 || res.status === 503) return 'unverified';
  if (res.status >= 400) return 'unverified';

  let body: string;
  try {
    body = (await res.text()).slice(0, BODY_SCAN_CHARS);
  } catch {
    return 'unverified';
  }

  if (DEAD_PHRASE_PATTERNS.some((pattern) => pattern.test(body))) return 'dead';
  if (body.trim().length < MIN_BODY_CHARS) return 'unverified';
  return 'live';
}
