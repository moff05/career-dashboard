'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/apiFetch';
import { Trash2, Plus, Brain } from 'lucide-react';

interface Memory {
  id: number; content: string; category: string; source: string; created_at: string;
}

const CATEGORIES = ['preference', 'goal', 'insight', 'company', 'role', 'location', 'skill', 'other'];

const CAT_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  preference: { bg: 'rgba(99,102,241,0.07)',  color: '#6366f1', border: 'rgba(99,102,241,0.2)'  },
  goal:       { bg: 'rgba(16,185,129,0.07)',  color: '#10b981', border: 'rgba(16,185,129,0.2)'  },
  insight:    { bg: 'rgba(245,158,11,0.07)',  color: '#f59e0b', border: 'rgba(245,158,11,0.2)'  },
  company:    { bg: 'rgba(59,130,246,0.07)',  color: '#3b82f6', border: 'rgba(59,130,246,0.2)'  },
  role:       { bg: 'rgba(139,92,246,0.07)',  color: '#8b5cf6', border: 'rgba(139,92,246,0.2)'  },
  location:   { bg: 'rgba(20,184,166,0.07)',  color: '#14b8a6', border: 'rgba(20,184,166,0.2)'  },
  skill:      { bg: 'rgba(236,72,153,0.07)',  color: '#ec4899', border: 'rgba(236,72,153,0.2)'  },
  other:      { bg: 'rgba(100,116,139,0.07)', color: 'rgba(158,202,242,0.72)', border: 'rgba(100,116,139,0.2)' },
};

