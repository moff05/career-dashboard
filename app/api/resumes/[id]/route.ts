import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserId } from '@/lib/user';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = getUserId(request);
    const db = getDb();
    const { id } = await params;
    const resumeId = parseInt(id);
    const { name, raw_text, set_default } = await request.json() as { name?: string; raw_text?: string; set_default?: boolean };

    if (set_default) {
      // Partial unique index allows only one is_default=1 per user — clear first.
      await db.execute({ sql: 'UPDATE resume SET is_default = 0 WHERE user_id = ?', args: [userId] });
      await db.execute({ sql: 'UPDATE resume SET is_default = 1 WHERE id = ? AND user_id = ?', args: [resumeId, userId] });
    }

    if (name !== undefined || raw_text !== undefined) {
      const sets: string[] = [];
      const args: (string | number)[] = [];
      if (name !== undefined) { sets.push('name = ?'); args.push(name); }
      if (raw_text !== undefined) { sets.push('raw_text = ?', "parsed_at = datetime('now')"); args.push(raw_text); }
      args.push(resumeId, userId);
      await db.execute({ sql: `UPDATE resume SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`, args });
    }

    const updated = (await db.execute({
      sql: 'SELECT id, name, raw_text, parsed_at, is_default FROM resume WHERE id = ? AND user_id = ?',
      args: [resumeId, userId],
    })).rows[0];
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(updated);
  } catch (error) {
    console.error('PUT /api/resumes/[id] error:', error);
    return NextResponse.json({ error: 'Failed to update resume' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = getUserId(request);
    const db = getDb();
    const { id } = await params;
    const resumeId = parseInt(id);

    const target = (await db.execute({
      sql: 'SELECT is_default FROM resume WHERE id = ? AND user_id = ?',
      args: [resumeId, userId],
    })).rows[0] as unknown as { is_default: number } | undefined;
    if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await db.execute({ sql: 'DELETE FROM resume WHERE id = ? AND user_id = ?', args: [resumeId, userId] });

    if (target.is_default) {
      const next = (await db.execute({
        sql: 'SELECT id FROM resume WHERE user_id = ? ORDER BY id ASC LIMIT 1',
        args: [userId],
      })).rows[0] as unknown as { id: number } | undefined;
      if (next) {
        await db.execute({ sql: 'UPDATE resume SET is_default = 1 WHERE id = ?', args: [next.id] });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/resumes/[id] error:', error);
    return NextResponse.json({ error: 'Failed to delete resume' }, { status: 500 });
  }
}
