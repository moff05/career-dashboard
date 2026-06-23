import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserId } from '@/lib/user';
import { ensureUsageTable } from '@/lib/usage';

interface UsageRow {
  route: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  web_search_requests: number;
  cost_usd: number;
}

export async function GET(request: NextRequest) {
  try {
    const userId = getUserId(request);
    await ensureUsageTable();
    const db = getDb();

    const totalsRow = (await db.execute({
      sql: `SELECT
        COUNT(*) AS calls,
        COALESCE(SUM(input_tokens), 0) AS input_tokens,
        COALESCE(SUM(output_tokens), 0) AS output_tokens,
        COALESCE(SUM(web_search_requests), 0) AS web_search_requests,
        COALESCE(SUM(cost_usd), 0) AS cost_usd,
        MIN(created_at) AS since
        FROM usage_log WHERE user_id = ?`,
      args: [userId],
    })).rows[0] as unknown as {
      calls: number; input_tokens: number; output_tokens: number;
      web_search_requests: number; cost_usd: number; since: string | null;
    };

    const byRoute = (await db.execute({
      sql: `SELECT route,
        COUNT(*) AS calls,
        COALESCE(SUM(input_tokens), 0) AS input_tokens,
        COALESCE(SUM(output_tokens), 0) AS output_tokens,
        COALESCE(SUM(web_search_requests), 0) AS web_search_requests,
        COALESCE(SUM(cost_usd), 0) AS cost_usd
        FROM usage_log WHERE user_id = ? GROUP BY route ORDER BY cost_usd DESC`,
      args: [userId],
    })).rows as unknown as UsageRow[];

    return NextResponse.json({
      total_calls: totalsRow?.calls || 0,
      total_input_tokens: totalsRow?.input_tokens || 0,
      total_output_tokens: totalsRow?.output_tokens || 0,
      total_web_search_requests: totalsRow?.web_search_requests || 0,
      total_cost_usd: totalsRow?.cost_usd || 0,
      since: totalsRow?.since || null,
      by_route: byRoute,
    });
  } catch (error) {
    console.error('GET /api/usage error:', error);
    return NextResponse.json({ error: 'Failed to load usage' }, { status: 500 });
  }
}
