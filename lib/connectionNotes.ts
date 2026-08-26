import { getDb } from '@/lib/db';

// A running, dated history of interactions with a connection (calls, emails,
// coffee chats) — distinct from `connections.notes`, which is a single
// freeform "how you know them" field that a new entry would otherwise
// overwrite. Each entry keeps its own date so a log of conversations builds
// up over time instead of one field getting clobbered by the next update.
export async function ensureConnectionNotesTable() {
  const db = getDb();
  await db.execute(`CREATE TABLE IF NOT EXISTS connection_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    connection_id INTEGER NOT NULL,
    entry_date TEXT NOT NULL,
    note TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  return db;
}
