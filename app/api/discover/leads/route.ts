import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserId } from '@/lib/user';

async function ensureLeadsTable() {
  const db = getDb();
  await db.execute(`CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL DEFAULT 'anonymous',
    company TEXT NOT NULL, title TEXT NOT NULL, url TEXT,
    location TEXT, type TEXT, fit_score REAL DEFAULT 0,
    fit_reasoning TEXT, tags TEXT DEFAULT '[]', source_query TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, dismissed INTEGER DEFAULT 0
  )`);
  return db;
}

function parseTags(v: unknown): string[] {
  try { return JSON.parse((v as string) || '[]'); } catch { return []; }
}

export async function GET(request: NextRequest) {
  try {
    const userId = getUserId(request);
    const db = await ensureLeadsTable();
    const rows = (await db.execute({
      sql: 'SELECT * FROM leads WHERE user_id = ? AND dismissed = 0 ORDER BY fit_score DESC',
      args: [userId],
    })).rows;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return NextResponse.json(rows.map((r: any) => ({ ...r, tags: parseTags(r.tags) })));
  } catch (error) {
    console.error('Leads GET error:', error);
    return NextResponse.json([]);
  }
}
