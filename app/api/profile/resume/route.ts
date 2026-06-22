import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserId } from '@/lib/user';

// Legacy single-resume endpoint — now scoped to whichever resume is the
// user's default. Multi-resume management lives at /api/resumes.
export async function PUT(request: NextRequest) {
  try {
    const userId = getUserId(request);
    const db = getDb();
    const { raw_text } = await request.json();

    const existing = (await db.execute({
      sql: 'SELECT id FROM resume WHERE user_id = ? AND is_default = 1',
      args: [userId],
    })).rows[0] as unknown as { id: number } | undefined;

    if (existing) {
      await db.execute({
        sql: `UPDATE resume SET raw_text = ?, parsed_at = datetime('now') WHERE id = ?`,
        args: [raw_text, existing.id],
      });
    } else {
      await db.execute({
        sql: `INSERT INTO resume (user_id, name, raw_text, parsed_at, is_default) VALUES (?, 'My Resume', ?, datetime('now'), 1)`,
        args: [userId, raw_text],
      });
    }
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
    const row = (await db.execute({
      sql: 'SELECT raw_text FROM resume WHERE user_id = ? AND is_default = 1',
      args: [userId],
    })).rows[0] as unknown as { raw_text: string } | undefined;
    return NextResponse.json({ raw_text: row?.raw_text || '' });
  } catch (error) {
    console.error('GET /api/profile/resume error:', error);
    return NextResponse.json({ error: 'Failed to fetch resume' }, { status: 500 });
  }
}
