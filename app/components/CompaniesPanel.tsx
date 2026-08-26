'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/apiFetch';
import { X, Plus, Trash2, Edit2, Users } from 'lucide-react';
import { useOverlays } from '@/app/OverlayContext';
import { StatusDropdown } from '@/app/components/StatusDropdown';

export interface Company {
  id: number; name: string; status: string; notes: string | null;
  created_at: string; contact_count: number;
}

export const COMPANY_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  researching:  { label: 'Researching',  color: 'var(--text-muted)', bg: 'rgba(148,163,184,0.1)' },
  reaching_out: { label: 'Reaching out', color: 'var(--accent)',     bg: 'var(--accent-bg)' },
  applied:      { label: 'Applied',      color: 'var(--success)',   bg: 'var(--success-bg)' },
};
export const COMPANY_CYCLE = ['researching', 'reaching_out', 'applied'];

const EMPTY_FORM = { name: '', status: 'researching', notes: '' };
type FormData = typeof EMPTY_FORM;

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '16px' };
const label: React.CSSProperties = { display: 'block', color: 'var(--text-muted)', fontSize: '11px', fontWeight: 500, marginBottom: '5px' };

function CompanyForm({ form, setForm, onSave, onCancel, saving }: {
  form: FormData; setForm: React.Dispatch<React.SetStateAction<FormData>>;
  onSave: () => void; onCancel: () => void; saving: boolean;
}) {
  return (
    <div style={{ ...card, marginBottom: '16px' }}>
      <div style={{ marginBottom: '10px' }}>
        <label style={label}>Company *</label>
        <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="field-input" style={{ width: '100%' }} autoFocus />
      </div>
      <label style={label}>Notes</label>
      <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Why this company, roles you're eyeing, warm intro path..." className="field-input" style={{ width: '100%', resize: 'vertical', marginBottom: '10px' }} />
      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={onSave} disabled={!form.name.trim() || saving} className="btn-primary" style={{ padding: '6px 14px', fontSize: '12px' }}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onCancel} className="btn-ghost" style={{ padding: '6px 12px', fontSize: '12px' }}>Cancel</button>
      </div>
    </div>
  );
}

export function CompaniesPanel() {
  const { companiesOpen, closeCompanies, openConnections } = useOverlays();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<FormData>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  async function fetchAll() {
    const data = await apiFetch('/api/companies').then(r => r.json()).catch(() => []);
    setCompanies(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => {
    if (!companiesOpen) return;
    // Refetch on every open, not just the first — a contact added from the
    // Connections panel (which can create a new company) shouldn't need a
    // full page reload to show up here.
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companiesOpen]);

  useEffect(() => {
    if (!companiesOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeCompanies(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [companiesOpen, closeCompanies]);

  async function saveAdd() {
    setSaving(true);
    const created = await apiFetch('/api/companies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(addForm) }).then(r => r.json());
    setCompanies(prev => [{ ...created, contact_count: 0 }, ...prev.filter(c => c.id !== created.id)]);
    setSaving(false);
    setShowAddForm(false);
    setAddForm(EMPTY_FORM);
  }

  function startEdit(company: Company) {
    setEditingId(company.id);
    setEditForm({ name: company.name, status: company.status, notes: company.notes || '' });
  }

  async function saveEdit() {
    if (editingId == null) return;
    setSaving(true);
    const updated = await apiFetch(`/api/companies/${editingId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editForm) }).then(r => r.json());
    setCompanies(prev => prev.map(c => c.id === editingId ? { ...updated, contact_count: c.contact_count } : c));
    setSaving(false);
    setEditingId(null);
  }

  async function setStatus(company: Company, status: string) {
    setCompanies(prev => prev.map(c => c.id === company.id ? { ...c, status } : c));
    await apiFetch(`/api/companies/${company.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
  }

  async function remove(id: number) {
    setCompanies(prev => prev.filter(c => c.id !== id));
    await apiFetch(`/api/companies/${id}`, { method: 'DELETE' });
  }

  if (!companiesOpen) return null;

  return (
    <>
      <div className="overlay-backdrop" onClick={closeCompanies} />
      <div className="overlay-panel center-modal" style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 'min(640px, 94vw)', maxHeight: '88vh', borderRadius: 'var(--r-lg)', display: 'flex', flexDirection: 'column' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text)' }}>
            <span style={{ color: 'var(--accent)' }}>{'>'}</span> companies
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {!showAddForm && (
              <button onClick={() => { setAddForm(EMPTY_FORM); setShowAddForm(true); }} className="btn-primary" style={{ fontSize: '12px', padding: '6px 12px' }}>
                <Plus size={13} /> Add
              </button>
            )}
            <button onClick={closeCompanies} aria-label="Close" style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--r)', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', cursor: 'pointer' }}>
              <X size={14} />
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px 24px' }}>
          {showAddForm && (
            <CompanyForm form={addForm} setForm={setAddForm} onSave={saveAdd} onCancel={() => setShowAddForm(false)} saving={saving} />
          )}

          {loading ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '30px 0' }}>Loading…</div>
          ) : companies.length === 0 ? (
            <div style={{ ...card, padding: '40px 24px', textAlign: 'center' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '6px' }}>No companies yet.</div>
              <div style={{ color: 'var(--text-dim)', fontSize: '12px' }}>Brainstorm every company you'd want to work at — add them here before there's even a job posting.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {companies.map(company => {
                if (editingId === company.id) {
                  return <CompanyForm key={company.id} form={editForm} setForm={setEditForm} onSave={saveEdit} onCancel={() => setEditingId(null)} saving={saving} />;
                }
                return (
                  <div key={company.id} style={card}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ color: 'var(--text)', fontSize: '13px', fontWeight: 700 }}>{company.name}</span>
                          <StatusDropdown value={company.status} options={COMPANY_STATUS} order={COMPANY_CYCLE} onChange={status => setStatus(company, status)} />
                        </div>
                        {company.notes && <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '6px', lineHeight: 1.5 }}>{company.notes}</div>}
                        <button
                          onClick={() => openConnections(company.name)}
                          style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '11px', fontWeight: 600, padding: 0, marginTop: '8px', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          <Users size={11} /> {company.contact_count > 0 ? `${company.contact_count} contact${company.contact_count === 1 ? '' : 's'}` : 'Add a contact'}
                        </button>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
                        <button onClick={() => startEdit(company)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '5px', display: 'flex', borderRadius: 'var(--r-sm)' }}><Edit2 size={12} /></button>
                        <button onClick={() => remove(company.id)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '5px', display: 'flex', borderRadius: 'var(--r-sm)' }}><Trash2 size={12} /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
