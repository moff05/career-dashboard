import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';

// Per-user daily cap across every AI route combined (not per-route) — the
// thing actually at risk is the shared Groq account's 8,000 TPM ceiling
// (see lib/groq.ts), which every route draws from regardless of which
// feature triggered the call. A single user importing/scoring/drafting
// through a busy session can reasonably hit a few dozen calls; 50/day
// covers that with room, while still bounding how much one account (or a
// script hammering the API directly) can draw from the shared budget in a
// day. Counted straight from usage_log, so it's exact, not estimated.
export const DAILY_AI_CALL_CAP = 50;

export async function isOverDailyAiCap(userId: string): Promise<boolean> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT COUNT(*) as count FROM usage_log WHERE user_id = ? AND created_at >= date('now')`,
    args: [userId],
  });
  const count = Number((result.rows[0] as unknown as { count: number | string }).count);
  return count >= DAILY_AI_CALL_CAP;
}

export function dailyCapResponse() {
  return NextResponse.json(
    { error: `You've hit today's AI usage limit (${DAILY_AI_CALL_CAP} calls). Resets at midnight UTC.` },
    { status: 429 }
  );
}
