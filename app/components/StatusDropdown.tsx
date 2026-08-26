'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface StatusOption { label: string; color: string; bg: string }

// Click-to-open floating menu of every status, rather than a click-to-cycle
// badge — jumping straight to any status beats clicking N times past the
// ones you don't want. Originally built once for the in-job Network view
// (ConnStatusRow); generalized here so Companies/Connections panels use the
// exact same pattern instead of three near-duplicate implementations.
export function StatusDropdown({ value, options, order, onChange }: {
  value: string;
  options: Record<string, StatusOption>;
  order: string[];
  onChange: (status: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node) && e.target !== btnRef.current) setOpen(false);
    };
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

  const cs = options[value] || options[order[0]];

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleOpen}
        style={{ backgroundColor: cs.bg, color: cs.color, border: 'none', borderRadius: '20px', padding: '2px 9px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', lineHeight: '16px', whiteSpace: 'nowrap' }}
      >
        {cs.label}
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <div ref={dropRef} style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 600, backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflow: 'hidden', minWidth: '150px' }}>
          {order.map(st => {
            const s = options[st];
            return (
              <div
                key={st}
                onClick={e => { e.stopPropagation(); onChange(st); setOpen(false); }}
                style={{ padding: '8px 14px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', color: s.color, backgroundColor: value === st ? 'var(--border)' : 'transparent' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--border)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = value === st ? 'var(--border)' : 'transparent')}
              >
                {s.label}
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}
