import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserId } from '@/lib/user';
import { findOrCreateCompany } from '@/lib/companies';

// PATCH { action: 'add' | 'dismiss' } — the only two things a user can do
// with a pending discovered-job row. 'add' copies it into the real `jobs`
// tracker (reusing the score already computed by the scan, no second AI
// call) and marks this row 'added'; 'dismiss' just marks it 'dismissed'.
// Either way the row stays in discovered_jobs afterward purely as a dedup
// record so the same posting is never re-surfaced by a later scan.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = getUserId(request);
    const { id } = await params;
    const db = getDb();
    const { action } = await request.json() as { action?: 'add' | 'dismiss' };
    if (action !== 'add' && action !== 'dismiss') {
      return NextResponse.json({ error: "action must be 'add' or 'dismiss'" }, { status: 400 });
    }

    const row = (await db.execute({
      sql: `SELECT * FROM discovered_jobs WHERE id = ? AND user_id = ? AND status = 'pending'`,
      args: [parseInt(id), userId],
    })).rows[0] as unknown as {
      id: number; company: string; title: string; type: string; location: string | null;
      url: string; description: string | null; posting_date: string | null; source: string | null;
      match_score: number | null; score_data: string | null;
    } | undefined;
    if (!row) return NextResponse.json({ error: 'Discovered job not found' }, { status: 404 });

    if (action === 'add') {
      await db.execute({
        sql: `INSERT INTO jobs (user_id, company, title, type, status, match_score, score_data, posting_date, url, description, location, source, notes)
              VALUES (?, ?, ?, ?, 'saved', ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [userId, row.company, row.title, row.type, row.match_score, row.score_data, row.posting_date, row.url, row.description, row.location, row.source, 'Found by daily job-board scan.'],
      });
      await findOrCreateCompany(userId, row.company);
    }

    await db.execute({
      sql: `UPDATE discovered_jobs SET status = ? WHERE id = ? AND user_id = ?`,
      args: [action === 'add' ? 'added' : 'dismissed', row.id, userId],
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('PATCH /api/discovered/[id] error:', error);
    return NextResponse.json({ error: 'Failed to update discovered job' }, { status: 500 });
  }
}
