import { createClient } from '@libsql/client';
import { readFileSync } from 'fs';
import { join } from 'path';

try {
  const env = readFileSync(join(process.cwd(), '.env.local'), 'utf-8');
  for (const line of env.split('\n')) {
    const [key, ...vals] = line.split('=');
    if (key?.trim() && vals.length) process.env[key.trim()] = vals.join('=').trim();
  }
} catch {}

const db = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:./data/career.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function main() {
  try {
    await db.execute('ALTER TABLE jobs ADD COLUMN starred INTEGER NOT NULL DEFAULT 0');
    console.log('✓ Added starred column to jobs');
  } catch {
    console.log('✓ starred column already exists');
  }
  console.log('Migration v3 complete.');
}

main().catch(console.error);
