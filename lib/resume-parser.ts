import { getDb } from './db';

export async function getResumeText(userId: string): Promise<string> {
  const db = getDb();
  const row = (await db.execute({
    sql: 'SELECT raw_text FROM resume WHERE user_id = ?',
    args: [userId],
  })).rows[0] as unknown as { raw_text: string } | undefined;
  return row?.raw_text || '';
}
