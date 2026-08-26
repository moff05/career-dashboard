import { NextRequest, NextResponse } from 'next/server';
import { getUserId } from '@/lib/user';
import { ensureConnectionNotesTable } from '@/lib/connectionNotes';

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
