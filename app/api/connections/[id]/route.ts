import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const { status } = await request.json();
    await db.execute({ sql: 'UPDATE connections SET status = ? WHERE id = ?', args: [status, parseInt(id)] });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('PATCH /api/connections/[id] error:', error);
    return NextResponse.json({ error: 'Failed to update connection' }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    await db.execute({ sql: 'DELETE FROM connections WHERE id = ?', args: [parseInt(id)] });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/connections/[id] error:', error);
    return NextResponse.json({ error: 'Failed to delete connection' }, { status: 500 });
  }
}
