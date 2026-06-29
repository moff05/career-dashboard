/**
 * Migration: add user_id column to all tables for multi-user support.
 * Safe to run multiple times — uses ALTER TABLE IF NOT EXISTS logic.
 *
 * Run:  npx tsx scripts/migrate-multi-user.ts
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

const db = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:./data/career.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function addColumn(table: string, column: string, def: string) {
  try {
    await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
    console.log(`  ✓ ${table}.${column} added`);
  } catch {
    console.log(`  · ${table}.${column} already exists`);
  }
}

// The old schema declared `user_id TEXT UNIQUE` inline on resume — a column
// constraint SQLite can't drop via ALTER TABLE. Detect it and recreate the
// table (preserving existing rows as each user's default) so multiple named
// resumes per user become possible. No-ops if already migrated.
async function migrateResumeTable() {
  // Positive check: does the table already have the multi-resume columns?
  // Checking for the ABSENCE of a unique constraint is fragile — it can show
  // up as an inline column constraint or a separate index, full or partial —
  // so instead just check for the column that only exists post-migration.
  const cols = await db.execute(`PRAGMA table_info(resume)`);
  const hasNameColumn = (cols.rows as unknown as { name: string }[]).some(c => c.name === 'name');

  if (hasNameColumn) {
    console.log('  · resume table already supports multiple resumes per user');
    return;
  }

  console.log('  Recreating resume table to allow multiple resumes per user…');
  await db.executeMultiple(`
    DROP INDEX IF EXISTS idx_resume_user;
    ALTER TABLE resume RENAME TO resume_old_single;
    CREATE TABLE resume (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL DEFAULT 'anonymous',
      name TEXT NOT NULL DEFAULT 'My Resume',
      raw_text TEXT, parsed_at TEXT,
      is_default INTEGER NOT NULL DEFAULT 1
    );
    INSERT INTO resume (user_id, name, raw_text, parsed_at, is_default)
      SELECT COALESCE(user_id, 'anonymous'), 'My Resume', raw_text, parsed_at, 1 FROM resume_old_single;
    DROP TABLE resume_old_single;
  `);
  console.log('  ✓ resume table recreated — existing resumes preserved as each user\'s default');
}

async function migrate() {
  console.log('Multi-user migration starting…');
  console.log('DB:', process.env.TURSO_DATABASE_URL || 'file:./data/career.db');

  // Ensure tables exist first
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS profile (
      id INTEGER PRIMARY KEY,
      user_id TEXT UNIQUE,
      name TEXT, email TEXT, phone TEXT, linkedin TEXT,
      university TEXT, degree TEXT, graduation_date TEXT,
      gpa TEXT, honors TEXT, minors TEXT,
      target_roles TEXT, target_cities TEXT,
      notes TEXT, resume_text TEXT
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL DEFAULT 'anonymous',
      company TEXT NOT NULL, title TEXT NOT NULL,
      type TEXT NOT NULL, status TEXT DEFAULT 'saved',
      match_score INTEGER, posting_date TEXT, deadline TEXT,
      url TEXT, description TEXT, salary_range TEXT,
      location TEXT, source TEXT, notes TEXT, starred INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      status_updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL DEFAULT 'anonymous',
      role TEXT NOT NULL, content TEXT NOT NULL,
      session_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL DEFAULT 'anonymous',
      content TEXT NOT NULL, category TEXT NOT NULL, source TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS timeline_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL DEFAULT 'anonymous',
      title TEXT NOT NULL, description TEXT,
      date TEXT NOT NULL, type TEXT NOT NULL, done INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS resume (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL DEFAULT 'anonymous',
      name TEXT NOT NULL DEFAULT 'My Resume',
      raw_text TEXT, parsed_at TEXT,
      is_default INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL DEFAULT 'anonymous',
      company TEXT NOT NULL, name TEXT NOT NULL,
      email TEXT, role TEXT, linkedin TEXT,
      relationship TEXT, notes TEXT,
      status TEXT DEFAULT 'not_reached_out',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL DEFAULT 'anonymous',
      company TEXT NOT NULL, title TEXT NOT NULL, url TEXT,
      location TEXT, type TEXT, fit_score REAL DEFAULT 0,
      fit_reasoning TEXT, tags TEXT DEFAULT '[]', source_query TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, dismissed INTEGER DEFAULT 0,
      liveness_status TEXT NOT NULL DEFAULT 'unverified', liveness_checked_at TEXT
    );

    -- Not user-scoped on purpose: which ATS a company uses is a fact about the
    -- company, not the viewer. Created idempotently at runtime by lib/ats.ts too;
    -- kept here for documentation/consistency with the rest of this schema.
    CREATE TABLE IF NOT EXISTS company_ats_cache (
      company_key TEXT PRIMARY KEY,
      provider TEXT,
      slug TEXT,
      resolved_at TEXT NOT NULL
    );

    -- One row per Claude API call, written by lib/usage.ts. Powers the
    -- Profile page's Usage & Cost card — the only visibility a BYOK user
    -- has into what their key is actually spending.
    CREATE TABLE IF NOT EXISTS usage_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL DEFAULT 'anonymous',
      route TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_creation_input_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_input_tokens INTEGER NOT NULL DEFAULT 0,
      web_search_requests INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Add user_id to pre-existing tables that might not have it
  await addColumn('profile', 'user_id', "TEXT");
  await addColumn('jobs', 'user_id', "TEXT NOT NULL DEFAULT 'anonymous'");
  await addColumn('chat_messages', 'user_id', "TEXT NOT NULL DEFAULT 'anonymous'");
  await addColumn('memories', 'user_id', "TEXT NOT NULL DEFAULT 'anonymous'");
  await addColumn('timeline_events', 'user_id', "TEXT NOT NULL DEFAULT 'anonymous'");
  await addColumn('resume', 'user_id', "TEXT");
  await addColumn('connections', 'user_id', "TEXT NOT NULL DEFAULT 'anonymous'");
  await addColumn('connections', 'email', 'TEXT');
  await addColumn('connections', 'role', 'TEXT');
  await addColumn('connections', 'linkedin', 'TEXT');
  await addColumn('leads', 'user_id', "TEXT NOT NULL DEFAULT 'anonymous'");
  await addColumn('leads', 'liveness_status', "TEXT NOT NULL DEFAULT 'unverified'");
  await addColumn('leads', 'liveness_checked_at', 'TEXT');

  // Add resume_text to profile if not present
  await addColumn('profile', 'resume_text', 'TEXT');

  // Add starred/status_updated_at to jobs if not present
  await addColumn('jobs', 'starred', 'INTEGER NOT NULL DEFAULT 0');
  await addColumn('jobs', 'status_updated_at', 'TEXT');
  await addColumn('jobs', 'score_data', 'TEXT');
  await addColumn('jobs', 'gaps_data', 'TEXT');
  await addColumn('jobs', 'bullets_data', 'TEXT');
  await addColumn('jobs', 'cover_letter_data', 'TEXT');

  await migrateResumeTable();

  // Create indexes for performance
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_jobs_user ON jobs(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_chat_user_session ON chat_messages(user_id, session_id)',
    'CREATE INDEX IF NOT EXISTS idx_timeline_user ON timeline_events(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_leads_user ON leads(user_id)',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_user ON profile(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_resume_user ON resume(user_id)',
    // At most one default resume per user — enforced at the DB level.
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_resume_one_default ON resume(user_id) WHERE is_default = 1',
    'CREATE INDEX IF NOT EXISTS idx_usage_log_user ON usage_log(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_usage_log_user_route ON usage_log(user_id, route)',
  ];

  for (const idx of indexes) {
    try { await db.execute(idx); } catch { /* already exists */ }
  }
  console.log('  ✓ indexes created');

  console.log('\nMigration complete.');
  process.exit(0);
}

migrate().catch(err => { console.error('Migration failed:', err); process.exit(1); });
