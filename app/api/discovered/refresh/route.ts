import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserId } from '@/lib/user';
import { scanBoardsForUser } from '@/lib/scanBoards';

export const maxDuration = 60;

// Lets a user pull a fresh batch of board matches without waiting for next
// Monday's cron — but only once they've actually looked at what's currently
// sitting in their queue. "Cleared" means every pending row has been added
// or dismissed; approving/rejecting a job is the signal that they reviewed
// this batch, which is what unlocks pulling the next one. Scanning again
// while pending rows still exist would just bury unreviewed matches under a
// second batch, so this 409s instead.
export async function POST(request: NextRequest) {
  try {
    const userId = getUserId(request);
    const db = getDb();

    const pending = await db.execute({
      sql: `SELECT COUNT(*) as n FROM discovered_jobs WHERE user_id = ? AND status = 'pending'`,
      args: [userId],
    });
    const pendingCount = Number((pending.rows[0] as unknown as { n: number }).n);
    if (pendingCount > 0) {
      return NextResponse.json({ error: 'Review or dismiss everything in your current queue before pulling a new batch.' }, { status: 409 });
    }

    const profileRow = (await db.execute({
      sql: `SELECT target_roles, target_cities FROM profile WHERE user_id = ?`,
      args: [userId],
    })).rows[0] as unknown as { target_roles: string | null; target_cities: string | null } | undefined;
    if (!profileRow?.target_roles?.trim() || !profileRow?.target_cities?.trim()) {
      return NextResponse.json({ error: 'Add target roles and target cities in Profile before scanning boards.' }, { status: 400 });
    }

    const result = await scanBoardsForUser(userId, { target_roles: profileRow.target_roles, target_cities: profileRow.target_cities });
    return NextResponse.json({ ok: true, ...result.stats, notes: result.notes });
  } catch (error) {
    console.error('POST /api/discovered/refresh error:', error);
    return NextResponse.json({ error: 'Refresh failed' }, { status: 500 });
  }
}
