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
    const { name, email, phone, linkedin, university, degree, graduation_date, gpa, honors, minors, target_roles, target_cities, work_authorization, notes, resume_text } = body;
    const args = [userId, name, email, phone, linkedin, university, degree, graduation_date, gpa, honors, minors, target_roles, target_cities, work_authorization, notes, resume_text]
      .map(v => (v === undefined ? null : v));
    // On conflict, COALESCE each column against the existing row rather than
    // blindly overwriting with `excluded` — a caller (UI or a direct API call)
    // that omits a field must not silently null out data that was already
    // saved. Once bitten: a direct-to-prod verification PUT that sent only
    // {work_authorization} wiped a real user's name/target_roles/target_cities/
    // resume_text because the old ON CONFLICT clause always took `excluded`.
    await db.execute({
      sql: `INSERT INTO profile (user_id, name, email, phone, linkedin, university, degree, graduation_date, gpa, honors, minors, target_roles, target_cities, work_authorization, notes, resume_text)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
              name=COALESCE(excluded.name, profile.name), email=COALESCE(excluded.email, profile.email), phone=COALESCE(excluded.phone, profile.phone),
              linkedin=COALESCE(excluded.linkedin, profile.linkedin), university=COALESCE(excluded.university, profile.university), degree=COALESCE(excluded.degree, profile.degree),
              graduation_date=COALESCE(excluded.graduation_date, profile.graduation_date), gpa=COALESCE(excluded.gpa, profile.gpa), honors=COALESCE(excluded.honors, profile.honors),
              minors=COALESCE(excluded.minors, profile.minors), target_roles=COALESCE(excluded.target_roles, profile.target_roles), target_cities=COALESCE(excluded.target_cities, profile.target_cities),
              work_authorization=COALESCE(excluded.work_authorization, profile.work_authorization),
              notes=COALESCE(excluded.notes, profile.notes), resume_text=COALESCE(excluded.resume_text, profile.resume_text)`,
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
