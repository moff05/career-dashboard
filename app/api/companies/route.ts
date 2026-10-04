import { NextRequest, NextResponse } from 'next/server';
import { getUserId } from '@/lib/user';
import { ensureCompaniesTable, findOrCreateCompany } from '@/lib/companies';

export async function GET(request: NextRequest) {
  try {
    const userId = getUserId(request);
    const db = await ensureCompaniesTable();
    const result = await db.execute({
      // status is upgraded to 'applied' (never downgraded) when any tracked job
      // at this company has moved past 'saved' — rejected counts, since you
      // can only be rejected from something you applied to. Company status is
      // otherwise a manual field with no link to jobs, so without this a
      // company stayed "Researching" even after applying there.
      sql: `SELECT c.id, c.user_id, c.name, c.notes, c.career_url, c.created_at,
              CASE WHEN c.status != 'applied' AND EXISTS (
                SELECT 1 FROM jobs j WHERE j.user_id = c.user_id AND j.company = c.name COLLATE NOCASE
                  AND j.status IN ('applied', 'interviewing', 'offer', 'rejected')
              ) THEN 'applied' ELSE c.status END AS status,
              (SELECT COUNT(*) FROM connections WHERE connections.company_id = c.id) AS contact_count
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
    const { name, status, notes, career_url } = await request.json();
    if (!name || !String(name).trim()) return NextResponse.json({ error: 'name required' }, { status: 400 });

    // findOrCreate so re-adding an existing name (case-insensitive) never
    // creates a duplicate — it just returns the existing row.
    const id = await findOrCreateCompany(userId, name, career_url || undefined);
    if (status || notes || career_url) {
      await db.execute({
        sql: 'UPDATE companies SET status = COALESCE(?, status), notes = COALESCE(?, notes), career_url = COALESCE(?, career_url) WHERE id = ?',
        args: [status || null, notes || null, career_url || null, id],
      });
    }
    const created = (await db.execute({ sql: 'SELECT * FROM companies WHERE id = ?', args: [id] })).rows[0];
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('POST /api/companies error:', error);
    return NextResponse.json({ error: 'Failed to create company' }, { status: 500 });
  }
}
