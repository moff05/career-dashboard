import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserId } from '@/lib/user';

export async function GET(request: NextRequest) {
  try {
    const userId = getUserId(request);
    const db = getDb();
    const rows = (await db.execute({
      sql: 'SELECT id, name, raw_text, parsed_at, is_default FROM resume WHERE user_id = ? ORDER BY is_default DESC, id ASC',
      args: [userId],
    })).rows;
    return NextResponse.json(rows);
  } catch (error) {
    console.error('GET /api/resumes error:', error);
    return NextResponse.json({ error: 'Failed to fetch resumes' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = getUserId(request);
    const db = getDb();
    const { name, raw_text } = await request.json() as { name?: string; raw_text?: string };
    if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

    const countRow = (await db.execute({ sql: 'SELECT COUNT(*) as c FROM resume WHERE user_id = ?', args: [userId] })).rows[0] as unknown as { c: number };
    const isFirst = Number(countRow.c) === 0;

    const result = await db.execute({
      sql: `INSERT INTO resume (user_id, name, raw_text, parsed_at, is_default) VALUES (?, ?, ?, datetime('now'), ?)`,
      args: [userId, name.trim(), raw_text || null, isFirst ? 1 : 0],
    });
    const created = (await db.execute({
      sql: 'SELECT id, name, raw_text, parsed_at, is_default FROM resume WHERE id = ?',
      args: [Number(result.lastInsertRowid)],
    })).rows[0];
    return NextResponse.json(created);
  } catch (error) {
    console.error('POST /api/resumes error:', error);
    return NextResponse.json({ error: 'Failed to create resume' }, { status: 500 });
  }
}
