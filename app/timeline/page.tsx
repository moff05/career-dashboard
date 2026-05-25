'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Target, Flag, Star, Calendar, CheckCircle, Circle, Trash2 } from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';

interface TimelineEvent {
  id: number; title: string; description: string | null; date: string;
  type: string; done: number; created_at: string; fromTracker?: boolean;
}

interface TrackerJob {
  id: number; company: string; title: string; status: string;
  deadline: string | null; location: string | null; created_at: string;
}

const TYPE_OPTIONS = [
  { value: 'milestone', label: 'Milestone' }, { value: 'deadline', label: 'Deadline' },
  { value: 'goal', label: 'Goal' }, { value: 'application', label: 'Application' },
];

const TYPE_COLORS: Record<string, string> = {
  milestone: '#6366f1', deadline: '#f87171', goal: '#34d399', application: '#f59e0b',
};

function TypeIcon({ type, size = 16 }: { type: string; size?: number }) {
  const color = TYPE_COLORS[type] || '#628aaa';
  switch (type) {
    case 'milestone': return <Star size={size} color={color} />;
    case 'deadline': return <Flag size={size} color={color} />;
    case 'goal': return <Target size={size} color={color} />;
    default: return <Calendar size={size} color={color} />;
  }
}

const EMPTY_FORM = { title: '', description: '', date: '', type: 'milestone' };

const inputStyle = {
  width: '100%', backgroundColor: '#0e1520', border: '1px solid #263a52',
  borderRadius: '10px', padding: '9px 12px', color: '#eaf2ff',
  fontSize: '13px', outline: 'none', fontFamily: 'inherit',
};

