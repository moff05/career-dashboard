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
      user_id TEXT UNIQUE NOT NULL DEFAULT 'anonymous',
      raw_text TEXT, parsed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL DEFAULT 'anonymous',
      company TEXT NOT NULL, name TEXT NOT NULL,
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, dismissed INTEGER DEFAULT 0
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
  await addColumn('leads', 'user_id', "TEXT NOT NULL DEFAULT 'anonymous'");

  // Add resume_text to profile if not present
  await addColumn('profile', 'resume_text', 'TEXT');

  // Add starred/status_updated_at to jobs if not present
  await addColumn('jobs', 'starred', 'INTEGER NOT NULL DEFAULT 0');
  await addColumn('jobs', 'status_updated_at', 'TEXT');

  // Create indexes for performance
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_jobs_user ON jobs(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_chat_user_session ON chat_messages(user_id, session_id)',
    'CREATE INDEX IF NOT EXISTS idx_timeline_user ON timeline_events(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_leads_user ON leads(user_id)',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_user ON profile(user_id)',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_resume_user ON resume(user_id)',
  ];

  for (const idx of indexes) {
    try { await db.execute(idx); } catch { /* already exists */ }
  }
  console.log('  ✓ indexes created');

  console.log('\nMigration complete.');
  process.exit(0);
}

migrate().catch(err => { console.error('Migration failed:', err); process.exit(1); });
