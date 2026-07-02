import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  const adminKey = request.headers.get('x-admin-key');
  if (!process.env.ADMIN_SECRET || adminKey !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = getDb();

    const totals = await db.execute(`
      SELECT
        COUNT(*) as total_calls,
        SUM(input_tokens) as total_input,
        SUM(output_tokens) as total_output,
        ROUND(SUM(cost_usd), 6) as total_cost,
        MIN(created_at) as since
      FROM usage_log
    `);

    const byUser = await db.execute(`
      SELECT user_id, COUNT(*) as calls, ROUND(SUM(cost_usd), 6) as cost
      FROM usage_log
      GROUP BY user_id
      ORDER BY cost DESC
      LIMIT 20
    `);

    const byRoute = await db.execute(`
      SELECT route, model, COUNT(*) as calls, ROUND(SUM(cost_usd), 6) as cost
      FROM usage_log
      GROUP BY route, model
      ORDER BY calls DESC
    `);

    const today = await db.execute(`
      SELECT COUNT(*) as calls, ROUND(SUM(cost_usd), 6) as cost
      FROM usage_log
      WHERE created_at >= date('now')
    `);

    return NextResponse.json({
      totals: totals.rows[0],
      today: today.rows[0],
      top_users: byUser.rows,
      by_route: byRoute.rows,
    });
  } catch (error) {
    console.error('GET /api/admin/usage error:', error);
    return NextResponse.json({ error: 'Failed to fetch usage' }, { status: 500 });
  }
}
