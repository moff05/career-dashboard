// Run: npx tsx scripts/read-feedback.ts

import { createClient } from '@libsql/client';
import { readFileSync } from 'fs';

try {
  const env = readFileSync('.env.local', 'utf-8');
  for (const line of env.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    process.env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
  }
} catch {
  // already set in environment
}

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function main() {
  const result = await db.execute(
    'SELECT id, created_at, name, message, screenshot FROM feedback ORDER BY created_at DESC'
  );

  if (result.rows.length === 0) {
    console.log('No feedback submitted yet.');
    return;
  }

  console.log(`\n=== ${result.rows.length} feedback submission(s) ===\n`);

  for (const row of result.rows) {
    const date = new Date(row.created_at as string).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
    const hasScreenshot = !!row.screenshot;
    console.log(`[${date}]  ${row.name}`);
    console.log(`  ${row.message}`);
    if (hasScreenshot) console.log(`  (screenshot attached)`);
    console.log('');
  }
}

main().catch(console.error).finally(() => process.exit(0));
