import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { randomUUID } from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const db = getDb();

    await db.execute(`
      CREATE TABLE IF NOT EXISTS feedback (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        name TEXT NOT NULL,
        message TEXT NOT NULL,
        screenshot TEXT,
        user_agent TEXT
      )
    `);

    const body = await request.json();
    const { name, message, screenshot } = body;

    if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    if (!message?.trim()) return NextResponse.json({ error: 'Message is required' }, { status: 400 });

    await db.execute({
      sql: 'INSERT INTO feedback (id, created_at, name, message, screenshot, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
      args: [
        randomUUID(),
        new Date().toISOString(),
        name.trim(),
        message.trim(),
        screenshot || null,
        request.headers.get('user-agent') || null,
      ],
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST /api/feedback error:', error);
    return NextResponse.json({ error: 'Failed to submit feedback' }, { status: 500 });
  }
}
