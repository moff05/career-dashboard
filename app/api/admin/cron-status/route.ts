import { NextRequest, NextResponse } from 'next/server';
import { ensureCronRunsTable } from '@/lib/cronRuns';

// Persistent cron health, queryable anytime — see lib/cronRuns.ts for why
// this exists (Vercel's own request logs on this project's Hobby plan only
// retain ~2 hours, so by the time anyone thinks to check a stale scan,
// the evidence is already gone).
export async function GET(request: NextRequest) {
  const adminKey = request.headers.get('x-admin-key');
  if (!process.env.ADMIN_SECRET || adminKey !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = await ensureCronRunsTable();
    const runs = await db.execute(
      `SELECT id, started_at, finished_at, success, users_scanned, users_with_errors, total_staged, notes, error
       FROM cron_runs ORDER BY started_at DESC LIMIT 20`
    );
    const lastSuccess = await db.execute(
      `SELECT started_at FROM cron_runs WHERE success = 1 ORDER BY started_at DESC LIMIT 1`
    );
    const daysSinceLastSuccess = lastSuccess.rows[0]
      ? Math.floor((Date.now() - new Date(String(lastSuccess.rows[0].started_at)).getTime()) / 86400000)
      : null;

    return NextResponse.json({
      lastSuccessfulRunAt: lastSuccess.rows[0]?.started_at ?? null,
      daysSinceLastSuccessfulRun: daysSinceLastSuccess,
      // Weekly cron means ~7-8 days between runs is normal; flag anything
      // meaningfully past that so it's obvious at a glance, not just a number.
      stale: daysSinceLastSuccess === null || daysSinceLastSuccess > 10,
      recentRuns: runs.rows,
    });
  } catch (error) {
    console.error('GET /api/admin/cron-status error:', error);
    return NextResponse.json({ error: 'Failed to fetch cron status' }, { status: 500 });
  }
}
