import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();
    const body = await req.json();
    await db.execute({
      sql: 'UPDATE leads SET dismissed = ? WHERE id = ?',
      args: [body.dismissed ? 1 : 0, Number(id)],
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Lead PATCH error:', error);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
}
