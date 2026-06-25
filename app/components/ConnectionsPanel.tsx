'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/apiFetch';
import { X, Plus, Trash2, Edit2, ExternalLink } from 'lucide-react';
import { useOverlays } from '@/app/OverlayContext';

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
  warm:            { label: 'Warm',             color: '#7c3aed', bg: 'rgba(124,58,237,0.08)' },
};
export const CONN_CYCLE = ['not_reached_out', 'reached_out', 'responded', 'warm'];

const EMPTY_FORM = { name: '', company: '', email: '', role: '', linkedin: '', relationship: '', notes: '' };
type FormData = typeof EMPTY_FORM;

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '16px' };
const label: React.CSSProperties = { display: 'block', color: 'var(--text-muted)', fontSize: '11px', fontWeight: 500, marginBottom: '5px' };

function ConnectionForm({ form, setForm, onSave, onCancel, saving }: {
  form: FormData; setForm: React.Dispatch<React.SetStateAction<FormData>>;
  onSave: () => void; onCancel: () => void; saving: boolean;
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
          <input value={form.company} onChange={e => setForm(p => ({ ...p, company: e.target.value }))} className="field-input" style={{ width: '100%' }} />
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
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<FormData>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  async function fetchAll() {
    const data = await apiFetch('/api/connections').then(r => r.json()).catch(() => []);
    setConnections(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  const loaded = useState(() => ({ done: false }))[0];
  useEffect(() => {
    if (!connectionsOpen) return;
    if (!loaded.done) { loaded.done = true; fetchAll(); }
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

  async function cycleStatus(conn: Connection) {
    const next = CONN_CYCLE[(CONN_CYCLE.indexOf(conn.status) + 1) % CONN_CYCLE.length];
    setConnections(prev => prev.map(c => c.id === conn.id ? { ...c, status: next } : c));
    await apiFetch(`/api/connections/${conn.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next }) });
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
          <h1 style={{ color: 'var(--text)', fontSize: '15px', fontWeight: 700, margin: 0 }}>Connections</h1>
          <button onClick={closeConnections} aria-label="Close" style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--r)', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={14} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '14px' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: 0, maxWidth: '420px' }}>
              People you know at companies you're targeting — recruiters, alumni, anyone worth following up with. Not tied to a tracked job.
            </p>
            {!showAddForm && (
              <button onClick={() => { setAddForm(EMPTY_FORM); setShowAddForm(true); }} className="btn-primary" style={{ fontSize: '12px', padding: '7px 14px', flexShrink: 0 }}>
                <Plus size={13} /> Add
              </button>
            )}
          </div>

          {showAddForm && (
            <ConnectionForm form={addForm} setForm={setAddForm} onSave={saveAdd} onCancel={() => setShowAddForm(false)} saving={saving} />
          )}

          {loading ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '30px 0' }}>Loading…</div>
          ) : companies.length === 0 ? (
            <div style={{ ...card, padding: '40px 24px', textAlign: 'center' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '6px' }}>No connections yet.</div>
              <div style={{ color: 'var(--text-dim)', fontSize: '12px' }}>Add anyone you know at a company you're targeting — you don't need a tracked job there first.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {companies.map(company => (
                <div key={company}>
                  <div className="section-label" style={{ marginBottom: '8px' }}>{company}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {grouped[company].map(conn => {
                      const cs = CONN_STATUS[conn.status] || CONN_STATUS.not_reached_out;
                      if (editingId === conn.id) {
                        return <ConnectionForm key={conn.id} form={editForm} setForm={setEditForm} onSave={saveEdit} onCancel={() => setEditingId(null)} saving={saving} />;
                      }
                      return (
                        <div key={conn.id} style={card}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
                                <span style={{ color: 'var(--text)', fontSize: '13px', fontWeight: 700 }}>{conn.name}</span>
                                {conn.role && <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{conn.role}</span>}
                              </div>
                              {conn.relationship && <div style={{ color: 'var(--text-dim)', fontSize: '11px', marginTop: '2px' }}>{conn.relationship}</div>}
                              <div style={{ display: 'flex', gap: '12px', marginTop: '6px', flexWrap: 'wrap' }}>
                                {conn.email && <a href={`mailto:${conn.email}`} style={{ color: 'var(--text-muted)', fontSize: '11px', textDecoration: 'none' }}>{conn.email}</a>}
                                {conn.linkedin && (
                                  <a href={conn.linkedin.startsWith('http') ? conn.linkedin : `https://${conn.linkedin}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-muted)', fontSize: '11px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                    LinkedIn <ExternalLink size={10} />
                                  </a>
                                )}
                              </div>
                              {conn.notes && <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '6px', lineHeight: 1.5 }}>{conn.notes}</div>}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                              <button onClick={() => startEdit(conn)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '4px', display: 'flex' }}><Edit2 size={12} /></button>
                              <button onClick={() => remove(conn.id)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '4px', display: 'flex' }}><Trash2 size={12} /></button>
                            </div>
                          </div>
                          <button onClick={() => cycleStatus(conn)} style={{ marginTop: '10px', backgroundColor: cs.bg, color: cs.color, border: 'none', borderRadius: '20px', padding: '3px 10px', fontSize: '10px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }} title="Click to update status">
                            {cs.label}
                          </button>
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
