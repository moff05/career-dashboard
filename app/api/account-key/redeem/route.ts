import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const { key } = await request.json();
    if (!key || typeof key !== 'string') return NextResponse.json({ error: 'Key is required' }, { status: 400 });

    const normalized = key.trim().toUpperCase();
    const db = getDb();

    const result = await db.execute({
      sql: 'SELECT user_id, name FROM profile WHERE recovery_key = ?',
      args: [normalized],
    });

    if (!result.rows.length) return NextResponse.json({ error: 'Key not found — check for typos.' }, { status: 404 });

    const row = result.rows[0];
    return NextResponse.json({ user_id: row.user_id, display_name: row.name || '' });
  } catch (error) {
    console.error('POST /api/account-key/redeem error:', error);
    return NextResponse.json({ error: 'Failed to redeem key' }, { status: 500 });
  }
}
