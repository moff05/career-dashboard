import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const db = getDb();
    const result = await db.execute('SELECT * FROM timeline_events ORDER BY date ASC');
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('GET /api/timeline error:', error);
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const { title, description, date, type } = await request.json();
    if (!title || !date || !type) return NextResponse.json({ error: 'title, date, type are required' }, { status: 400 });

    const result = await db.execute({
      sql: 'INSERT INTO timeline_events (title, description, date, type) VALUES (?, ?, ?, ?)',
      args: [title, description || null, date, type],
    });
    const newEvent = (await db.execute({ sql: 'SELECT * FROM timeline_events WHERE id = ?', args: [Number(result.lastInsertRowid)] })).rows[0];
    return NextResponse.json(newEvent, { status: 201 });
  } catch (error) {
    console.error('POST /api/timeline error:', error);
    return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
  }
}
