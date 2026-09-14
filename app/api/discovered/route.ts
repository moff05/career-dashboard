import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserId } from '@/lib/user';

// Pending review queue from the weekly board scan (see
// app/api/cron/scan-boards), sorted best fit first, sitting here until the
// user explicitly adds or dismisses each one. Nothing here has touched the
// real jobs tracker yet. Also returns the most recent scan time (across any
// status, pending or not) so the UI can show "last scanned: ..." next to
// the manual refresh action (see app/api/discovered/refresh).
export async function GET(request: NextRequest) {
  try {
    const userId = getUserId(request);
    const db = getDb();
    const [pending, lastScan] = await Promise.all([
      db.execute({
        sql: `SELECT * FROM discovered_jobs WHERE user_id = ? AND status = 'pending' ORDER BY match_score DESC`,
        args: [userId],
      }),
      db.execute({
        sql: `SELECT MAX(created_at) as last_scan_at FROM discovered_jobs WHERE user_id = ?`,
        args: [userId],
      }),
    ]);
    return NextResponse.json({
      jobs: pending.rows,
      lastScanAt: (lastScan.rows[0] as unknown as { last_scan_at: string | null }).last_scan_at,
    });
  } catch (error) {
    console.error('GET /api/discovered error:', error);
    return NextResponse.json({ error: 'Failed to fetch discovered jobs' }, { status: 500 });
  }
}
