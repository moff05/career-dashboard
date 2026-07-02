import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const { code } = await request.json();
    if (!code || typeof code !== 'string') return NextResponse.json({ error: 'Code is required' }, { status: 400 });

    const db = getDb();

    const result = await db.execute({
      sql: 'SELECT user_id, expires_at FROM device_codes WHERE code = ?',
      args: [code.replace(/\D/g, '')], // strip any formatting dashes
    });

    if (!result.rows.length) return NextResponse.json({ error: 'Invalid or expired code' }, { status: 404 });

    const row = result.rows[0];
    if (new Date(row.expires_at as string) < new Date()) {
      await db.execute({ sql: 'DELETE FROM device_codes WHERE code = ?', args: [code] });
      return NextResponse.json({ error: 'Code expired — generate a new one' }, { status: 410 });
    }

    // Single-use — delete immediately
    await db.execute({ sql: 'DELETE FROM device_codes WHERE code = ?', args: [code] });

    // Fetch display name so the new device can set it in localStorage
    const profile = await db.execute({
      sql: 'SELECT name FROM profile WHERE user_id = ?',
      args: [row.user_id],
    });
    const displayName = (profile.rows[0]?.name as string) || '';

    return NextResponse.json({ user_id: row.user_id, display_name: displayName });
  } catch (error) {
    console.error('POST /api/device-code/redeem error:', error);
    return NextResponse.json({ error: 'Failed to redeem code' }, { status: 500 });
  }
}
