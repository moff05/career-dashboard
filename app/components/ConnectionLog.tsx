'use client';

import { useState } from 'react';
import { Trash2, Bell } from 'lucide-react';
import { apiFetch } from '@/lib/apiFetch';

interface LogEntry { id: number; entry_date: string; note: string; follow_up_date?: string | null; follow_up_done?: number | null }

const linkBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer',
  fontSize: '11px', fontWeight: 600, padding: 0, fontFamily: 'inherit',
};

function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function offsetISO(days: number): string {
  const d = new Date(); d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// A running, dated history of interactions ("talked 8/26 re: comp, timeline")
// rather than the single `notes` field a new update would otherwise
// overwrite. Adding an entry never requires loading history first — history
// is fetched lazily, only if you actually click to view it.
export function ConnectionLog({ connectionId }: { connectionId: number }) {
  const [showAdd, setShowAdd] = useState(false);
  const [date, setDate] = useState(todayISO);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [remind, setRemind] = useState(false);
  const [remindDate, setRemindDate] = useState(() => offsetISO(7));
  const [entries, setEntries] = useState<LogEntry[] | null>(null);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  async function loadHistory() {
    setLoadingEntries(true);
    const data = await apiFetch(`/api/connections/${connectionId}/notes`).then(r => r.json()).catch(() => []);
    setEntries(Array.isArray(data) ? data : []);
    setLoadingEntries(false);
  }

  function toggleHistory() {
    if (!showHistory && entries === null) loadHistory();
    setShowHistory(s => !s);
  }

  async function addEntry() {
    const note = text.trim();
    if (!note) return;
    setSaving(true);
    const created = await apiFetch(`/api/connections/${connectionId}/notes`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entry_date: date, note, follow_up_date: remind ? remindDate : null }),
    }).then(r => r.json());
    setEntries(prev => (prev ? [created, ...prev] : [created]));
    setShowHistory(true);
    setText('');
    setDate(todayISO());
    setRemind(false);
    setRemindDate(offsetISO(7));
    setSaving(false);
    setShowAdd(false);
  }

  // Flag/unflag an existing entry as needing follow-up (due today when flagged).
  async function toggleFollowUp(e: LogEntry) {
    const open = !!e.follow_up_date && !e.follow_up_done;
    const body = open ? { follow_up_done: true } : { follow_up_date: todayISO() };
    const updated = await apiFetch(`/api/connections/${connectionId}/notes/${e.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).then(r => r.json()).catch(() => null);
    if (updated?.id) setEntries(prev => (prev ? prev.map(x => (x.id === e.id ? updated : x)) : prev));
  }

  async function removeEntry(noteId: number) {
    setEntries(prev => (prev ? prev.filter(e => e.id !== noteId) : prev));
    await apiFetch(`/api/connections/${connectionId}/notes/${noteId}`, { method: 'DELETE' });
  }

  return (
    <div style={{ marginTop: '8px' }}>
      <div style={{ display: 'flex', gap: '14px' }}>
        <button onClick={() => setShowAdd(s => !s)} style={linkBtn}>+ Log an update</button>
        <button onClick={toggleHistory} style={linkBtn}>{showHistory ? 'Hide log' : 'View log'}</button>
      </div>

      {showAdd && (
        <div style={{ marginTop: '6px' }}>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="field-input" style={{ width: '132px', fontSize: '11px' }} />
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="What did you talk about?"
            className="field-input"
            style={{ flex: 1, fontSize: '11px' }}
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') addEntry(); }}
          />
          <button onClick={addEntry} disabled={!text.trim() || saving} className="btn-primary" style={{ padding: '5px 10px', fontSize: '11px', flexShrink: 0 }}>
            {saving ? '…' : 'Add'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
            <input type="checkbox" checked={remind} onChange={e => setRemind(e.target.checked)} /> Remind me to follow up
          </label>
          {remind && <input type="date" value={remindDate} onChange={e => setRemindDate(e.target.value)} className="field-input" style={{ width: '132px', fontSize: '11px' }} />}
        </div>
        </div>
      )}

      {showHistory && (
        loadingEntries ? (
          <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '6px' }}>Loading…</div>
        ) : entries && entries.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '8px' }}>
            {entries.map(e => (
              <div key={e.id} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '11px' }}>
                <span style={{ color: 'var(--text-dim)', flexShrink: 0, fontWeight: 600, minWidth: '42px' }}>{formatShortDate(e.entry_date)}</span>
                <span style={{ color: 'var(--text-muted)', flex: 1, lineHeight: 1.5 }}>{e.note}</span>
                <button onClick={() => toggleFollowUp(e)} title={e.follow_up_date && !e.follow_up_done ? 'Following up: click to clear' : 'Flag for follow-up'} aria-label="Toggle follow-up" style={{ background: 'none', border: 'none', color: e.follow_up_date && !e.follow_up_done ? 'var(--accent)' : 'var(--text-dim)', cursor: 'pointer', padding: '2px', flexShrink: 0, display: 'flex' }}>
                  <Bell size={10} />
                </button>
                <button onClick={() => removeEntry(e.id)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '2px', flexShrink: 0, display: 'flex' }}>
                  <Trash2 size={10} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '6px', fontStyle: 'italic' }}>No entries yet.</div>
        )
      )}
    </div>
  );
}
