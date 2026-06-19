import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserId } from '@/lib/user';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = getUserId(request);
    const db = getDb();
    const { id } = await params;
    const { title, description, date, type, done } = await request.json();
    await db.execute({
      sql: 'UPDATE timeline_events SET title=?, description=?, date=?, type=?, done=? WHERE id=? AND user_id=?',
      args: [title, description || null, date, type, done ? 1 : 0, parseInt(id), userId],
    });
    const updated = (await db.execute({ sql: 'SELECT * FROM timeline_events WHERE id = ?', args: [parseInt(id)] })).rows[0];
    return NextResponse.json(updated);
  } catch (error) {
    console.error('PUT /api/timeline/[id] error:', error);
    return NextResponse.json({ error: 'Failed to update event' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = getUserId(request);
    const db = getDb();
    const { id } = await params;
    await db.execute({ sql: 'DELETE FROM timeline_events WHERE id = ? AND user_id = ?', args: [parseInt(id), userId] });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/timeline/[id] error:', error);
    return NextResponse.json({ error: 'Failed to delete event' }, { status: 500 });
  }
}
