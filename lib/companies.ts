import { getDb } from '@/lib/db';

export async function ensureCompaniesTable() {
  const db = getDb();
  await db.execute(`CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL DEFAULT 'anonymous',
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'researching',
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  return db;
}

// Case-insensitive per user: typing a company name that already exists just
// links to it, typing a new one creates it — this is what makes the
// type-or-pick company field on a contact work without a separate save step.
// careerUrl is only used on the create path (e.g. approving a discovered job
// from a company the expanded board-search found) — an existing company's
// career_url is never overwritten here, since the user may have set it
// themselves already.
export async function findOrCreateCompany(userId: string, name: string, careerUrl?: string): Promise<number | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const db = await ensureCompaniesTable();
  const existing = await db.execute({
    sql: 'SELECT id FROM companies WHERE user_id = ? AND name = ? COLLATE NOCASE',
    args: [userId, trimmed],
  });
  if (existing.rows.length > 0) return Number(existing.rows[0].id);
  const result = await db.execute({
    sql: 'INSERT INTO companies (user_id, name, career_url) VALUES (?, ?, ?)',
    args: [userId, trimmed, careerUrl || null],
  });
  return Number(result.lastInsertRowid);
}
