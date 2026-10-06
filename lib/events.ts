import { getDb } from '@/lib/db';

// First-party feature-usage events. Deliberately minimal: an event name from
// a fixed allowlist, an optional short token (e.g. a tab name or status), the
// existing random user_id, and a timestamp. No IP, user agent, URL, page
// content, job/company names, or free text is ever stored.
export const EVENT_NAMES = new Set([
  'app_open',
  'overlay_coach', 'overlay_profile', 'overlay_connections', 'overlay_companies',
  'tab_tracker', 'tab_discovered',
  'job_tab',          // detail = overview | analysis | resume-bullets | cover-letter
  'job_expand',
  'job_import',       // detail = url | paste | screenshot | extension
  'job_status',       // detail = new status
  'discovered_add', 'discovered_dismiss', 'discovered_refresh',
  'coach_message',
  'resume_upload',
  'feedback_open',
]);

const DETAIL_RE = /^[a-z0-9_-]{1,24}$/;

let tableEnsured = false;
export async function ensureEventsTable() {
  if (tableEnsured) return;
  const db = getDb();
  await db.execute(`CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    event TEXT NOT NULL,
    detail TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  await db.execute('CREATE INDEX IF NOT EXISTS idx_events_event ON events(event, created_at)');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id, created_at)');
  tableEnsured = true;
}

export function sanitizeEvent(event: unknown, detail: unknown): { event: string; detail: string | null } | null {
  if (typeof event !== 'string' || !EVENT_NAMES.has(event)) return null;
  const d = typeof detail === 'string' && DETAIL_RE.test(detail) ? detail : null;
  return { event, detail: d };
}

export async function recordEvent(userId: string, event: string, detail: string | null) {
  await ensureEventsTable();
  await getDb().execute({
    sql: 'INSERT INTO events (user_id, event, detail) VALUES (?, ?, ?)',
    args: [userId, event, detail],
  });
}
