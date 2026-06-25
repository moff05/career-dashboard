import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserId, getApiKey } from '@/lib/user';

export async function POST(request: NextRequest) {
  try {
    const userId = getUserId(request);
    const apiKey = getApiKey(request);
    const db = getDb();

    await db.execute(`
      CREATE TABLE IF NOT EXISTS device_codes (
        code TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        api_key TEXT NOT NULL,
        expires_at TEXT NOT NULL
      )
    `);

    // Clean up expired codes
    await db.execute({ sql: 'DELETE FROM device_codes WHERE expires_at < ?', args: [new Date().toISOString()] });

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await db.execute({
      sql: 'INSERT OR REPLACE INTO device_codes (code, user_id, api_key, expires_at) VALUES (?, ?, ?, ?)',
      args: [code, userId, apiKey, expiresAt],
    });

    return NextResponse.json({ code, expires_at: expiresAt });
  } catch (error) {
    console.error('POST /api/device-code error:', error);
    return NextResponse.json({ error: 'Failed to generate code' }, { status: 500 });
  }
}
