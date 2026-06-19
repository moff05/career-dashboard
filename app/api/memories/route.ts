import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserId } from '@/lib/user';

export async function GET(request: NextRequest) {
  try {
    const userId = getUserId(request);
    const db = getDb();
    const result = await db.execute({ sql: 'SELECT * FROM memories WHERE user_id = ? ORDER BY created_at DESC', args: [userId] });
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('GET /api/memories error:', error);
    return NextResponse.json({ error: 'Failed to fetch memories' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = getUserId(request);
    const db = getDb();
    const { content, category, source } = await request.json();
    if (!content || !category) return NextResponse.json({ error: 'content and category are required' }, { status: 400 });
    const result = await db.execute({
      sql: 'INSERT INTO memories (user_id, content, category, source) VALUES (?, ?, ?, ?)',
      args: [userId, content, category, source || 'manual'],
    });
    const newMemory = (await db.execute({ sql: 'SELECT * FROM memories WHERE id = ?', args: [Number(result.lastInsertRowid)] })).rows[0];
    return NextResponse.json(newMemory, { status: 201 });
  } catch (error) {
    console.error('POST /api/memories error:', error);
    return NextResponse.json({ error: 'Failed to create memory' }, { status: 500 });
  }
}
