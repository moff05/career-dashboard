import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserId } from '@/lib/user';

const EDITABLE_FIELDS = ['name', 'status', 'notes'] as const;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = getUserId(request);
    const { id } = await params;
    const db = getDb();
    const body = await request.json() as Record<string, string | null | undefined>;
    const fields = EDITABLE_FIELDS.filter(f => body[f] !== undefined);
    if (fields.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const args: (string | number | null)[] = [...fields.map(f => body[f] ?? null), parseInt(id), userId];
    await db.execute({ sql: `UPDATE companies SET ${setClause} WHERE id = ? AND user_id = ?`, args });
    const updated = (await db.execute({ sql: 'SELECT * FROM companies WHERE id = ? AND user_id = ?', args: [parseInt(id), userId] })).rows[0];
    if (!updated) return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    return NextResponse.json(updated);
  } catch (error) {
    console.error('PATCH /api/companies/[id] error:', error);
    return NextResponse.json({ error: 'Failed to update company' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = getUserId(request);
    const { id } = await params;
    const db = getDb();
    // Contacts under this company aren't deleted, just unlinked — they keep
    // their free-text company name, they just stop pointing at a live row.
    await db.execute({ sql: 'UPDATE connections SET company_id = NULL WHERE company_id = ? AND user_id = ?', args: [parseInt(id), userId] });
    await db.execute({ sql: 'DELETE FROM companies WHERE id = ? AND user_id = ?', args: [parseInt(id), userId] });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/companies/[id] error:', error);
    return NextResponse.json({ error: 'Failed to delete company' }, { status: 500 });
  }
}
