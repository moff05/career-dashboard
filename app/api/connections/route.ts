import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserId } from '@/lib/user';

async function ensureTable() {
  const db = getDb();
  await db.execute(`CREATE TABLE IF NOT EXISTS connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL DEFAULT 'anonymous',
    company TEXT NOT NULL, name TEXT NOT NULL,
    relationship TEXT, notes TEXT,
    status TEXT DEFAULT 'not_reached_out',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  return db;
}

export async function GET(request: NextRequest) {
  try {
    const userId = getUserId(request);
    const db = await ensureTable();
    const company = new URL(request.url).searchParams.get('company');
    const result = company
      ? await db.execute({ sql: 'SELECT * FROM connections WHERE user_id = ? AND company = ? ORDER BY created_at DESC', args: [userId, company] })
      : await db.execute({ sql: 'SELECT * FROM connections WHERE user_id = ? ORDER BY created_at DESC', args: [userId] });
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('GET /api/connections error:', error);
    return NextResponse.json({ error: 'Failed to fetch connections' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = getUserId(request);
    const db = await ensureTable();
    const { company, name, relationship, notes } = await request.json();
    if (!company || !name) return NextResponse.json({ error: 'company and name required' }, { status: 400 });
    const result = await db.execute({
      sql: 'INSERT INTO connections (user_id, company, name, relationship, notes) VALUES (?, ?, ?, ?, ?)',
      args: [userId, company, name, relationship || null, notes || null],
    });
    const newConn = (await db.execute({ sql: 'SELECT * FROM connections WHERE id = ?', args: [Number(result.lastInsertRowid)] })).rows[0];
    return NextResponse.json(newConn, { status: 201 });
  } catch (error) {
    console.error('POST /api/connections error:', error);
    return NextResponse.json({ error: 'Failed to create connection' }, { status: 500 });
  }
}
