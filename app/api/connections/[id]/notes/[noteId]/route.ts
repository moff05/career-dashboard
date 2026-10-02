import { NextRequest, NextResponse } from 'next/server';
import { getUserId } from '@/lib/user';
import { ensureConnectionNotesTable } from '@/lib/connectionNotes';

// Flag/unflag a log entry as needing follow-up, or mark that follow-up done.
// body: { follow_up_date?: string | null, follow_up_done?: boolean }
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; noteId: string }> }) {
  try {
    const userId = getUserId(request);
    const { id, noteId } = await params;
    const body = await request.json();
    const sets: string[] = [];
    const args: (string | number | null)[] = [];
    if ('follow_up_date' in body) {
      sets.push('follow_up_date = ?', 'follow_up_done = 0');
      args.push(typeof body.follow_up_date === 'string' ? body.follow_up_date : null);
    }
    if ('follow_up_done' in body) { sets.push('follow_up_done = ?'); args.push(body.follow_up_done ? 1 : 0); }
    if (sets.length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
    const db = await ensureConnectionNotesTable();
    await db.execute({
      sql: `UPDATE connection_notes SET ${sets.join(', ')} WHERE id = ? AND connection_id = ? AND user_id = ?`,
      args: [...args, parseInt(noteId), parseInt(id), userId],
    });
    const row = (await db.execute({ sql: 'SELECT * FROM connection_notes WHERE id = ? AND user_id = ?', args: [parseInt(noteId), userId] })).rows[0];
    return NextResponse.json(row ?? { ok: true });
  } catch (error) {
    console.error('PATCH /api/connections/[id]/notes/[noteId] error:', error);
    return NextResponse.json({ error: 'Failed to update note' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; noteId: string }> }) {
  try {
    const userId = getUserId(request);
    const { id, noteId } = await params;
    const db = await ensureConnectionNotesTable();
    await db.execute({
      sql: 'DELETE FROM connection_notes WHERE id = ? AND connection_id = ? AND user_id = ?',
      args: [parseInt(noteId), parseInt(id), userId],
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/connections/[id]/notes/[noteId] error:', error);
    return NextResponse.json({ error: 'Failed to delete note' }, { status: 500 });
  }
}
