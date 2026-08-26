'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/apiFetch';
import { X, Plus, Trash2, Edit2, ExternalLink } from 'lucide-react';
import { useOverlays } from '@/app/OverlayContext';
import { StatusDropdown } from '@/app/components/StatusDropdown';
import { ConnectionLog } from '@/app/components/ConnectionLog';

export interface Connection {
  id: number; company: string; name: string;
  email: string | null; role: string | null; linkedin: string | null;
  relationship: string | null; notes: string | null;
  status: string; created_at: string;
}

export const CONN_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  not_reached_out: { label: 'Not reached out', color: 'var(--text-muted)', bg: 'rgba(148,163,184,0.1)' },
  reached_out:     { label: 'Reached out',     color: 'var(--accent)', bg: 'var(--accent-bg)' },
  responded:       { label: 'Responded',       color: 'var(--success)', bg: 'var(--success-bg)' },
  talked:          { label: 'Talked',          color: '#38bdf8', bg: 'rgba(56,189,248,0.08)' },
  warm:            { label: 'Warm',             color: '#7c3aed', bg: 'rgba(124,58,237,0.08)' },
};
export const CONN_CYCLE = ['not_reached_out', 'reached_out', 'responded', 'talked', 'warm'];

const EMPTY_FORM = { name: '', company: '', email: '', role: '', linkedin: '', relationship: '', notes: '' };
type FormData = typeof EMPTY_FORM;

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '16px' };
const label: React.CSSProperties = { display: 'block', color: 'var(--text-muted)', fontSize: '11px', fontWeight: 500, marginBottom: '5px' };

