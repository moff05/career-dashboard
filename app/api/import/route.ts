import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserId } from '@/lib/user';

// Singular tables (one row per user, unique on user_id) — import upserts.
const SINGLE_TABLES: Record<string, string[]> = {
  profile: ['name', 'email', 'phone', 'linkedin', 'university', 'degree', 'graduation_date', 'gpa', 'honors', 'minors', 'target_roles', 'target_cities', 'notes', 'resume_text'],
};

// Multi-row tables — import appends as new rows under the current user.
// resume moved here once multiple named resumes per user became possible.
const MULTI_TABLES: Record<string, string[]> = {
  resume: ['name', 'raw_text', 'parsed_at', 'is_default'],
  jobs: ['company', 'title', 'type', 'status', 'match_score', 'posting_date', 'deadline', 'url', 'description', 'salary_range', 'location', 'source', 'notes', 'starred', 'created_at', 'status_updated_at'],
  chat_messages: ['role', 'content', 'session_id', 'created_at'],
  memories: ['content', 'category', 'source', 'created_at'],
  timeline_events: ['title', 'description', 'date', 'type', 'done', 'created_at'],
  connections: ['company', 'name', 'relationship', 'notes', 'status', 'created_at'],
  leads: ['company', 'title', 'url', 'location', 'type', 'fit_score', 'fit_reasoning', 'tags', 'source_query', 'created_at', 'dismissed'],
};

export async function POST(request: NextRequest) {
  try {
    const userId = getUserId(request);
    const db = getDb();
    const body = await request.json() as Record<string, unknown>;

    if (!body || typeof body !== 'object' || !('version' in body)) {
      return NextResponse.json({ error: 'That doesn\'t look like a valid backup file.' }, { status: 400 });
    }

    let imported = 0;

    for (const [table, columns] of Object.entries(SINGLE_TABLES)) {
      const rows = body[table];
      const row = (Array.isArray(rows) ? rows[0] : rows) as Record<string, unknown> | undefined;
      if (!row) continue;
      const placeholders = columns.map(() => '?').join(', ');
      const updateSet = columns.map(c => `${c}=excluded.${c}`).join(', ');
      await db.execute({
        sql: `INSERT INTO ${table} (user_id, ${columns.join(', ')}) VALUES (?, ${placeholders})
              ON CONFLICT(user_id) DO UPDATE SET ${updateSet}`,
        args: [userId, ...columns.map(c => (row[c] ?? null) as string | number | null)],
      });
      imported++;
    }

    for (const [table, columns] of Object.entries(MULTI_TABLES)) {
      const rows = body[table];
      if (!Array.isArray(rows)) continue;
      for (const row of rows as Record<string, unknown>[]) {
        const placeholders = columns.map(() => '?').join(', ');
        await db.execute({
          sql: `INSERT INTO ${table} (user_id, ${columns.join(', ')}) VALUES (?, ${placeholders})`,
          args: [userId, ...columns.map(c => (row[c] ?? null) as string | number | null)],
        });
        imported++;
      }
    }

    return NextResponse.json({ ok: true, imported });
  } catch (error) {
    console.error('POST /api/import error:', error);
    return NextResponse.json({ error: 'Import failed — check the file is a valid export.' }, { status: 500 });
  }
}
