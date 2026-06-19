import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserId } from '@/lib/user';

export async function PUT(request: NextRequest) {
  try {
    const userId = getUserId(request);
    const db = getDb();
    const { raw_text } = await request.json();
    await db.execute({
      sql: `INSERT INTO resume (user_id, raw_text, parsed_at) VALUES (?, ?, datetime('now'))
            ON CONFLICT(user_id) DO UPDATE SET raw_text=excluded.raw_text, parsed_at=excluded.parsed_at`,
      args: [userId, raw_text],
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('PUT /api/profile/resume error:', error);
    return NextResponse.json({ error: 'Failed to save resume' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const userId = getUserId(request);
    const db = getDb();
    const row = (await db.execute({ sql: 'SELECT raw_text FROM resume WHERE user_id = ?', args: [userId] })).rows[0] as unknown as { raw_text: string } | undefined;
    return NextResponse.json({ raw_text: row?.raw_text || '' });
  } catch (error) {
    console.error('GET /api/profile/resume error:', error);
    return NextResponse.json({ error: 'Failed to fetch resume' }, { status: 500 });
  }
}
