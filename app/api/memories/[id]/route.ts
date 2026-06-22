import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserId } from '@/lib/user';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = getUserId(request);
    const db = getDb();
    const { id } = await params;
    const { content, category } = await request.json();
    await db.execute({ sql: 'UPDATE memories SET content = ?, category = ? WHERE id = ? AND user_id = ?', args: [content ?? null, category ?? null, parseInt(id), userId] });
    const updated = (await db.execute({ sql: 'SELECT * FROM memories WHERE id = ?', args: [parseInt(id)] })).rows[0];
    return NextResponse.json(updated);
  } catch (error) {
    console.error('PUT /api/memories/[id] error:', error);
    return NextResponse.json({ error: 'Failed to update memory' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = getUserId(request);
    const db = getDb();
    const { id } = await params;
    await db.execute({ sql: 'DELETE FROM memories WHERE id = ? AND user_id = ?', args: [parseInt(id), userId] });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/memories/[id] error:', error);
    return NextResponse.json({ error: 'Failed to delete memory' }, { status: 500 });
  }
}