function timeAgo(ts: string) {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function MemoryPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [addForm, setAddForm] = useState<{ show: boolean; content: string; category: string }>({ show: false, content: '', category: 'insight' });
  const [saving, setSaving] = useState(false);

  const fetchMemories = async () => {
    const data = await apiFetch('/api/memories').then(r => r.json()).catch(() => []);
    setMemories(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => { fetchMemories(); }, []);

  const deleteMemory = async (id: number) => {
    await apiFetch(`/api/memories/${id}`, { method: 'DELETE' });
    setMemories(prev => prev.filter(m => m.id !== id));
  };

  const addMemory = async () => {
    if (!addForm.content.trim()) return;
    setSaving(true);
    await apiFetch('/api/memories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: addForm.content.trim(), category: addForm.category, source: 'manual' }),
    });
    setSaving(false);
    setAddForm({ show: false, content: '', category: 'insight' });
    fetchMemories();
  };

  const visible = filter === 'all' ? memories : memories.filter(m => m.category === filter);
  const counts: Record<string, number> = {};
  for (const m of memories) counts[m.category] = (counts[m.category] || 0) + 1;

  return (
    <div style={{ padding: '32px 36px', minHeight: '100vh', background: 'transparent' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <Brain size={18} color="#6366f1" />
            <h1 style={{ color: 'rgba(232,244,255,0.95)', fontSize: '20px', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>Memory</h1>
          </div>
          <p style={{ color: 'rgba(135,185,230,0.65)', fontSize: '12px', margin: 0 }}>
            Facts the AI has learned about you — extracted from Coach conversations and added manually.
            {memories.length > 0 && ` ${memories.length} saved.`}
          </p>
        </div>
        <button
          onClick={() => setAddForm(f => ({ ...f, show: !f.show }))}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            background: addForm.show ? 'rgba(125,220,255,0.06)' : 'linear-gradient(135deg, #6366f1, #4f46e5)',
            color: addForm.show ? '#64748b' : '#fff',
            border: addForm.show ? '1px solid rgba(125,220,255,0.13)' : 'none',
            borderRadius: '10px', padding: '8px 16px', fontSize: '12px', fontWeight: 700,
            cursor: 'pointer',
            boxShadow: addForm.show ? 'none' : '0 4px 14px rgba(99,102,241,0.25)',
          }}
        >
          <Plus size={13} /> Add Memory
        </button>
      </div>

      {/* Add form */}
      {addForm.show && (
        <div style={{
          background: 'rgba(125,220,255,0.055)', backdropFilter: 'blur(20px)', border: '1px solid rgba(125,220,255,0.13)', borderRadius: '14px',
          padding: '18px', marginBottom: '20px',
          animation: 'fadeIn 0.2s ease',
        }}>
          <textarea
            autoFocus
            placeholder="What should the AI remember about you?"
            value={addForm.content}
            onChange={e => setAddForm(f => ({ ...f, content: e.target.value }))}
            rows={3}
            style={{
              width: '100%', background: 'rgba(125,220,255,0.025)', border: '1px solid rgba(125,220,255,0.13)',
              borderRadius: '10px', padding: '10px 12px', color: 'rgba(232,244,255,0.95)', fontSize: '13px',
              outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box',
              marginBottom: '12px',
            }}
            onFocus={e => (e.target.style.borderColor = '#6366f1')}
            onBlur={e => (e.target.style.borderColor = 'rgba(125,220,255,0.13)')}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <select
              value={addForm.category}
              onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))}
              style={{
                background: 'rgba(125,220,255,0.025)', border: '1px solid rgba(125,220,255,0.13)', borderRadius: '8px',
                padding: '6px 10px', color: 'rgba(200,228,255,0.85)', fontSize: '12px', outline: 'none',
                fontFamily: 'inherit', cursor: 'pointer',
              }}
            >
              {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
            </select>
            <button
              onClick={addMemory}
              disabled={!addForm.content.trim() || saving}
              style={{
                background: addForm.content.trim() ? 'linear-gradient(135deg, #6366f1, #4f46e5)' : 'rgba(125,220,255,0.06)',
                color: addForm.content.trim() ? '#fff' : '#94a3b8',
                border: 'none', borderRadius: '8px', padding: '7px 18px',
                fontSize: '12px', fontWeight: 700, cursor: addForm.content.trim() ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit',
              }}
            >{saving ? 'Saving…' : 'Save'}</button>
            <button
              onClick={() => setAddForm({ show: false, content: '', category: 'insight' })}
              style={{ background: 'none', border: 'none', color: 'rgba(135,185,230,0.65)', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', padding: '7px 10px' }}
            >Cancel</button>
          </div>
        </div>
      )}

      {/* Category filter pills */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <button
          onClick={() => setFilter('all')}
          style={{
            background: filter === 'all' ? 'rgba(125,220,255,0.14)' : 'rgba(125,220,255,0.04)',
            color: filter === 'all' ? '#fff' : '#64748b',
            border: `1px solid ${filter === 'all' ? 'rgba(232,244,255,0.95)' : 'rgba(125,220,255,0.13)'}`,
            borderRadius: '20px', padding: '4px 12px', fontSize: '11px', fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >All <span style={{ opacity: 0.6 }}>{memories.length}</span></button>
        {CATEGORIES.filter(c => counts[c] > 0).map(c => {
          const cc = CAT_COLORS[c];
          return (
            <button
              key={c}
              onClick={() => setFilter(c)}
              style={{
                background: filter === c ? cc.bg : 'rgba(125,220,255,0.04)',
                color: filter === c ? cc.color : '#64748b',
                border: `1px solid ${filter === c ? cc.border : 'rgba(125,220,255,0.13)'}`,
                borderRadius: '20px', padding: '4px 12px', fontSize: '11px', fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize',
              }}
            >{c} <span style={{ opacity: 0.6 }}>{counts[c]}</span></button>
          );
        })}
      </div>

      {/* Memory list */}
      {loading ? (
        <div style={{ color: 'rgba(135,185,230,0.65)', fontSize: '13px', padding: '40px 0' }}>Loading…</div>
      ) : visible.length === 0 ? (
        <div style={{ background: 'rgba(125,220,255,0.055)', backdropFilter: 'blur(20px)', border: '1px solid rgba(125,220,255,0.13)', borderRadius: '14px', padding: '48px 24px', textAlign: 'center' }}>
          <Brain size={24} color="rgba(125,220,255,0.13)" style={{ margin: '0 auto 12px', display: 'block' }} />
          <div style={{ color: 'rgba(135,185,230,0.65)', fontSize: '13px', marginBottom: '6px' }}>No memories yet.</div>
          <div style={{ color: 'rgba(125,175,230,0.35)', fontSize: '12px' }}>Chat with the Coach — memories are extracted automatically from your conversations.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {visible.map(m => {
            const cc = CAT_COLORS[m.category] || CAT_COLORS.other;
            return (
              <div key={m.id} style={{
                background: 'rgba(125,220,255,0.055)', backdropFilter: 'blur(20px)', border: '1px solid rgba(125,220,255,0.13)', borderRadius: '12px',
                padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: '12px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                transition: 'border-color 0.15s',
              }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(125,175,230,0.35)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(125,220,255,0.13)')}
              >
                <span style={{
                  flexShrink: 0, fontSize: '10px', fontWeight: 700, padding: '3px 8px',
                  borderRadius: '20px', textTransform: 'capitalize', marginTop: '1px',
                  backgroundColor: cc.bg, color: cc.color, border: `1px solid ${cc.border}`,
                }}>{m.category}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: 'rgba(200,228,255,0.85)', fontSize: '13px', lineHeight: 1.55 }}>{m.content}</div>
                  <div style={{ color: 'rgba(125,175,230,0.35)', fontSize: '10px', marginTop: '5px' }}>
                    {m.source === 'manual' ? 'Added manually' : `From ${m.source}`} · {timeAgo(m.created_at)}
                  </div>
                </div>
                <button
                  onClick={() => deleteMemory(m.id)}
                  style={{ background: 'none', border: 'none', color: 'rgba(125,220,255,0.13)', cursor: 'pointer', padding: '2px', flexShrink: 0, display: 'flex' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'rgba(125,220,255,0.13)')}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
