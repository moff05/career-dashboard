import { NextRequest, NextResponse } from 'next/server';
import { getUserId } from '@/lib/user';
import { ensureCompaniesTable, findOrCreateCompany } from '@/lib/companies';

export async function GET(request: NextRequest) {
  try {
    const userId = getUserId(request);
    const db = await ensureCompaniesTable();
    const result = await db.execute({
      sql: `SELECT c.*, (SELECT COUNT(*) FROM connections WHERE connections.company_id = c.id) AS contact_count
            FROM companies c WHERE c.user_id = ? ORDER BY c.created_at DESC`,
      args: [userId],
    });
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('GET /api/companies error:', error);
    return NextResponse.json({ error: 'Failed to fetch companies' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = getUserId(request);
    const db = await ensureCompaniesTable();
    const { name, status, notes } = await request.json();
    if (!name || !String(name).trim()) return NextResponse.json({ error: 'name required' }, { status: 400 });

    // findOrCreate so re-adding an existing name (case-insensitive) never
    // creates a duplicate — it just returns the existing row.
    const id = await findOrCreateCompany(userId, name);
    if (status || notes) {
      await db.execute({
        sql: 'UPDATE companies SET status = COALESCE(?, status), notes = COALESCE(?, notes) WHERE id = ?',
        args: [status || null, notes || null, id],
      });
    }
    const created = (await db.execute({ sql: 'SELECT * FROM companies WHERE id = ?', args: [id] })).rows[0];
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('POST /api/companies error:', error);
    return NextResponse.json({ error: 'Failed to create company' }, { status: 500 });
  }
}
