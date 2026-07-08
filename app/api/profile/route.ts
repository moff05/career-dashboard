import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserId } from '@/lib/user';
import crypto from 'crypto';

function generateRecoveryKey(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(12);
  const key = Array.from(bytes, b => chars[b % chars.length]).join('');
  return `${key.slice(0, 4)}-${key.slice(4, 8)}-${key.slice(8, 12)}`;
}

async function ensureRecoveryKey(db: ReturnType<typeof getDb>, userId: string) {
  let attempts = 0;
  while (attempts < 5) {
    const key = generateRecoveryKey();
    try {
      await db.execute({
        sql: 'UPDATE profile SET recovery_key = ? WHERE user_id = ? AND recovery_key IS NULL',
        args: [key, userId],
      });
      return key;
    } catch {
      attempts++;
    }
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const userId = getUserId(request);
    const db = getDb();
    const result = await db.execute({ sql: 'SELECT * FROM profile WHERE user_id = ?', args: [userId] });
    const row = result.rows[0];
    if (!row) return NextResponse.json({});

    if (!row.recovery_key) {
      const key = await ensureRecoveryKey(db, userId);
      return NextResponse.json({ ...row, recovery_key: key });
    }
    return NextResponse.json(row);
  } catch (error) {
    console.error('GET /api/profile error:', error);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = getUserId(request);
    const db = getDb();
    const body = await request.json();
    // libsql rejects `undefined` bind params outright (throws, no helpful message) —
    // any field missing from the body must be coalesced to null before binding,
    // or the whole update silently fails even though the other fields were fine.
    const { name, email, phone, linkedin, university, degree, graduation_date, gpa, honors, minors, target_roles, target_cities, notes, resume_text } = body;
    const args = [userId, name, email, phone, linkedin, university, degree, graduation_date, gpa, honors, minors, target_roles, target_cities, notes, resume_text]
      .map(v => (v === undefined ? null : v));
    await db.execute({
      sql: `INSERT INTO profile (user_id, name, email, phone, linkedin, university, degree, graduation_date, gpa, honors, minors, target_roles, target_cities, notes, resume_text)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
              name=excluded.name, email=excluded.email, phone=excluded.phone,
              linkedin=excluded.linkedin, university=excluded.university, degree=excluded.degree,
              graduation_date=excluded.graduation_date, gpa=excluded.gpa, honors=excluded.honors,
              minors=excluded.minors, target_roles=excluded.target_roles, target_cities=excluded.target_cities,
              notes=excluded.notes, resume_text=excluded.resume_text`,
      args,
    });

    const updated = (await db.execute({ sql: 'SELECT * FROM profile WHERE user_id = ?', args: [userId] })).rows[0];
    if (updated && !updated.recovery_key) {
      const key = await ensureRecoveryKey(db, userId);
      return NextResponse.json({ ...updated, recovery_key: key });
    }
    return NextResponse.json(updated);
  } catch (error) {
    console.error('PUT /api/profile error:', error);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
