/**
 * One-time (re-runnable) backfill: sets `career_url` on any existing
 * `companies` row whose name matches a known, ATS-resolvable company (see
 * KNOWN_CAREER_URLS in lib/boardCompanies.ts), for every user — this is
 * global reference data (which board a public company posts to), not
 * anything user-specific. Only touches rows where career_url is currently
 * unset, so re-running is safe and never clobbers a manually-set URL.
 *
 * Run:  npx tsx scripts/backfill-career-urls.ts
 */
import { readFileSync } from 'fs';

try {
  const env = readFileSync('.env.local', 'utf-8');
  for (const line of env.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !process.env[key]) process.env[key] = val;
  }
} catch { /* no .env.local */ }

import { createClient } from '@libsql/client';
import { KNOWN_CAREER_URLS } from '../lib/boardCompanies';

const db = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:./data/career.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function main() {
  const result = await db.execute("SELECT id, name FROM companies WHERE career_url IS NULL OR trim(career_url) = ''");
  let updated = 0;
  for (const row of result.rows as unknown as { id: number; name: string }[]) {
    const url = KNOWN_CAREER_URLS[row.name.trim().toLowerCase()];
    if (!url) continue;
    await db.execute({ sql: 'UPDATE companies SET career_url = ? WHERE id = ?', args: [url, row.id] });
    console.log(`  ✓ ${row.name} -> ${url}`);
    updated++;
  }
  console.log(`\nBackfilled ${updated} compan${updated === 1 ? 'y' : 'ies'}.`);
  process.exit(0);
}

main().catch((err) => { console.error('Backfill failed:', err); process.exit(1); });
