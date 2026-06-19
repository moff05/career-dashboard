import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserId } from '@/lib/user';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = getUserId(request);
    const { id } = await params;
    const db = getDb();
    const { status } = await request.json();
    await db.execute({ sql: 'UPDATE connections SET status = ? WHERE id = ? AND user_id = ?', args: [status, parseInt(id), userId] });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('PATCH /api/connections/[id] error:', error);
    return NextResponse.json({ error: 'Failed to update connection' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = getUserId(request);
    const { id } = await params;
    const db = getDb();
    await db.execute({ sql: 'DELETE FROM connections WHERE id = ? AND user_id = ?', args: [parseInt(id), userId] });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/connections/[id] error:', error);
    return NextResponse.json({ error: 'Failed to delete connection' }, { status: 500 });
  }
}
