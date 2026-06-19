import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserId } from '@/lib/user';

export async function GET(request: NextRequest) {
  try {
    const userId = getUserId(request);
    const db = getDb();
    const result = await db.execute({ sql: 'SELECT * FROM jobs WHERE user_id = ? ORDER BY created_at DESC', args: [userId] });
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('GET /api/jobs error:', error);
    return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = getUserId(request);
    const db = getDb();
    const body = await request.json();
    const { company, title, type, status, match_score, posting_date, deadline, url, description, salary_range, location, source, notes } = body;
    if (!company || !title || !type) return NextResponse.json({ error: 'company, title, type are required' }, { status: 400 });
    const result = await db.execute({
      sql: `INSERT INTO jobs (user_id, company, title, type, status, match_score, posting_date, deadline, url, description, salary_range, location, source, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [userId, company, title, type, status || 'saved', match_score || null, posting_date || null, deadline || null,
             url || null, description || null, salary_range || null, location || null, source || null, notes || null],
    });
    const newJob = (await db.execute({ sql: 'SELECT * FROM jobs WHERE id = ?', args: [Number(result.lastInsertRowid)] })).rows[0];
    return NextResponse.json(newJob, { status: 201 });
  } catch (error) {
    console.error('POST /api/jobs error:', error);
    return NextResponse.json({ error: 'Failed to create job' }, { status: 500 });
  }
}