// Type a new company or pick an existing one from the dropdown — either way
// the backend resolves/creates the matching companies row (see
// findOrCreateCompany), so this never needs its own separate save step.
function CompanyField({ value, onChange, companyNames }: {
  value: string; onChange: (v: string) => void; companyNames: string[];
}) {
  const [open, setOpen] = useState(false);
  const q = value.trim().toLowerCase();
  const filtered = (q ? companyNames.filter(n => n.toLowerCase().includes(q)) : companyNames).slice(0, 6);
  return (
    <div style={{ position: 'relative' }}>
      <input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        className="field-input" style={{ width: '100%' }}
        placeholder="Type or pick existing..."
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', boxShadow: '0 8px 24px rgba(0,0,0,0.35)', zIndex: 20, maxHeight: '160px', overflowY: 'auto' }}>
          {filtered.map(name => (
            <div
              key={name}
              onMouseDown={() => { onChange(name); setOpen(false); }}
              style={{ padding: '7px 10px', fontSize: '12px', color: 'var(--text)', cursor: 'pointer' }}
            >
              {name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ConnectionForm({ form, setForm, onSave, onCancel, saving, companyNames }: {
  form: FormData; setForm: React.Dispatch<React.SetStateAction<FormData>>;
  onSave: () => void; onCancel: () => void; saving: boolean; companyNames: string[];
}) {
  return (
    <div style={{ ...card, marginBottom: '16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
        <div>
          <label style={label}>Name *</label>
          <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="field-input" style={{ width: '100%' }} autoFocus />
        </div>
        <div>
          <label style={label}>Company *</label>
          <CompanyField value={form.company} onChange={v => setForm(p => ({ ...p, company: v }))} companyNames={companyNames} />
        </div>
        <div>
          <label style={label}>Email</label>
          <input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className="field-input" style={{ width: '100%' }} />
        </div>
        <div>
          <label style={label}>Role</label>
          <input value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))} placeholder="Recruiter, alum, etc." className="field-input" style={{ width: '100%' }} />
        </div>
        <div>
          <label style={label}>LinkedIn</label>
          <input value={form.linkedin} onChange={e => setForm(p => ({ ...p, linkedin: e.target.value }))} placeholder="linkedin.com/in/..." className="field-input" style={{ width: '100%' }} />
        </div>
        <div>
          <label style={label}>How you know them</label>
          <input value={form.relationship} onChange={e => setForm(p => ({ ...p, relationship: e.target.value }))} placeholder="Career fair, alum network..." className="field-input" style={{ width: '100%' }} />
        </div>
      </div>
      <label style={label}>Notes</label>
      <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} className="field-input" style={{ width: '100%', resize: 'vertical', marginBottom: '10px' }} />
      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={onSave} disabled={!form.name.trim() || !form.company.trim() || saving} className="btn-primary" style={{ padding: '6px 14px', fontSize: '12px' }}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onCancel} className="btn-ghost" style={{ padding: '6px 12px', fontSize: '12px' }}>Cancel</button>
      </div>
    </div>
  );
}

export function ConnectionsPanel() {
  const { connectionsOpen, closeConnections, connectionsPrefillCompany } = useOverlays();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [companyNames, setCompanyNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<FormData>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  async function fetchAll() {
    const [connData, companyData] = await Promise.all([
      apiFetch('/api/connections').then(r => r.json()).catch(() => []),
      apiFetch('/api/companies').then(r => r.json()).catch(() => []),
    ]);
    setConnections(Array.isArray(connData) ? connData : []);
    setCompanyNames(Array.isArray(companyData) ? companyData.map((c: { name: string }) => c.name) : []);
    setLoading(false);
  }

  useEffect(() => {
    if (!connectionsOpen) return;
    // Refetch on every open, not just the first — otherwise a company added
    // from the Companies panel (or a contact added, then this panel closed
    // and reopened) keeps showing stale data until a full page reload.
    fetchAll();
    // A prefill company means we got here from a job's Network tab "+ Add" —
    // open straight into the add form with that company already filled in.
    if (connectionsPrefillCompany) {
      setAddForm({ ...EMPTY_FORM, company: connectionsPrefillCompany });
      setShowAddForm(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionsOpen, connectionsPrefillCompany]);

  useEffect(() => {
    if (!connectionsOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeConnections(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [connectionsOpen, closeConnections]);

  async function saveAdd() {
    setSaving(true);
    const created = await apiFetch('/api/connections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(addForm) }).then(r => r.json());
    setConnections(prev => [created, ...prev]);
    // Adding a contact at a brand-new company should let that company show
    // up in the dropdown immediately, without waiting for a full refetch.
    setCompanyNames(prev => prev.some(n => n.toLowerCase() === addForm.company.trim().toLowerCase()) ? prev : [...prev, addForm.company.trim()]);
    setSaving(false);
    setShowAddForm(false);
    setAddForm(EMPTY_FORM);
  }

  function startEdit(conn: Connection) {
    setEditingId(conn.id);
    setEditForm({ name: conn.name, company: conn.company, email: conn.email || '', role: conn.role || '', linkedin: conn.linkedin || '', relationship: conn.relationship || '', notes: conn.notes || '' });
  }

  async function saveEdit() {
    if (editingId == null) return;
    setSaving(true);
    const updated = await apiFetch(`/api/connections/${editingId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editForm) }).then(r => r.json());
    setConnections(prev => prev.map(c => c.id === editingId ? updated : c));
    setSaving(false);
    setEditingId(null);
  }

  async function setStatus(conn: Connection, status: string) {
    setConnections(prev => prev.map(c => c.id === conn.id ? { ...c, status } : c));
    await apiFetch(`/api/connections/${conn.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
  }

  async function remove(id: number) {
    setConnections(prev => prev.filter(c => c.id !== id));
    await apiFetch(`/api/connections/${id}`, { method: 'DELETE' });
  }

  if (!connectionsOpen) return null;

  const grouped = connections.reduce((acc, c) => {
    if (!acc[c.company]) acc[c.company] = [];
    acc[c.company].push(c);
    return acc;
  }, {} as Record<string, Connection[]>);
  const companies = Object.keys(grouped).sort((a, b) => a.localeCompare(b));

  return (
    <>
      <div className="overlay-backdrop" onClick={closeConnections} />
      <div className="overlay-panel center-modal" style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 'min(640px, 94vw)', maxHeight: '88vh', borderRadius: 'var(--r-lg)', display: 'flex', flexDirection: 'column' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text)' }}>
            <span style={{ color: 'var(--accent)' }}>{'>'}</span> connections
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {!showAddForm && (
              <button onClick={() => { setAddForm(EMPTY_FORM); setShowAddForm(true); }} className="btn-primary" style={{ fontSize: '12px', padding: '6px 12px' }}>
                <Plus size={13} /> Add
              </button>
            )}
            <button onClick={closeConnections} aria-label="Close" style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--r)', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', cursor: 'pointer' }}>
              <X size={14} />
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px 24px' }}>
          {showAddForm && <div style={{ marginBottom: '4px' }} />}

          {showAddForm && (
            <ConnectionForm form={addForm} setForm={setAddForm} onSave={saveAdd} onCancel={() => setShowAddForm(false)} saving={saving} companyNames={companyNames} />
          )}

          {loading ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '30px 0' }}>Loading…</div>
          ) : companies.length === 0 ? (
            <div style={{ ...card, padding: '40px 24px', textAlign: 'center' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '6px' }}>No connections yet.</div>
              <div style={{ color: 'var(--text-dim)', fontSize: '12px' }}>Add recruiters, alumni, or anyone at a company you're targeting.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {companies.map(company => (
                <div key={company}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', paddingBottom: '6px', borderBottom: '1px solid var(--border-dim)' }}>
                    <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '12px' }}>{'>'}</span>
                    <span className="section-label">{company}</span>
                    <span style={{ color: 'var(--text-dim)', fontSize: '10px', fontWeight: 600 }}>{grouped[company].length}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {grouped[company].map(conn => {
                      if (editingId === conn.id) {
                        return <ConnectionForm key={conn.id} form={editForm} setForm={setEditForm} onSave={saveEdit} onCancel={() => setEditingId(null)} saving={saving} companyNames={companyNames} />;
                      }
                      return (
                        <div key={conn.id} style={card}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <span style={{ color: 'var(--text)', fontSize: '13px', fontWeight: 700 }}>{conn.name}</span>
                                {conn.role && <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{conn.role}</span>}
                                <StatusDropdown value={conn.status} options={CONN_STATUS} order={CONN_CYCLE} onChange={status => setStatus(conn, status)} />
                              </div>
                              {conn.relationship && <div style={{ color: 'var(--text-dim)', fontSize: '11px', marginTop: '3px' }}>{conn.relationship}</div>}
                              <div style={{ display: 'flex', gap: '12px', marginTop: '6px', flexWrap: 'wrap' }}>
                                {conn.email && <a href={`mailto:${conn.email}`} style={{ color: 'var(--text-muted)', fontSize: '11px', textDecoration: 'none' }}>{conn.email}</a>}
                                {conn.linkedin && (
                                  <a href={conn.linkedin.startsWith('http') ? conn.linkedin : `https://${conn.linkedin}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', fontSize: '11px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                    LinkedIn <ExternalLink size={10} />
                                  </a>
                                )}
                              </div>
                              {conn.notes && <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '6px', lineHeight: 1.5 }}>{conn.notes}</div>}
                              <ConnectionLog connectionId={conn.id} />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
                              <button onClick={() => startEdit(conn)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '5px', display: 'flex', borderRadius: 'var(--r-sm)' }}><Edit2 size={12} /></button>
                              <button onClick={() => remove(conn.id)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '5px', display: 'flex', borderRadius: 'var(--r-sm)' }}><Trash2 size={12} /></button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
