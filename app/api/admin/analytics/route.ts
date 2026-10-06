import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { ensureEventsTable } from '@/lib/events';

// GET /api/admin/analytics?days=30  (header: x-admin-key)
// Feature usage from the first-party `events` table. User ids are truncated
// to 4 chars so the output is readable without exposing full account ids.
export async function GET(request: NextRequest) {
  const adminKey = request.headers.get('x-admin-key');
  if (!process.env.ADMIN_SECRET || adminKey !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const days = Math.min(Math.max(parseInt(request.nextUrl.searchParams.get('days') || '30', 10) || 30, 1), 365);
  const since = `-${days} day`;
  try {
    await ensureEventsTable();
    const db = getDb();
    const [byFeature, byDetail, daily, perUser, retention] = await Promise.all([
      db.execute({ sql: `SELECT event, COUNT(*) as events, COUNT(DISTINCT user_id) as users FROM events WHERE created_at >= datetime('now', ?) GROUP BY event ORDER BY events DESC`, args: [since] }),
      db.execute({ sql: `SELECT event, detail, COUNT(*) as events, COUNT(DISTINCT user_id) as users FROM events WHERE detail IS NOT NULL AND created_at >= datetime('now', ?) GROUP BY event, detail ORDER BY event, events DESC`, args: [since] }),
      db.execute({ sql: `SELECT date(created_at) as day, COUNT(DISTINCT user_id) as active_users, COUNT(*) as events FROM events WHERE created_at >= datetime('now', ?) GROUP BY day ORDER BY day DESC`, args: [since] }),
      db.execute({ sql: `SELECT substr(user_id,1,4) as user, COUNT(*) as events, COUNT(DISTINCT date(created_at)) as active_days, MIN(created_at) as first_seen, MAX(created_at) as last_seen FROM events GROUP BY user_id ORDER BY last_seen DESC LIMIT 50`, args: [] }),
      db.execute({ sql: `SELECT strftime('%Y-W%W', created_at) as week, COUNT(DISTINCT user_id) as active_users FROM events GROUP BY week ORDER BY week DESC LIMIT 12`, args: [] }),
    ]);
    return NextResponse.json({
      window_days: days,
      by_feature: byFeature.rows,
      by_detail: byDetail.rows,
      daily_active: daily.rows,
      weekly_active: retention.rows,
      users: perUser.rows,
    });
  } catch (error) {
    console.error('GET /api/admin/analytics error:', error);
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
  }
}
