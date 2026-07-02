import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserId } from '@/lib/user';

export async function POST(request: NextRequest) {
  try {
    const userId = getUserId(request);
    const db = getDb();

    await db.execute(`
      CREATE TABLE IF NOT EXISTS device_codes (
        code TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        api_key TEXT,
        expires_at TEXT NOT NULL
      )
    `);

    // Clean up expired codes
    await db.execute({ sql: 'DELETE FROM device_codes WHERE expires_at < ?', args: [new Date().toISOString()] });

    // Rate limit: at most 3 active codes per user at a time
    const activeCount = (await db.execute({
      sql: 'SELECT COUNT(*) as cnt FROM device_codes WHERE user_id = ?',
      args: [userId],
    })).rows[0] as unknown as { cnt: number };
    if (Number(activeCount.cnt) >= 3) {
      return NextResponse.json({ error: 'Too many active codes. Wait a few minutes and try again.' }, { status: 429 });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await db.execute({
      sql: 'INSERT OR REPLACE INTO device_codes (code, user_id, expires_at) VALUES (?, ?, ?)',
      args: [code, userId, expiresAt],
    });

    return NextResponse.json({ code, expires_at: expiresAt });
  } catch (error) {
    console.error('POST /api/device-code error:', error);
    return NextResponse.json({ error: 'Failed to generate code' }, { status: 500 });
  }
}
