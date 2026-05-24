import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const db = getDb();
    const result = await db.execute('SELECT * FROM profile WHERE id = 1');
    return NextResponse.json(result.rows[0] || {});
  } catch (error) {
    console.error('GET /api/profile error:', error);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();
    const { name, email, phone, linkedin, university, degree, graduation_date, gpa, honors, minors, target_roles, target_cities, notes } = body;

    await db.execute({
      sql: `INSERT OR REPLACE INTO profile (id, name, email, phone, linkedin, university, degree, graduation_date, gpa, honors, minors, target_roles, target_cities, notes)
            VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [name, email, phone, linkedin, university, degree, graduation_date, gpa, honors, minors, target_roles, target_cities, notes],
    });

    const updated = (await db.execute('SELECT * FROM profile WHERE id = 1')).rows[0];
    return NextResponse.json(updated);
  } catch (error) {
    console.error('PUT /api/profile error:', error);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
