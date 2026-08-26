'use client';

import { Trash2 } from 'lucide-react';
import { type Connection, CONN_STATUS, CONN_CYCLE } from '@/app/components/ConnectionsPanel';
import { StatusDropdown } from '@/app/components/StatusDropdown';

export function ConnStatusRow({ conn, cs, onSet, onDelete }: {
  conn: Connection;
  cs: { label: string; color: string; bg: string };
  onSet: (status: string) => void;
  onDelete: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'var(--bg)', borderRadius: 'var(--r)', padding: '7px 10px' }}>
      <div style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: cs.color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: 'var(--text)', fontSize: '12px', fontWeight: 600 }}>{conn.name}{conn.role ? ` — ${conn.role}` : ''}</div>
        {conn.relationship && <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{conn.relationship}</div>}
      </div>
      <StatusDropdown value={conn.status} options={CONN_STATUS} order={CONN_CYCLE} onChange={onSet} />
      <button onClick={e => { e.stopPropagation(); onDelete(); }} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '2px', display: 'flex', flexShrink: 0 }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-dim)')}>
        <Trash2 size={11} />
      </button>
    </div>
  );
}
