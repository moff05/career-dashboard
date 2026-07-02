import { getDb } from '@/lib/db';

const DAILY_LIMIT = 50;

// Returns true if the user has hit their daily AI call limit.
// Reads from usage_log so no extra table is needed.
export async function isRateLimited(userId: string): Promise<boolean> {
  try {
    const db = getDb();
    const row = await db.execute({
      sql: `SELECT COUNT(*) as n FROM usage_log WHERE user_id = ? AND created_at >= date('now')`,
      args: [userId],
    });
    return Number((row.rows[0] as unknown as { n: number }).n) >= DAILY_LIMIT;
  } catch {
    // If the check fails, fail open — don't block the user due to a logging error.
    return false;
  }
}

export const RATE_LIMIT_RESPONSE = { error: 'Daily AI limit reached. Try again tomorrow.' };
