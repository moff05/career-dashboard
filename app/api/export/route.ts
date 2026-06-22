import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserId } from '@/lib/user';

const TABLES = ['profile', 'resume', 'jobs', 'chat_messages', 'memories', 'timeline_events', 'connections', 'leads'] as const;

export async function GET(request: NextRequest) {
  try {
    const userId = getUserId(request);
    const db = getDb();
    const data: Record<string, unknown> = { version: 1, exportedAt: new Date().toISOString() };
    for (const table of TABLES) {
      const result = await db.execute({ sql: `SELECT * FROM ${table} WHERE user_id = ?`, args: [userId] });
      data[table] = result.rows;
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error('GET /api/export error:', error);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}
