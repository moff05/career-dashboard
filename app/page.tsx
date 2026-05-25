'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, Clock, MessageSquare, Zap, Plus, RefreshCw, Bell } from 'lucide-react';

interface Job {
  id: number; company: string; title: string; status: string;
  deadline: string | null; status_updated_at: string | null;
  match_score: number | null; posting_date: string | null;
}

interface Priority {
  level: 'urgent' | 'soon' | 'followup' | 'interview';
  label: string; sub: string; href: string;
}

interface Brief {
  headline: string;
  priority_actions: { action: string; urgency: string; reason: string }[];
  this_week_focus: string;
  honest_assessment: string;
}

const BRIEF_CACHE_KEY = 'dashboard-brief-v1';
const BRIEF_TTL_MS = 24 * 60 * 60 * 1000;

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function deadlineDays(deadline: string) {
  return Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000);
}

function getPriorities(jobs: Job[]): Priority[] {
  const result: Priority[] = [];
  for (const j of jobs) {
    if (!j.deadline || j.status === 'rejected' || j.status === 'offer') continue;
    const days = deadlineDays(j.deadline);
    if (days < 0) continue;
    if (days <= 3) result.push({ level: 'urgent', label: `${j.title} at ${j.company}`, sub: `Deadline ${days === 0 ? 'today' : `in ${days}d`}`, href: '/tracker' });
    else if (days <= 7) result.push({ level: 'soon', label: `${j.company} — ${j.title}`, sub: `Due in ${days} days`, href: '/tracker' });
  }
  for (const j of jobs) {
    if (j.status !== 'applied' || !j.status_updated_at) continue;
    const days = Math.floor((Date.now() - new Date(j.status_updated_at).getTime()) / 86400000);
    if (days >= 14) result.push({ level: 'followup', label: `Follow up — ${j.company}`, sub: `${j.title} · applied ${days}d ago`, href: '/tracker' });
  }
  for (const j of jobs) {
    if (j.status === 'interviewing') result.push({ level: 'interview', label: `Prep — ${j.company}`, sub: j.title, href: '/coach' });
  }
  return result;
}

const LEVEL_CFG = {
  urgent:    { bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.2)',   icon: <AlertTriangle size={12} color="#f87171" />, tag: 'Urgent',    color: '#f87171' },
  soon:      { bg: 'rgba(245,158,11,0.08)',   border: 'rgba(245,158,11,0.2)',  icon: <Clock         size={12} color="#fbbf24" />, tag: 'Soon',      color: '#fbbf24' },
  followup:  { bg: 'rgba(139,92,246,0.08)',   border: 'rgba(139,92,246,0.2)',  icon: <Bell          size={12} color="#a78bfa" />, tag: 'Follow up', color: '#a78bfa' },
  interview: { bg: 'rgba(16,185,129,0.08)',   border: 'rgba(16,185,129,0.2)',  icon: <Zap           size={12} color="#34d399" />, tag: 'Prep',      color: '#34d399' },
};

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  saved:        { label: 'Saved',        color: '#8eb0cc', bg: 'rgba(122,143,168,0.10)' },
  applied:      { label: 'Applied',      color: '#818cf8', bg: 'rgba(129,140,248,0.10)' },
  interviewing: { label: 'Interview',    color: '#fbbf24', bg: 'rgba(251,191,36,0.10)'  },
  offer:        { label: 'Offer',        color: '#34d399', bg: 'rgba(52,211,153,0.10)'  },
  rejected:     { label: 'Rejected',     color: '#f87171', bg: 'rgba(248,113,113,0.10)' },
};

function scoreColor(s: number) {
  if (s >= 8) return '#34d399'; if (s >= 6) return '#fbbf24'; return '#f87171';
}

const BADGE_COLORS = ['#7c3aed','#2563eb','#0891b2','#059669','#d97706','#dc2626','#db2777','#4f46e5','#0284c7','#16a34a','#ca8a04'];
function companyColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return BADGE_COLORS[Math.abs(h) % BADGE_COLORS.length];
}

