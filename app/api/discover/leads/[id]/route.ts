import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserId } from '@/lib/user';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = getUserId(req);
    const { id } = await params;
    const db = getDb();
    const body = await req.json();
    await db.execute({
      sql: 'UPDATE leads SET dismissed = ? WHERE id = ? AND user_id = ?',
      args: [body.dismissed ? 1 : 0, Number(id), userId],
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Lead PATCH error:', error);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
}