export default function TimelinePage() {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    const [timelineRes, jobsRes] = await Promise.all([fetch('/api/timeline'), fetch('/api/jobs')]);
    const timelineData: TimelineEvent[] = await timelineRes.json();
    const jobsData: TrackerJob[] = await jobsRes.json();
    const jobDeadlines: TimelineEvent[] = jobsData
      .filter(j => j.deadline)
      .map(j => ({
        id: -(j.id), title: `${j.company} — ${j.title}`,
        description: `Application deadline${j.location ? ` · ${j.location}` : ''}`,
        date: j.deadline!, type: 'application',
        done: ['applied', 'interviewing', 'offer'].includes(j.status) ? 1 : 0,
        created_at: j.created_at, fromTracker: true,
      }));
    const merged = [...timelineData, ...jobDeadlines].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    setEvents(merged);
    setLoading(false);
  }, []);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const handleSave = async () => {
    if (!form.title || !form.date) return;
    setSaving(true);
    await fetch('/api/timeline', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    setSaving(false); setShowModal(false); setForm(EMPTY_FORM); fetchEvents();
  };

  const toggleDone = async (event: TimelineEvent) => {
    await fetch(`/api/timeline/${event.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...event, done: event.done ? 0 : 1 }) });
    fetchEvents();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this event?')) return;
    await fetch(`/api/timeline/${id}`, { method: 'DELETE' }); fetchEvents();
  };

  const today = new Date();
  const dates = events.map(e => new Date(e.date));
  const minDate = dates.length > 0 ? new Date(Math.min(...dates.map(d => d.getTime()))) : today;
  const maxDate = dates.length > 0 ? new Date(Math.max(...dates.map(d => d.getTime()))) : today;
  const totalDays = differenceInDays(maxDate, minDate) || 1;
  const progressPct = Math.min(100, Math.max(0, Math.round((differenceInDays(today, minDate) / totalDays) * 100)));
  const doneCount = events.filter(e => e.done).length;

  return (
    <div style={{ padding: '32px 36px', minHeight: '100vh', backgroundColor: '#0e1520' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ color: '#eaf2ff', fontSize: '20px', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>Timeline</h1>
          <p style={{ color: '#507090', fontSize: '12px', margin: '4px 0 0' }}>Milestones, deadlines, and goals</p>
        </div>
        <button onClick={() => setShowModal(true)} style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#000',
          border: 'none', borderRadius: '10px', padding: '9px 18px',
          fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          boxShadow: '0 4px 14px rgba(245,158,11,0.25)',
        }}>
          <Plus size={14} /> Add Event
        </button>
      </div>

      {/* Progress bar */}
      <div style={{ backgroundColor: '#182535', border: '1px solid #263a52', borderRadius: '14px', padding: '16px 20px', marginBottom: '28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
          <span style={{ color: '#628aaa', fontSize: '12px' }}>{format(minDate, 'MMM yyyy')} → {format(maxDate, 'MMM yyyy')}</span>
          <span style={{ color: '#d5e5f5', fontSize: '12px', fontWeight: 600 }}>{progressPct}% · {doneCount}/{events.length} done</span>
        </div>
        <div style={{ backgroundColor: '#0e1520', borderRadius: '10px', height: '7px', overflow: 'hidden' }}>
          <div style={{ background: 'linear-gradient(90deg, #f59e0b, #d97706)', height: '100%', width: `${progressPct}%`, borderRadius: '10px', transition: 'width 0.5s ease' }} />
        </div>
      </div>

      {/* Timeline */}
      {loading ? (
        <div style={{ color: '#507090', textAlign: 'center', padding: '60px', fontSize: '13px' }}>Loading…</div>
      ) : (
        <div style={{ position: 'relative', paddingLeft: '36px' }}>
          <div style={{ position: 'absolute', left: '10px', top: 0, bottom: 0, width: '2px', background: 'linear-gradient(180deg, #263a52, #1e2e42)' }} />

          {events.map((event, idx) => {
            const eventDate = parseISO(event.date);
            const isPast = eventDate < today;
            const isDone = Boolean(event.done);
            const daysUntil = differenceInDays(eventDate, today);
            const dotColor = isDone ? '#34d399' : (isPast ? '#3c5875' : TYPE_COLORS[event.type] || '#f59e0b');

            return (
              <div key={event.id} style={{ position: 'relative', marginBottom: idx < events.length - 1 ? '12px' : 0 }}>
                <div style={{
                  position: 'absolute', left: '-30px', top: '16px',
                  width: '12px', height: '12px', borderRadius: '50%',
                  backgroundColor: dotColor,
                  boxShadow: isDone ? '0 0 8px rgba(52,211,153,0.4)' : (!isPast ? `0 0 8px ${dotColor}40` : 'none'),
                  zIndex: 1,
                }} />

                <div style={{
                  backgroundColor: '#182535', border: '1px solid #263a52', borderRadius: '12px',
                  padding: '14px 16px', opacity: isDone ? 0.5 : 1, transition: 'opacity 0.2s',
                }}
                  onMouseEnter={e => !isDone && (e.currentTarget.style.borderColor = '#3c5875')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = '#263a52')}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                      <TypeIcon type={event.type} size={14} />
                      <div>
                        <div style={{ color: isDone ? '#628aaa' : '#d5e5f5', fontWeight: 600, fontSize: '13px', textDecoration: isDone ? 'line-through' : 'none' }}>
                          {event.title}
                        </div>
                        {event.description && (
                          <div style={{ color: '#507090', fontSize: '11px', marginTop: '2px' }}>{event.description}</div>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ color: '#628aaa', fontSize: '11px' }}>{format(eventDate, 'MMM d, yyyy')}</div>
                        <div style={{ fontSize: '10px', color: isPast ? '#3c5875' : (daysUntil <= 14 ? '#f59e0b' : '#507090'), marginTop: '2px' }}>
                          {isPast ? `${Math.abs(daysUntil)}d ago` : `in ${daysUntil}d`}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        {event.fromTracker ? (
                          <span style={{ color: '#3c5875', fontSize: '10px', fontWeight: 500 }}>from tracker</span>
                        ) : (
                          <>
                            <button onClick={() => toggleDone(event)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: isDone ? '#34d399' : '#507090', padding: '3px' }}
                              onMouseEnter={e => !isDone && (e.currentTarget.style.color = '#8eb0cc')}
                              onMouseLeave={e => !isDone && (e.currentTarget.style.color = '#507090')}
                              title={isDone ? 'Mark undone' : 'Mark done'}>
                              {isDone ? <CheckCircle size={15} /> : <Circle size={15} />}
                            </button>
                            <button onClick={() => handleDelete(event.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3c5875', padding: '3px' }}
                              onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
                              onMouseLeave={e => (e.currentTarget.style.color = '#3c5875')}>
                              <Trash2 size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div style={{ backgroundColor: '#182535', border: '1px solid #263a52', borderRadius: '18px', padding: '28px', width: '440px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <h2 style={{ color: '#eaf2ff', fontSize: '16px', fontWeight: 700, margin: '0 0 20px' }}>Add Timeline Event</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', color: '#628aaa', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '5px' }}>Title *</label>
                <input type="text" value={form.title} onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', color: '#628aaa', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '5px' }}>Description</label>
                <input type="text" value={form.description} onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))} style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', color: '#628aaa', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '5px' }}>Date *</label>
                  <input type="date" value={form.date} onChange={e => setForm(prev => ({ ...prev, date: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', color: '#628aaa', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '5px' }}>Type *</label>
                  <select value={form.type} onChange={e => setForm(prev => ({ ...prev, type: e.target.value }))} style={inputStyle}>
                    {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button onClick={() => setShowModal(false)} style={{ backgroundColor: '#1d2d42', color: '#8eb0cc', border: '1px solid #263a52', borderRadius: '10px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.title || !form.date} style={{
                background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#000', border: 'none',
                borderRadius: '10px', padding: '8px 20px', fontSize: '13px', fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, fontFamily: 'inherit',
              }}>{saving ? 'Saving…' : 'Add Event'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
