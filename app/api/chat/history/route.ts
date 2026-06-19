import { NextRequest, NextResponse } from 'next/server';
import { getUserId } from '@/lib/user';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const userId = getUserId(request);
    const { searchParams } = new URL(request.url);
    const session_id = searchParams.get('session_id') || 'default';
    const db = getDb();
    const result = await db.execute({
      sql: 'SELECT id, role, content, created_at FROM chat_messages WHERE user_id = ? AND session_id = ? ORDER BY created_at ASC',
      args: [userId, session_id],
    });
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('GET /api/chat/history error:', error);
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
  }
}
