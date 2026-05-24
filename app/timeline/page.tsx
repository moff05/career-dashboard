'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Target, Flag, Star, Calendar, CheckCircle, Circle, Trash2 } from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';

interface TimelineEvent {
  id: number;
  title: string;
  description: string | null;
  date: string;
  type: string;
  done: number;
  created_at: string;
  fromTracker?: boolean;
}

interface TrackerJob {
  id: number;
  company: string;
  title: string;
  status: string;
  deadline: string | null;
  location: string | null;
  created_at: string;
}

const TYPE_OPTIONS = [
  { value: 'milestone', label: 'Milestone' },
  { value: 'deadline', label: 'Deadline' },
  { value: 'goal', label: 'Goal' },
  { value: 'application', label: 'Application' },
];

const TYPE_COLORS: Record<string, string> = {
  milestone: '#3b82f6',
  deadline: '#ef4444',
  goal: '#22c55e',
  application: '#d97706',
};

function TypeIcon({ type, size = 16 }: { type: string; size?: number }) {
  const color = TYPE_COLORS[type] || '#888';
  switch (type) {
    case 'milestone': return <Star size={size} color={color} />;
    case 'deadline': return <Flag size={size} color={color} />;
    case 'goal': return <Target size={size} color={color} />;
    case 'application': return <Calendar size={size} color={color} />;
    default: return <Calendar size={size} color={color} />;
  }
}

const EMPTY_FORM = { title: '', description: '', date: '', type: 'milestone' };

