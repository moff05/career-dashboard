import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserId } from '@/lib/user';
import { findOrCreateCompany } from '@/lib/companies';
import { ensureConnectionNotesTable } from '@/lib/connectionNotes';

// Most recent connection_notes entry per connection, for the free
// staleness-based follow-up reminder on the Priorities strip (see
// getConnectionFollowups in app/lib/jobUtils.tsx) — a correlated subquery
// rather than a join so a connection with zero log entries still returns
// exactly one row with nulls, instead of being dropped or duplicated.
const LAST_LOG_SELECT = `
  c.*,
  (SELECT entry_date FROM connection_notes n WHERE n.connection_id = c.id ORDER BY n.entry_date DESC, n.id DESC LIMIT 1) AS last_log_date,
  (SELECT note FROM connection_notes n WHERE n.connection_id = c.id ORDER BY n.entry_date DESC, n.id DESC LIMIT 1) AS last_log_note
`;

async function ensureTable() {
  const db = getDb();
  await db.execute(`CREATE TABLE IF NOT EXISTS connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL DEFAULT 'anonymous',
    company TEXT NOT NULL, name TEXT NOT NULL,
    email TEXT, role TEXT, linkedin TEXT,
    relationship TEXT, notes TEXT,
    status TEXT DEFAULT 'not_reached_out',
    company_id INTEGER REFERENCES companies(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  return db;
}

export async function GET(request: NextRequest) {
  try {
    const userId = getUserId(request);
    const db = await ensureTable();
    await ensureConnectionNotesTable();
    const params = new URL(request.url).searchParams;
    const company = params.get('company');
    const companyId = params.get('company_id');
    const result = companyId
      ? await db.execute({ sql: `SELECT ${LAST_LOG_SELECT} FROM connections c WHERE c.user_id = ? AND c.company_id = ? ORDER BY c.created_at DESC`, args: [userId, parseInt(companyId)] })
      : company
      ? await db.execute({ sql: `SELECT ${LAST_LOG_SELECT} FROM connections c WHERE c.user_id = ? AND c.company = ? ORDER BY c.created_at DESC`, args: [userId, company] })
      : await db.execute({ sql: `SELECT ${LAST_LOG_SELECT} FROM connections c WHERE c.user_id = ? ORDER BY c.created_at DESC`, args: [userId] });
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('GET /api/connections error:', error);
    return NextResponse.json({ error: 'Failed to fetch connections' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = getUserId(request);
    const db = await ensureTable();
    const { company, name, email, role, linkedin, relationship, notes } = await request.json();
    if (!company || !name) return NextResponse.json({ error: 'company and name required' }, { status: 400 });
    const companyId = await findOrCreateCompany(userId, company);
    const result = await db.execute({
      sql: 'INSERT INTO connections (user_id, company, name, email, role, linkedin, relationship, notes, company_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      args: [userId, company, name, email || null, role || null, linkedin || null, relationship || null, notes || null, companyId],
    });
    const newConn = (await db.execute({ sql: 'SELECT * FROM connections WHERE id = ?', args: [Number(result.lastInsertRowid)] })).rows[0];
    return NextResponse.json(newConn, { status: 201 });
  } catch (error) {
    console.error('POST /api/connections error:', error);
    return NextResponse.json({ error: 'Failed to create connection' }, { status: 500 });
  }
}
