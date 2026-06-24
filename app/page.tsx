'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/apiFetch';
import Link from 'next/link';
import { AlertTriangle, Clock, MessageSquare, Zap, Plus, RefreshCw, Bell } from 'lucide-react';
import { useUser } from '@/app/hooks/useUser';

interface Job {
  id: number; company: string; title: string; status: string;
  deadline: string | null; status_updated_at: string | null;
  match_score: number | null; posting_date: string | null;
}

interface Priority {
  level: 'urgent' | 'soon' | 'followup' | 'interview';
  label: string; sub: string; href: string; score: number | null;
}

interface Brief {
  headline: string;
  priority_actions: { action: string; urgency: string; reason: string }[];
  this_week_focus: string;
  honest_assessment: string;
}

const BRIEF_TTL_MS = 24 * 60 * 60 * 1000;

// Cache keys are scoped per user — otherwise switching accounts on the same
// browser surfaces the previous user's cached brief.
function scopedKey(base: string): string {
  const userId = typeof window !== 'undefined' ? localStorage.getItem('cid_user_id') || 'anon' : 'anon';
  return `${base}:${userId}`;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function deadlineDays(deadline: string) {
  return Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000);
}

// Urgency bucket (deadline > follow-up > interview prep) is the primary sort —
// fit score only breaks ties within a bucket. Replaces the old separate
// "Strategy" AI call: same ranking signal (deadline + fit), computed for free
// from data already on hand instead of a second Haiku round-trip.
function getPriorities(jobs: Job[]): Priority[] {
  const deadlineItems: (Priority & { days: number })[] = [];
  for (const j of jobs) {
    if (!j.deadline || j.status === 'rejected' || j.status === 'offer') continue;
    const days = deadlineDays(j.deadline);
    if (days < 0) continue;
    if (days <= 3) deadlineItems.push({ level: 'urgent', label: `${j.title} at ${j.company}`, sub: `Deadline ${days === 0 ? 'today' : `in ${days}d`}`, href: '/tracker', score: j.match_score, days });
    else if (days <= 7) deadlineItems.push({ level: 'soon', label: `${j.company} — ${j.title}`, sub: `Due in ${days} days`, href: '/tracker', score: j.match_score, days });
  }
  // Closest deadline first; fit score breaks ties between equally urgent jobs.
  deadlineItems.sort((a, b) => a.days - b.days || (b.score ?? -1) - (a.score ?? -1));

  const followups: Priority[] = [];
  for (const j of jobs) {
    if (j.status !== 'applied' || !j.status_updated_at) continue;
    const days = Math.floor((Date.now() - new Date(j.status_updated_at).getTime()) / 86400000);
    if (days >= 14) followups.push({ level: 'followup', label: `Follow up — ${j.company}`, sub: `${j.title} · applied ${days}d ago`, href: '/tracker', score: j.match_score });
  }
  followups.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

  const interviews: Priority[] = [];
  for (const j of jobs) {
    if (j.status === 'interviewing') interviews.push({ level: 'interview', label: `Prep — ${j.company}`, sub: j.title, href: '/coach', score: j.match_score });
  }
  interviews.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

  return [...deadlineItems, ...followups, ...interviews];
}

const LEVEL_CFG = {
  urgent:    { bg: 'rgba(239,68,68,0.07)',   border: 'rgba(239,68,68,0.18)',   icon: <AlertTriangle size={12} color="#ef4444" />, tag: 'Urgent',    color: '#ef4444' },
  soon:      { bg: 'rgba(59,130,246,0.07)',   border: 'rgba(59,130,246,0.18)',  icon: <Clock         size={12} color="#3b82f6" />, tag: 'Soon',      color: '#3b82f6' },
  followup:  { bg: 'rgba(139,92,246,0.07)',   border: 'rgba(139,92,246,0.18)',  icon: <Bell          size={12} color="#8b5cf6" />, tag: 'Follow up', color: '#8b5cf6' },
  interview: { bg: 'rgba(16,185,129,0.07)',   border: 'rgba(16,185,129,0.18)',  icon: <Zap           size={12} color="#10b981" />, tag: 'Prep',      color: '#10b981' },
};

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  saved:        { label: 'Saved',     color: 'rgba(170,205,235,0.80)', bg: 'rgba(100,116,139,0.08)' },
  applied:      { label: 'Applied',   color: '#6366f1', bg: 'rgba(99,102,241,0.08)'  },
  interviewing: { label: 'Interview', color: '#0891b2', bg: 'rgba(8,145,178,0.08)'   },
  offer:        { label: 'Offer',     color: '#059669', bg: 'rgba(5,150,105,0.08)'   },
  rejected:     { label: 'Rejected',  color: '#dc2626', bg: 'rgba(220,38,38,0.08)'   },
};

