import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserId } from '@/lib/user';

export async function GET(request: NextRequest) {
  try {
    const userId = getUserId(request);
    const db = getDb();
    const result = await db.execute({ sql: 'SELECT * FROM profile WHERE user_id = ?', args: [userId] });
    return NextResponse.json(result.rows[0] || {});
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
    const { name, email, phone, linkedin, university, degree, graduation_date, gpa, honors, minors, target_roles, target_cities, notes, resume_text } = body;
    await db.execute({
      sql: `INSERT INTO profile (user_id, name, email, phone, linkedin, university, degree, graduation_date, gpa, honors, minors, target_roles, target_cities, notes, resume_text)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
              name=excluded.name, email=excluded.email, phone=excluded.phone,
              linkedin=excluded.linkedin, university=excluded.university, degree=excluded.degree,
              graduation_date=excluded.graduation_date, gpa=excluded.gpa, honors=excluded.honors,
              minors=excluded.minors, target_roles=excluded.target_roles, target_cities=excluded.target_cities,
              notes=excluded.notes, resume_text=excluded.resume_text`,
      args: [userId, name, email, phone, linkedin, university, degree, graduation_date, gpa, honors, minors, target_roles, target_cities, notes, resume_text || null],
    });
    const updated = (await db.execute({ sql: 'SELECT * FROM profile WHERE user_id = ?', args: [userId] })).rows[0];
    return NextResponse.json(updated);
  } catch (error) {
    console.error('PUT /api/profile error:', error);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
