'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Zap, AlertTriangle, Clock, MessageSquare, ChevronRight, Loader, AlertCircle, ExternalLink } from 'lucide-react';

interface Job {
  id: number; company: string; title: string; status: string;
  deadline: string | null; status_updated_at: string | null; starred: number;
}

interface Priority {
  level: 'urgent' | 'soon' | 'followup' | 'interview';
  label: string; sub: string; href: string;
}

interface JdResult {
  fit_score: number; verdict: string; what_you_have: string[];
  what_you_lack: string[]; how_to_position: string; should_apply: boolean;
  role_type: string; top_keywords: string[];
}

interface Brief {
  headline: string;
  priority_actions: { action: string; urgency: string; reason: string }[];
  this_week_focus: string;
  honest_assessment: string;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function getPriorities(jobs: Job[]): Priority[] {
  const now = new Date();
  const result: Priority[] = [];
  for (const j of jobs) {
    if (!j.deadline || j.status === 'rejected' || j.status === 'offer') continue;
    const days = Math.ceil((new Date(j.deadline).getTime() - now.getTime()) / 86400000);
    if (days < 0) continue;
    if (days <= 3) result.push({ level: 'urgent', label: `Apply — ${j.title} at ${j.company}`, sub: `Deadline in ${days} day${days !== 1 ? 's' : ''}`, href: '/tracker' });
    else if (days <= 7) result.push({ level: 'soon', label: `Deadline coming — ${j.company}`, sub: `${j.title} · ${days} days left`, href: '/tracker' });
  }
  for (const j of jobs) {
    if (j.status !== 'applied' || !j.status_updated_at) continue;
    const days = Math.floor((now.getTime() - new Date(j.status_updated_at).getTime()) / 86400000);
    if (days >= 14) result.push({ level: 'followup', label: `Follow up — ${j.company}`, sub: `${j.title} · applied ${days} days ago`, href: '/tracker' });
  }
  for (const j of jobs) {
    if (j.status === 'interviewing') result.push({ level: 'interview', label: `Interview prep — ${j.company}`, sub: j.title, href: '/coach' });
  }
  return result;
}

const LEVEL_CONFIG = {
  urgent:   { bg: '#1a0808', border: '#7f1d1d', icon: <AlertTriangle size={13} color="#ef4444" />, tag: 'Urgent', tagColor: '#ef4444' },
  soon:     { bg: '#1a1200', border: '#713f12', icon: <Clock size={13} color="#f59e0b" />, tag: 'Soon', tagColor: '#f59e0b' },
  followup: { bg: '#0e0a1a', border: '#4c1d95', icon: <MessageSquare size={13} color="#a855f7" />, tag: 'Follow Up', tagColor: '#a855f7' },
  interview:{ bg: '#081808', border: '#14532d', icon: <Zap size={13} color="#22c55e" />, tag: 'Prep', tagColor: '#22c55e' },
};

function scoreColor(s: number) {
  if (s >= 8) return '#22c55e'; if (s >= 6) return '#f59e0b'; if (s >= 4) return '#f97316'; return '#ef4444';
}
function verdictColor(v: string) {
  if (v === 'Strong Match') return '#22c55e'; if (v === 'Good Fit') return '#f59e0b'; if (v === 'Stretch') return '#f97316'; return '#ef4444';
}

export default function DashboardPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jd, setJd] = useState('');
  const [jdLoading, setJdLoading] = useState(false);
  const [jdResult, setJdResult] = useState<JdResult | null>(null);
  const [jdError, setJdError] = useState('');
  const [brief, setBrief] = useState<Brief | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError] = useState('');

  useEffect(() => { fetch('/api/jobs').then(r => r.json()).then(setJobs).catch(() => {}); }, []);

  const analyzeJd = async () => {
    if (!jd.trim()) return;
    setJdLoading(true); setJdError(''); setJdResult(null);
    try {
      const res = await fetch('/api/analyze/jd', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jd }) });
      const data = await res.json();
      if (data.error) setJdError(data.error); else setJdResult(data);
    } catch { setJdError('Analysis failed. Try again.'); }
    setJdLoading(false);
  };

  const generateBrief = async () => {
    setBriefLoading(true); setBriefError(''); setBrief(null);
    try {
      const res = await fetch('/api/brief');
      const data = await res.json();
      if (data.error) setBriefError(data.error); else setBrief(data);
    } catch { setBriefError('Failed to generate.'); }
    setBriefLoading(false);
  };

  const stats = {
    total: jobs.length,
    applied: jobs.filter(j => j.status === 'applied').length,
    interviewing: jobs.filter(j => j.status === 'interviewing').length,
    offers: jobs.filter(j => j.status === 'offer').length,
    deadlines: jobs.filter(j => {
      if (!j.deadline || j.status === 'rejected') return false;
      const d = (new Date(j.deadline).getTime() - Date.now()) / 86400000;
      return d >= 0 && d <= 7;
    }).length,
  };

  const priorities = getPriorities(jobs);
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const inputStyle: React.CSSProperties = {
    width: '100%', backgroundColor: '#111', border: '1px solid #1e1e1e',
    borderRadius: '8px', padding: '10px 14px', color: '#e8e8e8', fontSize: '13px',
    outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
  };

  return (
    <div style={{ padding: '32px 36px', minHeight: '100vh', backgroundColor: '#0a0a0a', maxWidth: '1000px' }}>

      {/* Greeting */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ color: '#f0f0f0', fontSize: '22px', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
          {greeting()}, Nicholas
        </h1>
        <p style={{ color: '#333', fontSize: '12px', margin: '4px 0 0' }}>{today}</p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', marginBottom: '32px' }}>
        {[
          { label: 'Tracked', value: stats.total, color: '#e8e8e8', glow: '' },
          { label: 'Applied', value: stats.applied, color: '#3b82f6', glow: 'rgba(59,130,246,0.15)' },
          { label: 'Interviewing', value: stats.interviewing, color: '#f59e0b', glow: 'rgba(245,158,11,0.15)' },
          { label: 'Offers', value: stats.offers, color: '#22c55e', glow: 'rgba(34,197,94,0.15)' },
          { label: 'Due this week', value: stats.deadlines, color: stats.deadlines > 0 ? '#ef4444' : '#3a3a3a', glow: 'rgba(239,68,68,0.15)' },
        ].map(s => (
          <div key={s.label} style={{
            backgroundColor: '#0f0f0f', border: '1px solid #1a1a1a', borderRadius: '10px', padding: '16px 14px',
            boxShadow: s.glow && s.value > 0 ? `0 0 20px ${s.glow}` : 'none',
          }}>
            <div style={{ color: s.value > 0 ? s.color : '#222', fontSize: '30px', fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
            <div style={{ color: '#3a3a3a', fontSize: '11px', marginTop: '6px', fontWeight: 500 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '28px' }}>

        {/* Priorities */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ color: '#555', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Today&apos;s Priorities</span>
            <Link href="/tracker" style={{ color: '#333', fontSize: '11px', textDecoration: 'none' }}
              onMouseEnter={e => ((e.currentTarget as HTMLAnchorElement).style.color = '#888')}
              onMouseLeave={e => ((e.currentTarget as HTMLAnchorElement).style.color = '#333')}>
              View all →
            </Link>
          </div>
          {priorities.length === 0 ? (
            <div style={{ backgroundColor: '#0f0f0f', border: '1px solid #1a1a1a', borderRadius: '10px', padding: '32px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: '20px', marginBottom: '8px' }}>✓</div>
              <div style={{ color: '#333', fontSize: '13px' }}>All caught up.</div>
              <div style={{ color: '#282828', fontSize: '12px', marginTop: '4px' }}>Add more jobs to keep momentum.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              {priorities.slice(0, 6).map((p, i) => {
                const c = LEVEL_CONFIG[p.level];
                return (
                  <Link key={i} href={p.href} style={{
                    display: 'flex', alignItems: 'flex-start', gap: '10px',
                    backgroundColor: c.bg, border: `1px solid ${c.border}`,
                    borderRadius: '8px', padding: '11px 13px', textDecoration: 'none',
                  }}
                    onMouseEnter={e => ((e.currentTarget as HTMLAnchorElement).style.opacity = '0.8')}
                    onMouseLeave={e => ((e.currentTarget as HTMLAnchorElement).style.opacity = '1')}>
                    <div style={{ flexShrink: 0, marginTop: '1px' }}>{c.icon}</div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ color: '#d0d0d0', fontSize: '12px', fontWeight: 600, lineHeight: 1.3 }}>{p.label}</div>
                      <div style={{ color: '#555', fontSize: '11px', marginTop: '2px' }}>{p.sub}</div>
                    </div>
                    <span style={{ fontSize: '9px', fontWeight: 700, color: c.tagColor, flexShrink: 0, marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{c.tag}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Weekly Brief */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ color: '#555', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Weekly Brief</span>
            <button onClick={generateBrief} disabled={briefLoading} style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              backgroundColor: '#0f0f0f', color: briefLoading ? '#444' : '#f59e0b',
              border: '1px solid #1e1e1e', borderRadius: '6px', padding: '5px 12px',
              fontSize: '11px', fontWeight: 600, cursor: briefLoading ? 'wait' : 'pointer', fontFamily: 'inherit',
            }}>
              {briefLoading ? <><Loader size={10} style={{ animation: 'spin 1s linear infinite' }} /> Generating...</> : '⚡ Generate'}
            </button>
          </div>
          {!brief && !briefLoading && !briefError && (
            <div style={{ backgroundColor: '#0f0f0f', border: '1px solid #1a1a1a', borderRadius: '10px', padding: '32px 20px', textAlign: 'center' }}>
              <div style={{ color: '#282828', fontSize: '13px' }}>Hit Generate for your weekly snapshot</div>
            </div>
          )}
          {briefError && <div style={{ color: '#f87171', fontSize: '12px', padding: '12px' }}>{briefError}</div>}
          {brief && (
            <div style={{ backgroundColor: '#0f0f0f', border: '1px solid #1a1a1a', borderRadius: '10px', padding: '18px', animation: 'fadeIn 0.3s ease', overflowY: 'auto', maxHeight: '360px' }}>
              <p style={{ color: '#e0e0e0', fontSize: '13px', fontWeight: 600, margin: '0 0 14px', lineHeight: 1.5 }}>{brief.headline}</p>
              {brief.priority_actions?.slice(0, 3).map((a, i) => (
                <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'flex-start' }}>
                  <span style={{
                    fontSize: '9px', fontWeight: 700, padding: '2px 5px', borderRadius: '3px', flexShrink: 0, marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.05em',
                    backgroundColor: a.urgency === 'today' ? '#7f1d1d' : a.urgency === 'this-week' ? '#713f12' : '#1a1a1a',
                    color: a.urgency === 'today' ? '#fca5a5' : a.urgency === 'this-week' ? '#fde68a' : '#555',
                  }}>{a.urgency}</span>
                  <div style={{ color: '#aaa', fontSize: '12px', lineHeight: 1.4 }}>{a.action}</div>
                </div>
              ))}
              {brief.this_week_focus && (
                <div style={{ borderTop: '1px solid #1a1a1a', marginTop: '14px', paddingTop: '14px' }}>
                  <div style={{ color: '#444', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px' }}>Focus this week</div>
                  <p style={{ color: '#777', fontSize: '12px', margin: 0, lineHeight: 1.6 }}>{brief.this_week_focus}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* JD Analyzer */}
      <div style={{ backgroundColor: '#0f0f0f', border: '1px solid #1a1a1a', borderRadius: '12px', padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <span style={{ color: '#555', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Job Fit Analyzer</span>
          <span style={{ color: '#2a2a2a', fontSize: '11px' }}>Paste any JD → instant fit score</span>
        </div>
        <textarea
          value={jd} onChange={e => setJd(e.target.value)}
          placeholder="Paste a job description here..."
          rows={4}
          style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6, marginBottom: '10px' }}
          onFocus={e => (e.target.style.borderColor = '#f59e0b')}
          onBlur={e => (e.target.style.borderColor = '#1e1e1e')}
        />
        <button onClick={analyzeJd} disabled={jdLoading || !jd.trim()} style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          backgroundColor: !jd.trim() ? '#161616' : '#f59e0b',
          color: !jd.trim() ? '#333' : '#000',
          border: 'none', borderRadius: '7px', padding: '9px 20px',
          fontSize: '13px', fontWeight: 700, cursor: !jd.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
        }}>
          {jdLoading ? <><Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> Analyzing...</> : <><Zap size={13} /> Analyze Fit</>}
        </button>

        {jdError && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#f87171', fontSize: '12px', marginTop: '12px' }}>
            <AlertCircle size={13} /> {jdError}
          </div>
        )}

        {jdResult && (
          <div style={{ marginTop: '20px', borderTop: '1px solid #1a1a1a', paddingTop: '20px', animation: 'fadeIn 0.3s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
              <div style={{
                width: '72px', height: '72px', borderRadius: '50%', flexShrink: 0,
                border: `3px solid ${scoreColor(jdResult.fit_score)}`,
                boxShadow: `0 0 24px ${scoreColor(jdResult.fit_score)}44`,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: '24px', fontWeight: 800, color: scoreColor(jdResult.fit_score), lineHeight: 1 }}>{jdResult.fit_score}</span>
                <span style={{ fontSize: '10px', color: '#555' }}>/10</span>
              </div>
              <div>
                <div style={{ color: verdictColor(jdResult.verdict), fontSize: '17px', fontWeight: 700 }}>{jdResult.verdict}</div>
                <div style={{ color: '#555', fontSize: '12px', marginTop: '2px' }}>{jdResult.role_type}</div>
                <div style={{
                  display: 'inline-block', marginTop: '7px', padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700,
                  backgroundColor: jdResult.should_apply ? '#14532d' : '#7f1d1d',
                  color: jdResult.should_apply ? '#86efac' : '#fca5a5',
                }}>{jdResult.should_apply ? '✓ Apply' : '✗ Skip'}</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <div style={{ color: '#22c55e', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>You have</div>
                {jdResult.what_you_have.map((s, i) => (
                  <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '5px', alignItems: 'flex-start' }}>
                    <span style={{ color: '#22c55e', flexShrink: 0, marginTop: '1px' }}>✓</span>
                    <span style={{ color: '#888', fontSize: '12px', lineHeight: 1.4 }}>{s}</span>
                  </div>
                ))}
              </div>
              {jdResult.what_you_lack.length > 0 && (
                <div>
                  <div style={{ color: '#ef4444', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>Gaps</div>
                  {jdResult.what_you_lack.map((s, i) => (
                    <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '5px', alignItems: 'flex-start' }}>
                      <span style={{ color: '#ef4444', flexShrink: 0, marginTop: '1px' }}>✗</span>
                      <span style={{ color: '#888', fontSize: '12px', lineHeight: 1.4 }}>{s}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ backgroundColor: '#111', borderRadius: '8px', padding: '12px 14px', marginBottom: '12px' }}>
              <div style={{ color: '#444', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px' }}>How to position</div>
              <p style={{ color: '#999', fontSize: '12px', margin: 0, lineHeight: 1.6 }}>{jdResult.how_to_position}</p>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '14px' }}>
              {jdResult.top_keywords.map((k, i) => (
                <span key={i} style={{ backgroundColor: '#161616', color: '#777', border: '1px solid #252525', borderRadius: '4px', padding: '3px 8px', fontSize: '11px' }}>{k}</span>
              ))}
            </div>
            <button onClick={() => window.location.href = `/coach?prefill=jd-fit`} style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              backgroundColor: 'transparent', color: '#a855f7', border: '1px solid #3b1f6e',
              borderRadius: '6px', padding: '7px 14px', fontSize: '12px', fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              <ExternalLink size={12} /> Discuss in Coach
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
