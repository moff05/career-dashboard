'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, Clock, MessageSquare, Zap, Plus, LayoutDashboard, RefreshCw } from 'lucide-react';

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
    if (days <= 3) result.push({ level: 'urgent', label: `${j.title} at ${j.company}`, sub: `Deadline in ${days === 0 ? 'today' : `${days}d`}`, href: '/tracker' });
    else if (days <= 7) result.push({ level: 'soon', label: `${j.company} — ${j.title}`, sub: `Deadline in ${days} days`, href: '/tracker' });
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
  urgent:    { bg: '#160808', border: '#5c1212', icon: <AlertTriangle size={12} color="#ef4444" />, tag: 'Urgent',   color: '#ef4444' },
  soon:      { bg: '#130f00', border: '#5a3200', icon: <Clock        size={12} color="#f59e0b" />, tag: 'Soon',     color: '#f59e0b' },
  followup:  { bg: '#0d0916', border: '#3b1d72', icon: <MessageSquare size={12} color="#a855f7"/>, tag: 'Follow up',color: '#a855f7' },
  interview: { bg: '#081408', border: '#14532d', icon: <Zap          size={12} color="#22c55e" />, tag: 'Prep',     color: '#22c55e' },
};

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  saved:        { label: 'Saved',        color: '#666',    bg: '#161616' },
  applied:      { label: 'Applied',      color: '#3b82f6', bg: '#0d1a2e' },
  interviewing: { label: 'Interviewing', color: '#f59e0b', bg: '#1a1200' },
  offer:        { label: 'Offer',        color: '#22c55e', bg: '#0a1f0a' },
  rejected:     { label: 'Rejected',     color: '#ef4444', bg: '#1a0808' },
};

function scoreColor(s: number) {
  if (s >= 8) return '#22c55e'; if (s >= 6) return '#f59e0b'; if (s >= 4) return '#f97316'; return '#ef4444';
}