export default function DashboardPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefAge, setBriefAge] = useState<string>('');
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  useEffect(() => {
    fetch('/api/jobs').then(r => r.json()).then(setJobs).catch(() => {});
  }, []);

  const loadBrief = async (force = false) => {
    if (!force) {
      try {
        const cached = JSON.parse(localStorage.getItem(BRIEF_CACHE_KEY) || '{}');
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
      const res = await fetch('/api/brief');
      const data = await res.json();
      if (!data.error) {
        setBrief(data);
        setBriefAge('just now');
        localStorage.setItem(BRIEF_CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
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

  // Daily digest items
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
    <div style={{ padding: '32px 36px', minHeight: '100vh', backgroundColor: '#0e1520', maxWidth: '1060px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ color: '#eaf2ff', fontSize: '22px', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
            {greeting()}, Nicholas
          </h1>
          <p style={{ color: '#507090', fontSize: '12px', margin: '5px 0 0' }}>{today}</p>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Link href="/tracker" style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            color: '#000', borderRadius: '10px',
            padding: '9px 18px', fontSize: '12px', fontWeight: 700,
            textDecoration: 'none', whiteSpace: 'nowrap',
            boxShadow: '0 4px 14px rgba(245,158,11,0.25)',
          }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            <Plus size={13} /> Import Job
          </Link>
          <Link href="/coach" style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            backgroundColor: '#182535', border: '1px solid #263a52', color: '#8eb0cc',
            borderRadius: '10px', padding: '9px 14px', fontSize: '12px', fontWeight: 500,
            textDecoration: 'none', whiteSpace: 'nowrap',
          }}
            onMouseEnter={e => { e.currentTarget.style.color = '#f59e0b'; e.currentTarget.style.borderColor = 'rgba(245,158,11,0.3)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#8eb0cc'; e.currentTarget.style.borderColor = '#263a52'; }}
          >
            <MessageSquare size={12} /> Coach
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', marginBottom: '24px' }}>
        {[
          { label: 'Tracked',      value: stats.total,        color: '#eaf2ff', glow: '' },
          { label: 'Applied',      value: stats.applied,      color: '#818cf8', glow: 'rgba(129,140,248,0.1)' },
          { label: 'Interviewing', value: stats.interviewing, color: '#fbbf24', glow: 'rgba(251,191,36,0.1)' },
          { label: 'Offers',       value: stats.offers,       color: '#34d399', glow: 'rgba(52,211,153,0.1)' },
          { label: 'Due this week',value: stats.deadlines,    color: stats.deadlines > 0 ? '#f87171' : '#507090', glow: 'rgba(248,113,113,0.1)' },
        ].map(s => (
          <div key={s.label} style={{
            backgroundColor: '#182535', border: '1px solid #263a52', borderRadius: '14px', padding: '16px 14px',
            boxShadow: s.value > 0 && s.glow ? `0 0 20px ${s.glow}` : 'none',
          }}>
            <div style={{ color: s.value > 0 ? s.color : '#263a52', fontSize: '28px', fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
            <div style={{ color: s.value > 0 ? '#507090' : '#263a52', fontSize: '10px', marginTop: '6px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Daily digest banner */}
      {(noResponseJobs.length > 0 || thisWeekDeadlines.length > 0) && (
        <div style={{
          backgroundColor: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)',
          borderRadius: '14px', padding: '14px 18px', marginBottom: '20px',
          display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center',
          animation: 'fadeIn 0.3s ease',
        }}>
          <span style={{ color: '#f59e0b', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', flexShrink: 0 }}>Today</span>
          {thisWeekDeadlines.slice(0, 2).map(j => {
            const d = deadlineDays(j.deadline!);
            return (
              <Link key={j.id} href="/tracker" style={{
                display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none',
                backgroundColor: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.18)',
                borderRadius: '8px', padding: '5px 10px',
              }}>
                <span style={{ color: '#f87171', fontSize: '11px', fontWeight: 600 }}>{j.company}</span>
                <span style={{ color: '#507090', fontSize: '11px' }}>due {d === 0 ? 'today' : `in ${d}d`}</span>
              </Link>
            );
          })}
          {noResponseJobs.slice(0, 2).map(j => (
            <Link key={j.id} href="/tracker" style={{
              display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none',
              backgroundColor: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.18)',
              borderRadius: '8px', padding: '5px 10px',
            }}>
              <span style={{ color: '#a78bfa', fontSize: '11px', fontWeight: 600 }}>{j.company}</span>
              <span style={{ color: '#507090', fontSize: '11px' }}>no response · follow up?</span>
            </Link>
          ))}
          {(noResponseJobs.length + thisWeekDeadlines.length > 4) && (
            <Link href="/tracker" style={{ color: '#f59e0b', fontSize: '11px', textDecoration: 'none' }}>
              +{noResponseJobs.length + thisWeekDeadlines.length - 4} more →
            </Link>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>

        {/* Today's Priorities */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ color: '#628aaa', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Priorities</span>
            <Link href="/tracker" style={{ color: '#507090', fontSize: '11px', textDecoration: 'none' }}
              onMouseEnter={e => ((e.currentTarget as HTMLAnchorElement).style.color = '#8eb0cc')}
              onMouseLeave={e => ((e.currentTarget as HTMLAnchorElement).style.color = '#507090')}>
              View all →
            </Link>
          </div>

          {priorities.length === 0 ? (
            <div style={{ backgroundColor: '#182535', border: '1px solid #263a52', borderRadius: '14px', padding: '28px 20px', textAlign: 'center' }}>
              {hasJobs ? (
                <>
                  <div style={{ color: '#34d399', fontSize: '18px', fontWeight: 700, marginBottom: '6px' }}>All clear</div>
                  <div style={{ color: '#628aaa', fontSize: '12px' }}>No urgent actions right now.</div>
                </>
              ) : (
                <>
                  <div style={{ color: '#507090', fontSize: '12px', marginBottom: '12px' }}>Start by importing a job.</div>
                  <Link href="/tracker" style={{
                    display: 'inline-block',
                    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                    color: '#000', borderRadius: '8px', padding: '7px 16px',
                    fontSize: '11px', fontWeight: 700, textDecoration: 'none',
                  }}>Import Job →</Link>
                </>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {priorities.slice(0, 5).map((p, i) => {
                const c = LEVEL_CFG[p.level];
                return (
                  <Link key={i} href={p.href} style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    backgroundColor: c.bg, border: `1px solid ${c.border}`,
                    borderRadius: '10px', padding: '10px 12px', textDecoration: 'none',
                    transition: 'opacity 0.15s',
                  }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = '0.75')}
                    onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
                    <div style={{ flexShrink: 0 }}>{c.icon}</div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ color: '#d8e2f0', fontSize: '12px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label}</div>
                      <div style={{ color: '#628aaa', fontSize: '11px', marginTop: '1px' }}>{p.sub}</div>
                    </div>
                    <span style={{ fontSize: '9px', fontWeight: 700, color: c.color, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '2px 7px', borderRadius: '20px', backgroundColor: c.bg, border: `1px solid ${c.border}` }}>{c.tag}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Weekly Brief */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#628aaa', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Weekly Brief</span>
              {briefAge && !briefLoading && <span style={{ color: '#3c5875', fontSize: '10px' }}>· {briefAge}</span>}
            </div>
            <button onClick={() => loadBrief(true)} disabled={briefLoading} style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              backgroundColor: 'transparent', color: '#507090', border: 'none',
              padding: '2px', fontSize: '10px', cursor: briefLoading ? 'wait' : 'pointer', fontFamily: 'inherit',
            }}
              onMouseEnter={e => !briefLoading && ((e.currentTarget as HTMLButtonElement).style.color = '#8eb0cc')}
              onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = '#507090')}
            >
              <RefreshCw size={11} style={briefLoading ? { animation: 'spin 1s linear infinite' } : {}} />
            </button>
          </div>

          {briefLoading && !brief && (
            <div style={{ backgroundColor: '#182535', border: '1px solid #263a52', borderRadius: '14px', padding: '32px 20px', textAlign: 'center' }}>
              <RefreshCw size={14} color="#507090" style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px', display: 'block' }} />
              <div style={{ color: '#507090', fontSize: '12px' }}>Generating your brief…</div>
            </div>
          )}

          {!brief && !briefLoading && (
            <div style={{ backgroundColor: '#182535', border: '1px solid #263a52', borderRadius: '14px', padding: '32px 20px', textAlign: 'center' }}>
              <div style={{ color: '#507090', fontSize: '12px', marginBottom: '12px' }}>Your weekly brief wasn&apos;t loaded.</div>
              <button onClick={() => loadBrief(true)} style={{
                backgroundColor: '#1d2d42', color: '#8eb0cc', border: '1px solid #263a52',
                borderRadius: '8px', padding: '6px 14px', fontSize: '11px', fontWeight: 500,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>Generate</button>
            </div>
          )}

          {brief && (
            <div style={{ backgroundColor: '#182535', border: '1px solid #263a52', borderRadius: '14px', padding: '16px', animation: 'fadeIn 0.3s ease', maxHeight: '300px', overflowY: 'auto' }}>
              <p style={{ color: '#d5e5f5', fontSize: '12px', fontWeight: 600, margin: '0 0 12px', lineHeight: 1.6 }}>{brief.headline}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                {brief.priority_actions?.slice(0, 3).map((a, i) => (
                  <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <span style={{
                      fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '20px', flexShrink: 0,
                      marginTop: '1px', textTransform: 'uppercase', letterSpacing: '0.05em',
                      backgroundColor: a.urgency === 'today' ? 'rgba(248,113,113,0.12)' : a.urgency === 'this-week' ? 'rgba(251,191,36,0.12)' : 'rgba(122,143,168,0.08)',
                      color: a.urgency === 'today' ? '#f87171' : a.urgency === 'this-week' ? '#fbbf24' : '#628aaa',
                      border: `1px solid ${a.urgency === 'today' ? 'rgba(248,113,113,0.25)' : a.urgency === 'this-week' ? 'rgba(251,191,36,0.25)' : '#263a52'}`,
                    }}>{a.urgency}</span>
                    <div style={{ color: '#8eb0cc', fontSize: '12px', lineHeight: 1.5 }}>{a.action}</div>
                  </div>
                ))}
              </div>
              {brief.this_week_focus && (
                <div style={{ borderTop: '1px solid #263a52', marginTop: '12px', paddingTop: '12px' }}>
                  <div style={{ color: '#507090', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '5px' }}>This Week</div>
                  <p style={{ color: '#628aaa', fontSize: '11px', margin: 0, lineHeight: 1.65 }}>{brief.this_week_focus}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Recent Jobs */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <span style={{ color: '#628aaa', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Recent Jobs</span>
          <Link href="/tracker" style={{ color: '#507090', fontSize: '11px', textDecoration: 'none' }}
            onMouseEnter={e => ((e.currentTarget as HTMLAnchorElement).style.color = '#8eb0cc')}
            onMouseLeave={e => ((e.currentTarget as HTMLAnchorElement).style.color = '#507090')}>
            View all →
          </Link>
        </div>

        {recentJobs.length === 0 ? (
          <div style={{ backgroundColor: '#182535', border: '1px solid #263a52', borderRadius: '14px', padding: '24px 20px', textAlign: 'center' }}>
            <div style={{ color: '#507090', fontSize: '12px' }}>No jobs tracked yet — import one to get started.</div>
          </div>
        ) : (
          <div style={{ backgroundColor: '#182535', border: '1px solid #263a52', borderRadius: '14px', overflow: 'hidden' }}>
            {recentJobs.map((job, i) => {
              const sc = STATUS_CFG[job.status] || STATUS_CFG.saved;
              return (
                <Link key={job.id} href="/tracker" style={{
                  display: 'flex', alignItems: 'center', gap: '14px',
                  padding: '12px 16px', textDecoration: 'none',
                  borderBottom: i < recentJobs.length - 1 ? '1px solid #1e2e42' : 'none',
                  backgroundColor: 'transparent', transition: 'background 0.1s',
                }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#1d2d42')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '8px', flexShrink: 0,
                    backgroundColor: companyColor(job.company),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '11px', fontWeight: 800, color: '#fff', letterSpacing: '-0.3px',
                  }}>
                    {job.company.slice(0, 2).toUpperCase()}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#d5e5f5', fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.company}</div>
                    <div style={{ color: '#628aaa', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.title}</div>
                  </div>

                  {job.match_score != null && (
                    <div style={{ fontSize: '12px', fontWeight: 700, color: scoreColor(job.match_score), flexShrink: 0 }}>
                      {job.match_score}/10
                    </div>
                  )}

                  <span style={{
                    fontSize: '10px', fontWeight: 600, padding: '3px 9px', borderRadius: '20px', flexShrink: 0,
                    backgroundColor: sc.bg, color: sc.color,
                  }}>{sc.label}</span>

                  {job.deadline && (() => {
                    const days = deadlineDays(job.deadline);
                    if (days < 0 || days > 14) return null;
                    return (
                      <span style={{ fontSize: '10px', color: days <= 3 ? '#f87171' : '#628aaa', flexShrink: 0, minWidth: '38px', textAlign: 'right' }}>
                        {days === 0 ? 'Today' : `${days}d`}
                      </span>
                    );
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
