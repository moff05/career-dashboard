import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserId } from '@/lib/user';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = getUserId(request);
    const db = getDb();
    const { id } = await params;
    const body = await request.json();
    const { company, title, type, status, match_score, posting_date, deadline, url, description, salary_range, location, source, notes } = body;
    await db.execute({
      sql: `UPDATE jobs SET company=?, title=?, type=?, status=?, match_score=?, posting_date=?, deadline=?, url=?, description=?, salary_range=?, location=?, source=?, notes=? WHERE id=? AND user_id=?`,
      // libsql throws on `undefined` bind params (not just falls back to NULL), so any
      // field missing from the body would crash the whole update — coalesce defensively.
      args: [company ?? null, title ?? null, type ?? null, status ?? null, match_score || null, posting_date || null, deadline || null,
             url || null, description || null, salary_range || null, location || null, source || null, notes || null,
             parseInt(id), userId],
    });
    const updated = (await db.execute({ sql: 'SELECT * FROM jobs WHERE id = ?', args: [parseInt(id)] })).rows[0];
    return NextResponse.json(updated);
  } catch (error) {
    console.error('PUT /api/jobs/[id] error:', error);
    return NextResponse.json({ error: 'Failed to update job' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = getUserId(request);
    const db = getDb();
    const { id } = await params;
    const body = await request.json();
    if ('status' in body) body.status_updated_at = new Date().toISOString();
    const fields = Object.keys(body).map(k => `${k} = ?`).join(', ');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const args = [...Object.values(body), parseInt(id), userId] as any[];
    await db.execute({ sql: `UPDATE jobs SET ${fields} WHERE id = ? AND user_id = ?`, args });
    const updated = (await db.execute({ sql: 'SELECT * FROM jobs WHERE id = ?', args: [parseInt(id)] })).rows[0];
    return NextResponse.json(updated);
  } catch (error) {
    console.error('PATCH /api/jobs/[id] error:', error);
    return NextResponse.json({ error: 'Failed to update job' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = getUserId(request);
    const db = getDb();
    const { id } = await params;
    await db.execute({ sql: 'DELETE FROM jobs WHERE id = ? AND user_id = ?', args: [parseInt(id), userId] });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/jobs/[id] error:', error);
    return NextResponse.json({ error: 'Failed to delete job' }, { status: 500 });
  }
}
