'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, Check, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface Memory {
  id: number;
  content: string;
  category: string;
  source: string | null;
  created_at: string;
}

const CATEGORIES = ['all', 'preference', 'goal', 'insight', 'company', 'role', 'location', 'skill', 'other'];

const CATEGORY_COLORS: Record<string, string> = {
  preference: '#3b82f6',
  goal: '#22c55e',
  insight: '#a78bfa',
  company: '#f59e0b',
  role: '#d97706',
  location: '#06b6d4',
  skill: '#10b981',
  other: '#888',
};

export default function MemoryPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState('insight');
  const [addingNew, setAddingNew] = useState(false);

  const fetchMemories = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/memories');
    const data = await res.json();
    setMemories(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchMemories();
  }, [fetchMemories]);

  const startEdit = (memory: Memory) => {
    setEditingId(memory.id);
    setEditContent(memory.content);
    setEditCategory(memory.category);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    await fetch(`/api/memories/${editingId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: editContent, category: editCategory }),
    });
    setEditingId(null);
    fetchMemories();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this memory?')) return;
    await fetch(`/api/memories/${id}`, { method: 'DELETE' });
    fetchMemories();
  };

  const handleAdd = async () => {
    if (!newContent.trim()) return;
    await fetch('/api/memories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: newContent.trim(), category: newCategory, source: 'manual' }),
    });
    setNewContent('');
    setNewCategory('insight');
    setAddingNew(false);
    fetchMemories();
  };

  const filtered = filter === 'all' ? memories : memories.filter(m => m.category === filter);

  return (
    <div style={{ padding: '32px', minHeight: '100vh', backgroundColor: '#1a1a1a' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ color: '#e8e8e8', fontSize: '20px', fontWeight: 600, margin: 0 }}>Memory Panel</h1>
          <p style={{ color: '#888', fontSize: '13px', margin: '4px 0 0' }}>
            {memories.length} memories saved — used by your AI career coach
          </p>
        </div>
        <button
          onClick={() => setAddingNew(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: '#d97706',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            padding: '8px 16px',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          <Plus size={14} /> Add Memory
        </button>
      </div>

      {/* Add new memory form */}
      {addingNew && (
        <div style={{
          backgroundColor: '#242424',
          border: '1px solid #d97706',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '20px',
        }}>
          <h3 style={{ color: '#e8e8e8', fontSize: '13px', fontWeight: 600, margin: '0 0 12px' }}>New Memory</h3>
          <textarea
            value={newContent}
            onChange={e => setNewContent(e.target.value)}
            placeholder="What should your career coach remember about you?"
            rows={3}
            autoFocus
            style={{
              width: '100%',
              backgroundColor: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: '6px',
              padding: '10px 12px',
              color: '#e8e8e8',
              fontSize: '13px',
              outline: 'none',
              resize: 'vertical',
              fontFamily: 'inherit',
              marginBottom: '10px',
            }}
          />
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <select
              value={newCategory}
              onChange={e => setNewCategory(e.target.value)}
              style={{
                backgroundColor: '#1a1a1a',
                border: '1px solid #333',
                borderRadius: '6px',
                padding: '8px 10px',
                color: '#e8e8e8',
                fontSize: '13px',
                outline: 'none',
              }}
            >
              {CATEGORIES.filter(c => c !== 'all').map(c => (
                <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
              ))}
            </select>
            <button
              onClick={handleAdd}
              style={{
                backgroundColor: '#d97706',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Save
            </button>
            <button
              onClick={() => { setAddingNew(false); setNewContent(''); }}
              style={{
                backgroundColor: '#333',
                color: '#888',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 16px',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            style={{
              padding: '4px 12px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: 500,
              border: 'none',
              cursor: 'pointer',
              backgroundColor: filter === cat ? (cat === 'all' ? '#d97706' : CATEGORY_COLORS[cat]) : '#2a2a2a',
              color: filter === cat ? '#fff' : '#888',
              transition: 'all 0.15s',
            }}
          >
            {cat.charAt(0).toUpperCase() + cat.slice(1)}
            {cat !== 'all' && (
              <span style={{ marginLeft: '4px', opacity: 0.7 }}>
                ({memories.filter(m => m.category === cat).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Memory list */}
      {loading ? (
        <div style={{ color: '#888', textAlign: 'center', padding: '60px' }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: '#888', textAlign: 'center', padding: '60px' }}>
          {filter === 'all' ? 'No memories yet. Have a conversation with your coach to start building memory.' : `No ${filter} memories yet.`}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filtered.map(memory => (
            <div
              key={memory.id}
              style={{
                backgroundColor: '#242424',
                border: '1px solid #333',
                borderRadius: '8px',
                padding: '14px 16px',
              }}
            >
              {editingId === memory.id ? (
                <div>
                  <textarea
                    value={editContent}
                    onChange={e => setEditContent(e.target.value)}
                    rows={3}
                    autoFocus
                    style={{
                      width: '100%',
                      backgroundColor: '#1a1a1a',
                      border: '1px solid #d97706',
                      borderRadius: '6px',
                      padding: '8px 10px',
                      color: '#e8e8e8',
                      fontSize: '13px',
                      outline: 'none',
                      resize: 'vertical',
                      fontFamily: 'inherit',
                      marginBottom: '10px',
                    }}
                  />
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <select
                      value={editCategory}
                      onChange={e => setEditCategory(e.target.value)}
                      style={{
                        backgroundColor: '#1a1a1a',
                        border: '1px solid #333',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        color: '#e8e8e8',
                        fontSize: '12px',
                        outline: 'none',
                      }}
                    >
                      {CATEGORIES.filter(c => c !== 'all').map(c => (
                        <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                      ))}
                    </select>
                    <button
                      onClick={saveEdit}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#22c55e', padding: '2px' }}
                    >
                      <Check size={16} />
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '2px' }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ color: '#e8e8e8', fontSize: '13px', margin: '0 0 8px', lineHeight: '1.5' }}>
                      {memory.content}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{
                        backgroundColor: (CATEGORY_COLORS[memory.category] || '#888') + '22',
                        color: CATEGORY_COLORS[memory.category] || '#888',
                        borderRadius: '4px',
                        padding: '2px 8px',
                        fontSize: '11px',
                        fontWeight: 500,
                        textTransform: 'capitalize',
                      }}>
                        {memory.category}
                      </span>
                      <span style={{ color: '#555', fontSize: '11px' }}>
                        {format(parseISO(memory.created_at), 'MMM d, yyyy')}
                      </span>
                      {memory.source && (
                        <span style={{ color: '#555', fontSize: '11px' }}>
                          · {memory.source}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                    <button
                      onClick={() => startEdit(memory)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555', padding: '2px' }}
                    >
                      <Edit2 size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(memory.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555', padding: '2px' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
