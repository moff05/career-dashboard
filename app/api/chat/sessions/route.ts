import { NextRequest, NextResponse } from 'next/server';
import { getUserId } from '@/lib/user';
import { getDb } from '@/lib/db';

// Lists the user's past Coach threads (newest first) so the UI can switch
// between them. Title = first user message in the thread.
export async function GET(request: NextRequest) {
  try {
    const userId = getUserId(request);
    const db = getDb();
    const result = await db.execute({
      sql: `SELECT session_id,
                   MAX(created_at) AS last_at,
                   COUNT(*) AS message_count,
                   (SELECT content FROM chat_messages m2
                     WHERE m2.user_id = m.user_id AND m2.session_id = m.session_id AND m2.role = 'user'
                     ORDER BY m2.created_at ASC, m2.id ASC LIMIT 1) AS title
            FROM chat_messages m
            WHERE user_id = ?
            GROUP BY session_id
            ORDER BY last_at DESC
            LIMIT 100`,
      args: [userId],
    });
    return NextResponse.json(
      result.rows.map(r => ({
        session_id: r.session_id,
        last_at: r.last_at,
        message_count: Number(r.message_count),
        title: typeof r.title === 'string' ? r.title.slice(0, 120) : null,
      })),
    );
  } catch (error) {
    console.error('GET /api/chat/sessions error:', error);
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = getUserId(request);
    const sessionId = new URL(request.url).searchParams.get('session_id');
    if (!sessionId) return NextResponse.json({ error: 'session_id is required' }, { status: 400 });
    await getDb().execute({
      sql: 'DELETE FROM chat_messages WHERE user_id = ? AND session_id = ?',
      args: [userId, sessionId],
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/chat/sessions error:', error);
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
  }
}
