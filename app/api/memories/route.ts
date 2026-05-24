import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const db = getDb();
    const result = await db.execute('SELECT * FROM memories ORDER BY created_at DESC');
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('GET /api/memories error:', error);
    return NextResponse.json({ error: 'Failed to fetch memories' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const { content, category, source } = await request.json();
    if (!content || !category) return NextResponse.json({ error: 'content and category are required' }, { status: 400 });

    const result = await db.execute({
      sql: 'INSERT INTO memories (content, category, source) VALUES (?, ?, ?)',
      args: [content, category, source || 'manual'],
    });
    const newMemory = (await db.execute({ sql: 'SELECT * FROM memories WHERE id = ?', args: [Number(result.lastInsertRowid)] })).rows[0];
    return NextResponse.json(newMemory, { status: 201 });
  } catch (error) {
    console.error('POST /api/memories error:', error);
    return NextResponse.json({ error: 'Failed to create memory' }, { status: 500 });
  }
}
