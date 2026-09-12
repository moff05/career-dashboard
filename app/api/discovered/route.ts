import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserId } from '@/lib/user';

// Pending review queue from the daily board scan (see
// app/api/cron/scan-boards) — up to 10 new candidates a day, sorted best
// fit first, sitting here until the user explicitly adds or dismisses each
// one. Nothing here has touched the real jobs tracker yet.
export async function GET(request: NextRequest) {
  try {
    const userId = getUserId(request);
    const db = getDb();
    const result = await db.execute({
      sql: `SELECT * FROM discovered_jobs WHERE user_id = ? AND status = 'pending' ORDER BY match_score DESC`,
      args: [userId],
    });
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('GET /api/discovered error:', error);
    return NextResponse.json({ error: 'Failed to fetch discovered jobs' }, { status: 500 });
  }
}