export default function TimelinePage() {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    const [timelineRes, jobsRes] = await Promise.all([
      fetch('/api/timeline'),
      fetch('/api/jobs'),
    ]);
    const timelineData: TimelineEvent[] = await timelineRes.json();
    const jobsData: TrackerJob[] = await jobsRes.json();

    const jobDeadlines: TimelineEvent[] = jobsData
      .filter(j => j.deadline)
      .map(j => ({
        id: -(j.id),
        title: `${j.company} — ${j.title}`,
        description: `Application deadline${j.location ? ` · ${j.location}` : ''}`,
        date: j.deadline!,
        type: 'application',
        done: ['applied', 'interviewing', 'offer'].includes(j.status) ? 1 : 0,
        created_at: j.created_at,
        fromTracker: true,
      }));

    const merged = [...timelineData, ...jobDeadlines].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    setEvents(merged);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleSave = async () => {
    if (!form.title || !form.date) return;
    setSaving(true);
    await fetch('/api/timeline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setShowModal(false);
    setForm(EMPTY_FORM);
    fetchEvents();
  };

  const toggleDone = async (event: TimelineEvent) => {
    await fetch(`/api/timeline/${event.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...event, done: event.done ? 0 : 1 }),
    });
    fetchEvents();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this event?')) return;
    await fetch(`/api/timeline/${id}`, { method: 'DELETE' });
    fetchEvents();
  };

  const today = new Date();

  // Progress calculation
  const dates = events.map(e => new Date(e.date));
  const minDate = dates.length > 0 ? new Date(Math.min(...dates.map(d => d.getTime()))) : today;
  const maxDate = dates.length > 0 ? new Date(Math.max(...dates.map(d => d.getTime()))) : today;
  const totalDays = differenceInDays(maxDate, minDate) || 1;
  const elapsedDays = differenceInDays(today, minDate);
  const progressPct = Math.min(100, Math.max(0, Math.round((elapsedDays / totalDays) * 100)));

  const doneCount = events.filter(e => e.done).length;

  return (
    <div style={{ padding: '32px', minHeight: '100vh', backgroundColor: '#1a1a1a' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ color: '#e8e8e8', fontSize: '20px', fontWeight: 600, margin: 0 }}>Timeline</h1>
          <p style={{ color: '#888', fontSize: '13px', margin: '4px 0 0' }}>Key milestones, deadlines, and goals</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
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
          <Plus size={14} /> Add Event
        </button>
      </div>

      {/* Progress bar */}
      <div style={{
        backgroundColor: '#242424',
        border: '1px solid #333',
        borderRadius: '8px',
        padding: '16px 20px',
        marginBottom: '28px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ color: '#888', fontSize: '12px' }}>
            {format(minDate, 'MMM yyyy')} → {format(maxDate, 'MMM yyyy')}
          </span>
          <span style={{ color: '#e8e8e8', fontSize: '12px', fontWeight: 500 }}>
            {progressPct}% through · {doneCount}/{events.length} done
          </span>
        </div>
        <div style={{ backgroundColor: '#333', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
          <div style={{
            backgroundColor: '#d97706',
            height: '100%',
            width: `${progressPct}%`,
            borderRadius: '4px',
            transition: 'width 0.5s ease',
          }} />
        </div>
      </div>

      {/* Timeline */}
      {loading ? (
        <div style={{ color: '#888', textAlign: 'center', padding: '60px' }}>Loading...</div>
      ) : (
        <div style={{ position: 'relative', paddingLeft: '36px' }}>
          {/* Vertical line */}
          <div style={{
            position: 'absolute',
            left: '10px',
            top: 0,
            bottom: 0,
            width: '2px',
            backgroundColor: '#2a2a2a',
          }} />

          {events.map((event, idx) => {
            const eventDate = parseISO(event.date);
            const isPast = eventDate < today;
            const isDone = Boolean(event.done);
            const daysUntil = differenceInDays(eventDate, today);

            return (
              <div key={event.id} style={{ position: 'relative', marginBottom: idx < events.length - 1 ? '20px' : 0 }}>
                {/* Dot */}
                <div style={{
                  position: 'absolute',
                  left: '-30px',
                  top: '14px',
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  backgroundColor: isDone ? '#22c55e' : (isPast ? '#444' : TYPE_COLORS[event.type] || '#d97706'),
                  border: `2px solid ${isDone ? '#22c55e' : '#1a1a1a'}`,
                  zIndex: 1,
                }} />

                {/* Card */}
                <div style={{
                  backgroundColor: '#242424',
                  border: '1px solid #333',
                  borderRadius: '8px',
                  padding: '14px 16px',
                  opacity: isDone ? 0.6 : 1,
                  transition: 'opacity 0.2s',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                      <TypeIcon type={event.type} size={15} />
                      <div>
                        <div style={{
                          color: isDone ? '#888' : '#e8e8e8',
                          fontWeight: 500,
                          fontSize: '14px',
                          textDecoration: isDone ? 'line-through' : 'none',
                        }}>
                          {event.title}
                        </div>
                        {event.description && (
                          <div style={{ color: '#888', fontSize: '12px', marginTop: '2px' }}>
                            {event.description}
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ color: '#888', fontSize: '12px' }}>
                          {format(eventDate, 'MMM d, yyyy')}
                        </div>
                        <div style={{
                          fontSize: '11px',
                          color: isPast ? '#555' : (daysUntil <= 30 ? '#d97706' : '#888'),
                          marginTop: '2px',
                        }}>
                          {isPast ? `${Math.abs(daysUntil)}d ago` : `in ${daysUntil}d`}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        {event.fromTracker ? (
                          <span style={{ color: '#3a3a3a', fontSize: '10px', fontWeight: 500, letterSpacing: '0.04em' }}>from tracker</span>
                        ) : (
                          <>
                            <button
                              onClick={() => toggleDone(event)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: isDone ? '#22c55e' : '#555', padding: '2px' }}
                              title={isDone ? 'Mark undone' : 'Mark done'}
                            >
                              {isDone ? <CheckCircle size={16} /> : <Circle size={16} />}
                            </button>
                            <button
                              onClick={() => handleDelete(event.id)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555', padding: '2px' }}
                            >
                              <Trash2 size={14} />
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
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div style={{
            backgroundColor: '#242424',
            border: '1px solid #333',
            borderRadius: '10px',
            padding: '28px',
            width: '440px',
          }}>
            <h2 style={{ color: '#e8e8e8', fontSize: '16px', fontWeight: 600, margin: '0 0 20px' }}>
              Add Timeline Event
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', color: '#888', fontSize: '11px', marginBottom: '4px' }}>Title *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
                  style={{
                    width: '100%',
                    backgroundColor: '#1a1a1a',
                    border: '1px solid #333',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    color: '#e8e8e8',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', color: '#888', fontSize: '11px', marginBottom: '4px' }}>Description</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                  style={{
                    width: '100%',
                    backgroundColor: '#1a1a1a',
                    border: '1px solid #333',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    color: '#e8e8e8',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', color: '#888', fontSize: '11px', marginBottom: '4px' }}>Date *</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={e => setForm(prev => ({ ...prev, date: e.target.value }))}
                    style={{
                      width: '100%',
                      backgroundColor: '#1a1a1a',
                      border: '1px solid #333',
                      borderRadius: '6px',
                      padding: '8px 10px',
                      color: '#e8e8e8',
                      fontSize: '13px',
                      outline: 'none',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', color: '#888', fontSize: '11px', marginBottom: '4px' }}>Type *</label>
                  <select
                    value={form.type}
                    onChange={e => setForm(prev => ({ ...prev, type: e.target.value }))}
                    style={{
                      width: '100%',
                      backgroundColor: '#1a1a1a',
                      border: '1px solid #333',
                      borderRadius: '6px',
                      padding: '8px 10px',
                      color: '#e8e8e8',
                      fontSize: '13px',
                      outline: 'none',
                    }}
                  >
                    {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button
                onClick={() => setShowModal(false)}
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
              <button
                onClick={handleSave}
                disabled={saving || !form.title || !form.date}
                style={{
                  backgroundColor: '#d97706',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 16px',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? 'Saving...' : 'Add Event'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
