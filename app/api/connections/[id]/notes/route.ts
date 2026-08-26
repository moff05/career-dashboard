import { NextRequest, NextResponse } from 'next/server';
import { getUserId } from '@/lib/user';
import { ensureConnectionNotesTable } from '@/lib/connectionNotes';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = getUserId(request);
    const { id } = await params;
    const db = await ensureConnectionNotesTable();
    const result = await db.execute({
      sql: 'SELECT * FROM connection_notes WHERE connection_id = ? AND user_id = ? ORDER BY entry_date DESC, id DESC',
      args: [parseInt(id), userId],
    });
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('GET /api/connections/[id]/notes error:', error);
    return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = getUserId(request);
    const { id } = await params;
    const { entry_date, note } = await request.json();
    if (!note || !String(note).trim()) return NextResponse.json({ error: 'note required' }, { status: 400 });
    const db = await ensureConnectionNotesTable();
    const result = await db.execute({
      sql: 'INSERT INTO connection_notes (user_id, connection_id, entry_date, note) VALUES (?, ?, ?, ?)',
      args: [userId, parseInt(id), entry_date || new Date().toISOString().slice(0, 10), String(note).trim()],
    });
    const created = (await db.execute({ sql: 'SELECT * FROM connection_notes WHERE id = ?', args: [Number(result.lastInsertRowid)] })).rows[0];
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('POST /api/connections/[id]/notes error:', error);
    return NextResponse.json({ error: 'Failed to add note' }, { status: 500 });
  }
}
