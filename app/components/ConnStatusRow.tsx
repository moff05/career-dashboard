'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Trash2 } from 'lucide-react';
import { type Connection, CONN_STATUS, CONN_CYCLE } from '@/app/components/ConnectionsPanel';

export function ConnStatusRow({ conn, cs, onSet, onDelete }: {
  conn: Connection;
  cs: { label: string; color: string; bg: string };
  onSet: (status: string) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (dropRef.current && !dropRef.current.contains(e.target as Node) && e.target !== btnRef.current) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  function handleOpen(e: React.MouseEvent) {
    e.stopPropagation();
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left });
    }
    setOpen(o => !o);
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'var(--bg)', borderRadius: 'var(--r)', padding: '7px 10px' }}>
      <div style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: cs.color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: 'var(--text)', fontSize: '12px', fontWeight: 600 }}>{conn.name}{conn.role ? ` — ${conn.role}` : ''}</div>
        {conn.relationship && <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{conn.relationship}</div>}
      </div>
      <button ref={btnRef} onClick={handleOpen} style={{ backgroundColor: cs.bg, color: cs.color, border: 'none', borderRadius: '20px', padding: '3px 9px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, whiteSpace: 'nowrap' }}>
        {cs.label}
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <div ref={dropRef} style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 600, backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflow: 'hidden', minWidth: '140px' }}>
          {CONN_CYCLE.map(st => {
            const s = CONN_STATUS[st];
            return (
              <div key={st} onClick={e => { e.stopPropagation(); onSet(st); setOpen(false); }} style={{ padding: '8px 14px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', color: s.color, backgroundColor: conn.status === st ? 'var(--border)' : 'transparent' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--border)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = conn.status === st ? 'var(--border)' : 'transparent')}>
                {s.label}
              </div>
            );
          })}
        </div>,
        document.body
      )}
      <button onClick={e => { e.stopPropagation(); onDelete(); }} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '2px', display: 'flex', flexShrink: 0 }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-dim)')}>
        <Trash2 size={11} />
      </button>
    </div>
  );
}