function scoreColor(s: number) {
  if (s >= 8) return '#059669'; if (s >= 6) return '#2563eb'; return '#dc2626';
}

const BADGE_COLORS = ['#7c3aed','#2563eb','#0891b2','#059669','#2563eb','#dc2626','#db2777','#4f46e5','#0284c7','#16a34a','#ca8a04'];
function companyColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return BADGE_COLORS[Math.abs(h) % BADGE_COLORS.length];
}

export default function DashboardPage() {
  const { displayName } = useUser();
  const firstName = displayName.split(' ')[0];
  const [jobs, setJobs] = useState<Job[]>([]);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefAge, setBriefAge] = useState<string>('');
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  useEffect(() => {
    apiFetch('/api/jobs').then(r => r.json()).then(setJobs).catch(() => {});
  }, []);

  const loadBrief = async (force = false) => {
    if (!force) {
      try {
        const cached = JSON.parse(localStorage.getItem(scopedKey('dashboard-brief-v1')) || '{}');
        if (cached.data && Date.now() - cached.ts < BRIEF_TTL_MS) {
          setBrief(cached.data);
          const mins = Math.round((Date.now() - cached.ts) / 60000);
          setBriefAge(mins < 60 ? `${mins}m ago` : `${Math.round(mins / 60)}h ago`);
          return;
        }
      } catch { /* ignore */ }
    }
    setBriefLoading(true);
    try {
      const res = await apiFetch('/api/brief');
      const data = await res.json();
      if (!data.error) {
        setBrief(data);
        setBriefAge('just now');
        localStorage.setItem(scopedKey('dashboard-brief-v1'), JSON.stringify({ data, ts: Date.now() }));
      }
    } catch { /* silently fail */ }
    setBriefLoading(false);
  };

  useEffect(() => { loadBrief(); }, []);

  const stats = {
    total:        jobs.length,
    applied:      jobs.filter(j => j.status === 'applied').length,
    interviewing: jobs.filter(j => j.status === 'interviewing').length,
    offers:       jobs.filter(j => j.status === 'offer').length,
    deadlines:    jobs.filter(j => {
      if (!j.deadline || j.status === 'rejected' || j.status === 'offer') return false;
      const d = deadlineDays(j.deadline);
      return d >= 0 && d <= 7;
    }).length,
  };

  const noResponseJobs = jobs.filter(j => {
    if (j.status !== 'applied' || !j.status_updated_at) return false;
    return Math.floor((Date.now() - new Date(j.status_updated_at).getTime()) / 86400000) >= 14;
  });
  const thisWeekDeadlines = jobs.filter(j => {
    if (!j.deadline || j.status === 'rejected' || j.status === 'offer') return false;
    const d = deadlineDays(j.deadline);
    return d >= 0 && d <= 7;
  }).sort((a, b) => deadlineDays(a.deadline!) - deadlineDays(b.deadline!));

  const priorities = getPriorities(jobs);
  const recentJobs = [...jobs].sort((a, b) => b.id - a.id).slice(0, 5);
  const hasJobs = jobs.length > 0;

  return (
    <div style={{ padding: '40px 44px', minHeight: '100vh', background: 'transparent' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '34px' }}>
        <div>
          <h1 style={{ color: 'rgba(232,244,255,0.95)', fontSize: '22px', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
            {greeting()}{firstName ? `, ${firstName}` : ''}
          </h1>
          <p style={{ color: 'rgba(170,205,235,0.80)', fontSize: '12px', margin: '5px 0 0' }}>{today}</p>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Link href="/tracker" style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            background: 'linear-gradient(135deg, rgba(74,158,248,0.28), rgba(125,244,252,0.18))',
            color: '#fff', borderRadius: '10px',
            padding: '9px 18px', fontSize: '12px', fontWeight: 700,
            textDecoration: 'none', whiteSpace: 'nowrap',
            boxShadow: '0 4px 14px rgba(59,130,246,0.25)',
          }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            <Plus size={13} /> Import Job
          </Link>
          <Link href="/coach" style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            background: 'rgba(125,220,255,0.05)', border: '1px solid rgba(125,220,255,0.12)', color: 'rgba(180,220,255,0.6)',
            borderRadius: '10px', padding: '9px 14px', fontSize: '12px', fontWeight: 500,
            textDecoration: 'none', whiteSpace: 'nowrap',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}
            onMouseEnter={e => { e.currentTarget.style.color = '#3b82f6'; e.currentTarget.style.borderColor = 'rgba(59,130,246,0.3)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(170,205,235,0.80)'; e.currentTarget.style.borderColor = 'rgba(125,220,255,0.12)'; }}
          >
            <MessageSquare size={12} /> Coach
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-10">
        {[
          { label: 'Tracked',       value: stats.total,        color: 'rgba(232,244,255,0.95)', glow: '' },
          { label: 'Applied',       value: stats.applied,      color: '#6366f1', glow: 'rgba(99,102,241,0.1)' },
          { label: 'Interviewing',  value: stats.interviewing, color: '#0891b2', glow: 'rgba(8,145,178,0.1)' },
          { label: 'Offers',        value: stats.offers,       color: '#059669', glow: 'rgba(5,150,105,0.1)' },
          { label: 'Due this week', value: stats.deadlines,    color: stats.deadlines > 0 ? '#dc2626' : 'rgba(158,202,242,0.85)', glow: 'rgba(220,38,38,0.1)' },
        ].map(s => (
          <div key={s.label} style={{
            background: 'rgba(125,220,255,0.04)', backdropFilter: 'blur(20px)', border: '1px solid rgba(125,220,255,0.12)', borderRadius: '14px', padding: '20px 18px',
            boxShadow: s.value > 0 && s.glow ? `0 0 20px ${s.glow}` : '0 1px 3px rgba(0,0,0,0.06)',
          }}>
            <div style={{ color: s.value > 0 ? s.color : 'rgba(135,185,230,0.70)', fontSize: '30px', fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
            <div style={{ color: s.value > 0 ? 'rgba(158,202,242,0.85)' : 'rgba(135,185,230,0.70)', fontSize: '11px', marginTop: '8px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Daily digest banner */}
      {(noResponseJobs.length > 0 || thisWeekDeadlines.length > 0) && (
        <div style={{
          background: 'rgba(125,220,255,0.04)', backdropFilter: 'blur(20px)', border: '1px solid rgba(125,220,255,0.12)',
          borderRadius: '14px', padding: '14px 18px', marginBottom: '20px',
          display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center',
          animation: 'fadeIn 0.3s ease',
        }}>
          <span style={{ color: '#3b82f6', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', flexShrink: 0 }}>Today</span>
          {thisWeekDeadlines.slice(0, 2).map(j => {
            const d = deadlineDays(j.deadline!);
            return (
              <Link key={j.id} href="/tracker" style={{
                display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none',
                background: 'rgba(248,100,100,0.08)', border: '1px solid rgba(248,100,100,0.18)',
                borderRadius: '8px', padding: '5px 10px',
              }}>
                <span style={{ color: '#dc2626', fontSize: '11px', fontWeight: 600 }}>{j.company}</span>
                <span style={{ color: 'rgba(170,205,235,0.80)', fontSize: '11px' }}>due {d === 0 ? 'today' : `in ${d}d`}</span>
              </Link>
            );
          })}
          {noResponseJobs.slice(0, 2).map(j => (
            <Link key={j.id} href="/tracker" style={{
              display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none',
              background: 'rgba(125,220,255,0.06)', border: '1px solid rgba(125,220,255,0.16)',
              borderRadius: '8px', padding: '5px 10px',
            }}>
              <span style={{ color: '#8b5cf6', fontSize: '11px', fontWeight: 600 }}>{j.company}</span>
              <span style={{ color: 'rgba(170,205,235,0.80)', fontSize: '11px' }}>no response · follow up?</span>
            </Link>
          ))}
          {(noResponseJobs.length + thisWeekDeadlines.length > 4) && (
            <Link href="/tracker" style={{ color: '#3b82f6', fontSize: '11px', textDecoration: 'none' }}>
              +{noResponseJobs.length + thisWeekDeadlines.length - 4} more →
            </Link>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">

        {/* Today's Priorities */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
            <span style={{ color: 'rgba(180,212,240,0.88)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em' }}>Priorities</span>
            <Link href="/tracker" style={{ color: 'rgba(170,205,235,0.80)', fontSize: '11px', textDecoration: 'none' }}
              onMouseEnter={e => ((e.currentTarget as HTMLAnchorElement).style.color = '#3b82f6')}
              onMouseLeave={e => ((e.currentTarget as HTMLAnchorElement).style.color = 'rgba(158,202,242,0.85)')}>
              View all →
            </Link>
          </div>

          {priorities.length === 0 ? (
            <div style={{ background: 'rgba(125,220,255,0.04)', backdropFilter: 'blur(20px)', border: '1px solid rgba(125,220,255,0.12)', borderRadius: '14px', padding: '28px 20px', textAlign: 'center' }}>
              {hasJobs ? (
                <>
                  <div style={{ color: '#059669', fontSize: '18px', fontWeight: 700, marginBottom: '6px' }}>All clear</div>
                  <div style={{ color: 'rgba(170,205,235,0.80)', fontSize: '12px' }}>No urgent actions right now.</div>
                </>
              ) : (
                <>
                  <div style={{ color: 'rgba(170,205,235,0.80)', fontSize: '12px', marginBottom: '12px' }}>Start by importing a job.</div>
                  <Link href="/tracker" style={{
                    display: 'inline-block',
                    background: 'linear-gradient(135deg, rgba(74,158,248,0.28), rgba(125,244,252,0.18))',
                    color: '#fff', borderRadius: '8px', padding: '7px 16px',
                    fontSize: '11px', fontWeight: 700, textDecoration: 'none',
                  }}>Import Job →</Link>
                </>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {priorities.slice(0, 5).map((p, i) => {
                const c = LEVEL_CFG[p.level];
                return (
                  <Link key={i} href={p.href} style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    backgroundColor: c.bg, border: `1px solid ${c.border}`,
                    borderRadius: '10px', padding: '12px 14px', textDecoration: 'none',
                    transition: 'opacity 0.15s',
                  }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = '0.75')}
                    onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
                    <div style={{ flexShrink: 0 }}>{c.icon}</div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ color: 'rgba(232,244,255,0.95)', fontSize: '12px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label}</div>
                      <div style={{ color: 'rgba(170,205,235,0.80)', fontSize: '11px', marginTop: '1px' }}>{p.sub}</div>
                    </div>
                    {p.score != null && <span style={{ fontSize: '11px', fontWeight: 700, color: scoreColor(p.score), flexShrink: 0 }}>{p.score}/10</span>}
                    <span style={{ fontSize: '9px', fontWeight: 700, color: c.color, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '2px 7px', borderRadius: '20px', backgroundColor: c.bg, border: `1px solid ${c.border}` }}>{c.tag}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Weekly Brief */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: 'rgba(180,212,240,0.88)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em' }}>Weekly Brief</span>
              {briefAge && !briefLoading && <span style={{ color: 'rgba(135,185,230,0.70)', fontSize: '10px' }}>· {briefAge}</span>}
            </div>
            <button onClick={() => loadBrief(true)} disabled={briefLoading} style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              backgroundColor: 'transparent', color: 'rgba(100,155,210,0.50)', border: 'none',
              padding: '2px', fontSize: '10px', cursor: briefLoading ? 'wait' : 'pointer', fontFamily: 'inherit',
            }}
              onMouseEnter={e => !briefLoading && ((e.currentTarget as HTMLButtonElement).style.color = '#3b82f6')}
              onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = 'rgba(158,202,242,0.85)')}
            >
              <RefreshCw size={11} style={briefLoading ? { animation: 'spin 1s linear infinite' } : {}} />
            </button>
          </div>

          {briefLoading && !brief && (
            <div style={{ background: 'rgba(125,220,255,0.04)', backdropFilter: 'blur(20px)', border: '1px solid rgba(125,220,255,0.12)', borderRadius: '14px', padding: '32px 20px', textAlign: 'center' }}>
              <RefreshCw size={14} color="rgba(158,202,242,0.85)" style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px', display: 'block' }} />
              <div style={{ color: 'rgba(170,205,235,0.80)', fontSize: '12px' }}>Generating your brief…</div>
            </div>
          )}

          {!brief && !briefLoading && (
            <div style={{ background: 'rgba(125,220,255,0.04)', backdropFilter: 'blur(20px)', border: '1px solid rgba(125,220,255,0.12)', borderRadius: '14px', padding: '32px 20px', textAlign: 'center' }}>
              <div style={{ color: 'rgba(170,205,235,0.80)', fontSize: '12px', marginBottom: '12px' }}>Your weekly brief wasn&apos;t loaded.</div>
              <button onClick={() => loadBrief(true)} style={{
                background: 'rgba(125,220,255,0.03)', color: 'rgba(170,205,235,0.80)', border: '1px solid rgba(125,220,255,0.09)',
                borderRadius: '8px', padding: '6px 14px', fontSize: '11px', fontWeight: 500,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>Generate</button>
            </div>
          )}

          {brief && (
            <div style={{ background: 'rgba(125,220,255,0.04)', backdropFilter: 'blur(20px)', border: '1px solid rgba(125,220,255,0.12)', borderRadius: '14px', padding: '20px', animation: 'fadeIn 0.3s ease', maxHeight: '320px', overflowY: 'auto' }}>
              <p style={{ color: 'rgba(200,230,255,0.92)', fontSize: '13px', fontWeight: 600, margin: '0 0 16px', lineHeight: 1.7 }}>{brief.headline}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '11px' }}>
                {brief.priority_actions?.slice(0, 3).map((a, i) => (
                  <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <span style={{
                      fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '20px', flexShrink: 0,
                      marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.05em',
                      background: a.urgency === 'today' ? 'rgba(248,100,100,0.12)' : a.urgency === 'this-week' ? 'rgba(74,158,248,0.12)' : 'rgba(125,220,255,0.06)',
                      color: a.urgency === 'today' ? '#dc2626' : a.urgency === 'this-week' ? '#3b82f6' : 'rgba(158,202,242,0.85)',
                      border: `1px solid ${a.urgency === 'today' ? 'rgba(239,68,68,0.2)' : a.urgency === 'this-week' ? 'rgba(59,130,246,0.2)' : 'rgba(125,220,255,0.10)'}`,
                    }}>{a.urgency}</span>
                    <div style={{ color: 'rgba(210,234,255,0.92)', fontSize: '13px', lineHeight: 1.65 }}>{a.action}</div>
                  </div>
                ))}
              </div>
              {brief.this_week_focus && (
                <div style={{ borderTop: '1px solid rgba(125,220,255,0.08)', marginTop: '16px', paddingTop: '14px' }}>
                  <div style={{ color: 'rgba(170,205,235,0.80)', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '7px' }}>This Week</div>
                  <p style={{ color: 'rgba(190,220,250,0.85)', fontSize: '12px', margin: 0, lineHeight: 1.7 }}>{brief.this_week_focus}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Recent Jobs */}
      <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
            <span style={{ color: 'rgba(180,212,240,0.88)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em' }}>Recent Jobs</span>
            <Link href="/tracker" style={{ color: 'rgba(170,205,235,0.80)', fontSize: '11px', textDecoration: 'none' }}
              onMouseEnter={e => ((e.currentTarget as HTMLAnchorElement).style.color = '#3b82f6')}
              onMouseLeave={e => ((e.currentTarget as HTMLAnchorElement).style.color = 'rgba(158,202,242,0.85)')}>
              View all →
            </Link>
          </div>
          {recentJobs.length === 0 ? (
            <div style={{ background: 'rgba(125,220,255,0.04)', backdropFilter: 'blur(20px)', border: '1px solid rgba(125,220,255,0.12)', borderRadius: '14px', padding: '24px 20px', textAlign: 'center' }}>
              <div style={{ color: 'rgba(170,205,235,0.80)', fontSize: '12px' }}>No jobs tracked yet — import one to get started.</div>
            </div>
          ) : (
            <div style={{ background: 'rgba(125,220,255,0.04)', backdropFilter: 'blur(20px)', border: '1px solid rgba(125,220,255,0.12)', borderRadius: '14px', overflow: 'hidden' }}>
              {recentJobs.map((job, i) => {
                const sc = STATUS_CFG[job.status] || STATUS_CFG.saved;
                return (
                  <Link key={job.id} href="/tracker" style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 16px', textDecoration: 'none', borderBottom: i < recentJobs.length - 1 ? '1px solid rgba(125,220,255,0.08)' : 'none', backgroundColor: 'transparent', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(125,220,255,0.06)')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', flexShrink: 0, backgroundColor: companyColor(job.company), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800, color: '#fff', letterSpacing: '-0.3px' }}>
                      {job.company.slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: 'rgba(232,244,255,0.95)', fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.company}</div>
                      <div style={{ color: 'rgba(170,205,235,0.80)', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.title}</div>
                    </div>
                    {job.match_score != null && <div style={{ fontSize: '12px', fontWeight: 700, color: scoreColor(job.match_score), flexShrink: 0 }}>{job.match_score}/10</div>}
                    <span style={{ fontSize: '10px', fontWeight: 600, padding: '3px 9px', borderRadius: '20px', flexShrink: 0, backgroundColor: sc.bg, color: sc.color }}>{sc.label}</span>
                    {job.deadline && (() => {
                      const days = deadlineDays(job.deadline);
                      if (days < 0 || days > 14) return null;
                      return <span style={{ fontSize: '10px', color: days <= 3 ? '#dc2626' : 'rgba(158,202,242,0.85)', flexShrink: 0, minWidth: '38px', textAlign: 'right' }}>{days === 0 ? 'Today' : `${days}d`}</span>;
                    })()}
                  </Link>
                );
              })}
            </div>
          )}
      </div>
    </div>
  );
}
