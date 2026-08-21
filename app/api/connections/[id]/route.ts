import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserId } from '@/lib/user';
import { findOrCreateCompany } from '@/lib/companies';

const EDITABLE_FIELDS = ['name', 'company', 'email', 'role', 'linkedin', 'relationship', 'notes', 'status'] as const;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = getUserId(request);
    const { id } = await params;
    const db = getDb();
    const body = await request.json() as Record<string, string | null | undefined>;
    const fields = EDITABLE_FIELDS.filter(f => body[f] !== undefined);
    if (fields.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    // A company text edit re-resolves company_id too, so renaming a contact
    // to a different company (typed or picked) re-links it correctly.
    const setFields = [...fields] as string[];
    const args: (string | number | null)[] = fields.map(f => body[f] ?? null);
    if (body.company !== undefined) {
      const companyId = await findOrCreateCompany(userId, body.company || '');
      setFields.push('company_id');
      args.push(companyId);
    }
    const setClause = setFields.map(f => `${f} = ?`).join(', ');
    args.push(parseInt(id), userId);
    await db.execute({ sql: `UPDATE connections SET ${setClause} WHERE id = ? AND user_id = ?`, args });
    const updated = (await db.execute({ sql: 'SELECT * FROM connections WHERE id = ? AND user_id = ?', args: [parseInt(id), userId] })).rows[0];
    if (!updated) return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
    return NextResponse.json(updated);
  } catch (error) {
    console.error('PATCH /api/connections/[id] error:', error);
    return NextResponse.json({ error: 'Failed to update connection' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = getUserId(request);
    const { id } = await params;
    const db = getDb();
    await db.execute({ sql: 'DELETE FROM connections WHERE id = ? AND user_id = ?', args: [parseInt(id), userId] });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/connections/[id] error:', error);
    return NextResponse.json({ error: 'Failed to delete connection' }, { status: 500 });
  }
}