export default function DashboardPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefAge, setBriefAge] = useState<string>('');
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

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

  const priorities = getPriorities(jobs);
  const recentJobs = [...jobs].sort((a, b) => b.id - a.id).slice(0, 5);
  const hasJobs = jobs.length > 0;

  return (
    <div style={{ padding: '32px 36px', minHeight: '100vh', backgroundColor: '#0a0a0a', maxWidth: '1040px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ color: '#f0f0f0', fontSize: '22px', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
            {greeting()}, Nicholas
          </h1>
          <p style={{ color: '#2e2e2e', fontSize: '12px', margin: '4px 0 0' }}>{today}</p>
        </div>

        {/* Quick actions */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Link href="/tracker" style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            backgroundColor: '#d97706', color: '#000', borderRadius: '8px',
            padding: '8px 16px', fontSize: '12px', fontWeight: 700,
            textDecoration: 'none', whiteSpace: 'nowrap',
          }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f59e0b')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#d97706')}
          >
            <Plus size={13} /> Import Job
          </Link>
          <Link href="/coach" style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            backgroundColor: '#111', border: '1px solid #222', color: '#888',
            borderRadius: '8px', padding: '8px 14px', fontSize: '12px', fontWeight: 500,
            textDecoration: 'none', whiteSpace: 'nowrap',
          }}
            onMouseEnter={e => { e.currentTarget.style.color = '#d97706'; e.currentTarget.style.borderColor = '#d97706'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#888'; e.currentTarget.style.borderColor = '#222'; }}
          >
            <MessageSquare size={12} /> Coach
          </Link>
          <Link href="/tracker" style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            backgroundColor: '#111', border: '1px solid #222', color: '#888',
            borderRadius: '8px', padding: '8px 14px', fontSize: '12px', fontWeight: 500,
            textDecoration: 'none', whiteSpace: 'nowrap',
          }}
            onMouseEnter={e => { e.currentTarget.style.color = '#d97706'; e.currentTarget.style.borderColor = '#d97706'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#888'; e.currentTarget.style.borderColor = '#222'; }}
          >
            <LayoutDashboard size={12} /> Pipeline
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', marginBottom: '24px' }}>
        {[
          { label: 'Tracked',      value: stats.total,        color: '#e8e8e8', glow: '' },
          { label: 'Applied',      value: stats.applied,      color: '#3b82f6', glow: 'rgba(59,130,246,0.12)' },
          { label: 'Interviewing', value: stats.interviewing, color: '#f59e0b', glow: 'rgba(245,158,11,0.12)' },
          { label: 'Offers',       value: stats.offers,       color: '#22c55e', glow: 'rgba(34,197,94,0.12)' },
          { label: 'Due this week',value: stats.deadlines,    color: stats.deadlines > 0 ? '#ef4444' : '#2a2a2a', glow: 'rgba(239,68,68,0.12)' },
        ].map(s => (
          <div key={s.label} style={{
            backgroundColor: '#0f0f0f', border: '1px solid #181818', borderRadius: '10px', padding: '16px 14px',
            boxShadow: s.value > 0 && s.glow ? `0 0 20px ${s.glow}` : 'none',
          }}>
            <div style={{ color: s.value > 0 ? s.color : '#1e1e1e', fontSize: '30px', fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
            <div style={{ color: s.value > 0 ? '#3a3a3a' : '#1e1e1e', fontSize: '10px', marginTop: '6px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>

        {/* Today's Priorities */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ color: '#3a3a3a', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Today&apos;s Priorities</span>
            <Link href="/tracker" style={{ color: '#2a2a2a', fontSize: '11px', textDecoration: 'none' }}
              onMouseEnter={e => ((e.currentTarget as HTMLAnchorElement).style.color = '#666')}
              onMouseLeave={e => ((e.currentTarget as HTMLAnchorElement).style.color = '#2a2a2a')}>
              View all →
            </Link>
          </div>

          {priorities.length === 0 ? (
            <div style={{ backgroundColor: '#0f0f0f', border: '1px solid #181818', borderRadius: '10px', padding: '28px 20px', textAlign: 'center' }}>
              {hasJobs ? (
                <>
                  <div style={{ color: '#22c55e', fontSize: '18px', marginBottom: '6px' }}>✓</div>
                  <div style={{ color: '#2e2e2e', fontSize: '12px' }}>No urgent actions right now.</div>
                </>
              ) : (
                <>
                  <div style={{ color: '#1e1e1e', fontSize: '30px', marginBottom: '8px' }}>→</div>
                  <div style={{ color: '#2e2e2e', fontSize: '12px', marginBottom: '10px' }}>Start by importing a job.</div>
                  <Link href="/tracker" style={{
                    display: 'inline-block', backgroundColor: '#d97706', color: '#000',
                    borderRadius: '6px', padding: '6px 14px', fontSize: '11px', fontWeight: 700, textDecoration: 'none',
                  }}>Import Job →</Link>
                </>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {priorities.slice(0, 6).map((p, i) => {
                const c = LEVEL_CFG[p.level];
                return (
                  <Link key={i} href={p.href} style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    backgroundColor: c.bg, border: `1px solid ${c.border}`,
                    borderRadius: '8px', padding: '10px 12px', textDecoration: 'none',
                  }}
                    onMouseEnter={e => ((e.currentTarget as HTMLAnchorElement).style.opacity = '0.75')}
                    onMouseLeave={e => ((e.currentTarget as HTMLAnchorElement).style.opacity = '1')}>
                    <div style={{ flexShrink: 0 }}>{c.icon}</div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ color: '#d0d0d0', fontSize: '12px', fontWeight: 600, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label}</div>
                      <div style={{ color: '#444', fontSize: '11px', marginTop: '1px' }}>{p.sub}</div>
                    </div>
                    <span style={{ fontSize: '9px', fontWeight: 700, color: c.color, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{c.tag}</span>
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
              <span style={{ color: '#3a3a3a', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Weekly Brief</span>
              {briefAge && !briefLoading && (
                <span style={{ color: '#222', fontSize: '10px' }}>· {briefAge}</span>
              )}
            </div>
            <button onClick={() => loadBrief(true)} disabled={briefLoading} style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              backgroundColor: 'transparent', color: '#2a2a2a', border: 'none',
              padding: '2px', fontSize: '10px', cursor: briefLoading ? 'wait' : 'pointer', fontFamily: 'inherit',
            }}
              onMouseEnter={e => !briefLoading && ((e.currentTarget as HTMLButtonElement).style.color = '#888')}
              onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = '#2a2a2a')}
            >
              <RefreshCw size={11} style={briefLoading ? { animation: 'spin 1s linear infinite' } : {}} />
            </button>
          </div>

          {briefLoading && !brief && (
            <div style={{ backgroundColor: '#0f0f0f', border: '1px solid #181818', borderRadius: '10px', padding: '32px 20px', textAlign: 'center' }}>
              <RefreshCw size={14} color="#333" style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px' }} />
              <div style={{ color: '#2a2a2a', fontSize: '12px' }}>Generating your brief…</div>
            </div>
          )}

          {!brief && !briefLoading && (
            <div style={{ backgroundColor: '#0f0f0f', border: '1px solid #181818', borderRadius: '10px', padding: '32px 20px', textAlign: 'center' }}>
              <div style={{ color: '#2a2a2a', fontSize: '12px', marginBottom: '10px' }}>Your weekly brief wasn&apos;t loaded.</div>
              <button onClick={() => loadBrief(true)} style={{
                backgroundColor: '#161616', color: '#666', border: '1px solid #1e1e1e',
                borderRadius: '6px', padding: '6px 14px', fontSize: '11px', fontWeight: 500,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>Generate</button>
            </div>
          )}

          {brief && (
            <div style={{ backgroundColor: '#0f0f0f', border: '1px solid #181818', borderRadius: '10px', padding: '16px', animation: 'fadeIn 0.3s ease', maxHeight: '300px', overflowY: 'auto' }}>
              <p style={{ color: '#d8d8d8', fontSize: '12px', fontWeight: 600, margin: '0 0 12px', lineHeight: 1.55 }}>{brief.headline}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {brief.priority_actions?.slice(0, 3).map((a, i) => (
                  <div key={i} style={{ display: 'flex', gap: '7px', alignItems: 'flex-start' }}>
                    <span style={{
                      fontSize: '9px', fontWeight: 700, padding: '2px 5px', borderRadius: '3px', flexShrink: 0,
                      marginTop: '1px', textTransform: 'uppercase', letterSpacing: '0.05em',
                      backgroundColor: a.urgency === 'today' ? '#3f0f0f' : a.urgency === 'this-week' ? '#2a1900' : '#131313',
                      color: a.urgency === 'today' ? '#f87171' : a.urgency === 'this-week' ? '#fbbf24' : '#444',
                    }}>{a.urgency}</span>
                    <div style={{ color: '#888', fontSize: '12px', lineHeight: 1.4 }}>{a.action}</div>
                  </div>
                ))}
              </div>
              {brief.this_week_focus && (
                <div style={{ borderTop: '1px solid #181818', marginTop: '12px', paddingTop: '12px' }}>
                  <div style={{ color: '#2e2e2e', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '5px' }}>Focus</div>
                  <p style={{ color: '#666', fontSize: '11px', margin: 0, lineHeight: 1.6 }}>{brief.this_week_focus}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Recent Jobs */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <span style={{ color: '#3a3a3a', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Recent Jobs</span>
          <Link href="/tracker" style={{ color: '#2a2a2a', fontSize: '11px', textDecoration: 'none' }}
            onMouseEnter={e => ((e.currentTarget as HTMLAnchorElement).style.color = '#666')}
            onMouseLeave={e => ((e.currentTarget as HTMLAnchorElement).style.color = '#2a2a2a')}>
            View all →
          </Link>
        </div>

        {recentJobs.length === 0 ? (
          <div style={{ backgroundColor: '#0f0f0f', border: '1px solid #181818', borderRadius: '10px', padding: '24px 20px', textAlign: 'center' }}>
            <div style={{ color: '#1e1e1e', fontSize: '12px' }}>No jobs tracked yet — import one to get started.</div>
          </div>
        ) : (
          <div style={{ backgroundColor: '#0f0f0f', border: '1px solid #181818', borderRadius: '10px', overflow: 'hidden' }}>
            {recentJobs.map((job, i) => {
              const sc = STATUS_CFG[job.status] || STATUS_CFG.saved;
              return (
                <Link key={job.id} href="/tracker" style={{
                  display: 'flex', alignItems: 'center', gap: '14px',
                  padding: '12px 16px', textDecoration: 'none',
                  borderBottom: i < recentJobs.length - 1 ? '1px solid #141414' : 'none',
                  backgroundColor: 'transparent',
                }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#121212')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  {/* Company badge */}
                  <div style={{
                    width: '30px', height: '30px', borderRadius: '7px', flexShrink: 0,
                    backgroundColor: companyColor(job.company),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '11px', fontWeight: 800, color: '#fff', letterSpacing: '-0.3px',
                  }}>
                    {job.company.slice(0, 2).toUpperCase()}
                  </div>

                  {/* Job info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#d0d0d0', fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.company}</div>
                    <div style={{ color: '#444', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.title}</div>
                  </div>

                  {/* Score */}
                  {job.match_score != null && (
                    <div style={{ fontSize: '12px', fontWeight: 700, color: scoreColor(job.match_score), flexShrink: 0 }}>
                      {job.match_score}/10
                    </div>
                  )}

                  {/* Status badge */}
                  <span style={{
                    fontSize: '10px', fontWeight: 600, padding: '3px 8px', borderRadius: '4px', flexShrink: 0,
                    backgroundColor: sc.bg, color: sc.color,
                  }}>{sc.label}</span>

                  {/* Deadline */}
                  {job.deadline && (() => {
                    const days = deadlineDays(job.deadline);
                    if (days < 0 || days > 14) return null;
                    return (
                      <span style={{ fontSize: '10px', color: days <= 3 ? '#ef4444' : '#555', flexShrink: 0, minWidth: '40px', textAlign: 'right' }}>
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

const BADGE_COLORS = ['#7c3aed','#2563eb','#0891b2','#059669','#d97706','#dc2626','#db2777','#7c3aed','#4f46e5','#0284c7','#16a34a','#ca8a04'];
function companyColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return BADGE_COLORS[Math.abs(h) % BADGE_COLORS.length];
}
