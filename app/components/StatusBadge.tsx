'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { type Job, STATUS_STYLE, STATUS_OPTIONS } from '@/app/lib/jobUtils';

export function StatusBadge({ job, onStatusChange }: { job: Job; onStatusChange: (id: number, status: string) => void }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const badgeRef = useRef<HTMLSpanElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (dropRef.current && !dropRef.current.contains(e.target as Node) && e.target !== badgeRef.current) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  const s = STATUS_STYLE[job.status] || STATUS_STYLE.saved;
  function handleOpen(e: React.MouseEvent) {
    e.stopPropagation();
    if (badgeRef.current) {
      const r = badgeRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left });
    }
    setOpen(o => !o);
  }
  return (
    <div style={{ display: 'inline-block' }}>
      <span ref={badgeRef} onClick={handleOpen} style={{
        backgroundColor: s.bg, color: s.text, border: `1px solid ${s.border}`,
        borderRadius: 'var(--r-sm)', padding: '3px 8px', fontSize: '11px', fontWeight: 700,
        textTransform: 'capitalize', cursor: 'pointer', userSelect: 'none', display: 'inline-block',
        letterSpacing: '0.02em',
      }}>{job.status}</span>
      {open && typeof document !== 'undefined' && createPortal(
        <div ref={dropRef} style={{
          position: 'fixed', top: pos.top, left: pos.left, zIndex: 600,
          backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)',
          overflow: 'hidden', minWidth: '120px',
        }}>
          {STATUS_OPTIONS.map(st => {
            const ss = STATUS_STYLE[st] || STATUS_STYLE.saved;
            return (
              <div key={st} onClick={e => { e.stopPropagation(); onStatusChange(job.id, st); setOpen(false); }} style={{
                padding: '8px 14px', fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                color: ss.text, textTransform: 'capitalize',
                backgroundColor: job.status === st ? 'var(--border)' : 'transparent',
              }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--border)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = job.status === st ? 'var(--border)' : 'transparent')}
              >{st}</div>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}
