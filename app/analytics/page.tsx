'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, Target, Zap, Clock } from 'lucide-react';

interface AnalyticsData {
  statusCounts: Record<string, number>;
  avgScore: number | null;
  responseRate: number | null;
  totalJobs: number;
  weeks: { label: string; count: number }[];
  scoreBuckets: { label: string; min: number; max: number; count: number }[];
  avgDaysToStage: Record<string, number | null>;
}

const STATUS_COLORS: Record<string, string> = {
  saved: '#64748b',
  applied: '#6366f1',
  interviewing: '#3b82f6',
  offer: '#10b981',
  rejected: '#ef4444',
};
const STATUS_LABELS: Record<string, string> = {
  saved: 'Saved', applied: 'Applied', interviewing: 'Interviewing', offer: 'Offers', rejected: 'Rejected',
};

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/analytics').then(r => r.json()).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ padding: '40px', color: '#94a3b8', fontSize: '13px' }}>Loading analytics…</div>
  );

  if (!data || data.totalJobs === 0) return (
    <div style={{ padding: '40px 36px', backgroundColor: '#f1f5f9', minHeight: '100vh' }}>
      <h1 style={{ color: '#0f172a', fontSize: '20px', fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.02em' }}>Analytics</h1>
      <p style={{ color: '#94a3b8', fontSize: '13px', margin: 0 }}>Import some jobs to see your stats here.</p>
    </div>
  );

  const maxWeekCount = Math.max(...data.weeks.map(w => w.count), 1);
  const maxStatusCount = Math.max(...Object.values(data.statusCounts), 1);
  const pipeline = ['saved', 'applied', 'interviewing', 'offer'];

  return (
    <div className="page-container" style={{ minHeight: '100vh', backgroundColor: '#f1f5f9' }}>

      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ color: '#0f172a', fontSize: '20px', fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.02em' }}>Analytics</h1>
        <p style={{ color: '#94a3b8', fontSize: '12px', margin: 0 }}>{data.totalJobs} job{data.totalJobs !== 1 ? 's' : ''} tracked</p>
      </div>

      {/* Key metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
        {[
          {
            icon: <TrendingUp size={16} color="#6366f1" />,
            label: 'Total Tracked',
            value: data.totalJobs,
            sub: 'all time',
            color: '#6366f1',
          },
          {
            icon: <Target size={16} color="#3b82f6" />,
            label: 'Response Rate',
            value: data.responseRate != null ? `${data.responseRate}%` : '—',
            sub: 'interviews + offers / applied',
            color: '#3b82f6',
          },
          {
            icon: <Zap size={16} color="#10b981" />,
            label: 'Avg Fit Score',
            value: data.avgScore != null ? `${data.avgScore}/10` : '—',
            sub: 'across scored jobs',
            color: '#10b981',
          },
          {
            icon: <Clock size={16} color="#8b5cf6" />,
            label: 'Active Pipeline',
            value: (data.statusCounts.applied || 0) + (data.statusCounts.interviewing || 0),
            sub: 'applied + interviewing',
            color: '#8b5cf6',
          },
        ].map(m => (
          <div key={m.label} style={{
            backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px',
            padding: '18px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '10px' }}>
              {m.icon}
              <span style={{ color: '#94a3b8', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{m.label}</span>
            </div>
            <div style={{ color: m.color, fontSize: '28px', fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{m.value}</div>
            <div style={{ color: '#94a3b8', fontSize: '10px', marginTop: '5px' }}>{m.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>

        {/* Pipeline funnel */}
        <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ color: '#64748b', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '16px' }}>Pipeline Funnel</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {pipeline.map(status => {
              const count = data.statusCounts[status] || 0;
              const pct = Math.round((count / maxStatusCount) * 100);
              return (
                <div key={status}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                    <span style={{ color: '#475569', fontSize: '12px', fontWeight: 500 }}>{STATUS_LABELS[status]}</span>
                    <span style={{ color: STATUS_COLORS[status], fontSize: '13px', fontWeight: 700 }}>{count}</span>
                  </div>
                  <div style={{ height: '7px', backgroundColor: '#f1f5f9', borderRadius: '10px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${pct}%`, borderRadius: '10px',
                      backgroundColor: STATUS_COLORS[status],
                      opacity: 0.85,
                      transition: 'width 0.6s ease',
                    }} />
                  </div>
                </div>
              );
            })}
            {(data.statusCounts.rejected || 0) > 0 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                  <span style={{ color: '#475569', fontSize: '12px', fontWeight: 500 }}>Rejected</span>
                  <span style={{ color: '#ef4444', fontSize: '13px', fontWeight: 700 }}>{data.statusCounts.rejected}</span>
                </div>
                <div style={{ height: '7px', backgroundColor: '#f1f5f9', borderRadius: '10px', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${Math.round((data.statusCounts.rejected / maxStatusCount) * 100)}%`,
                    borderRadius: '10px', backgroundColor: '#ef4444', opacity: 0.7,
                  }} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Weekly activity */}
        <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ color: '#64748b', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '16px' }}>Weekly Activity</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '90px' }}>
            {data.weeks.map((w, i) => {
              const h = maxWeekCount > 0 ? Math.max((w.count / maxWeekCount) * 90, w.count > 0 ? 8 : 2) : 2;
              const isLast = i === data.weeks.length - 1;
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', height: '100%', justifyContent: 'flex-end' }}>
                  <div style={{ color: '#94a3b8', fontSize: '9px', fontWeight: 600 }}>{w.count > 0 ? w.count : ''}</div>
                  <div style={{
                    width: '100%', height: `${h}px`, borderRadius: '4px',
                    backgroundColor: isLast ? '#3b82f6' : w.count > 0 ? '#6366f1' : '#e2e8f0',
                    opacity: isLast ? 1 : w.count > 0 ? 0.7 : 1,
                    transition: 'height 0.4s ease',
                  }} />
                  <div style={{ color: '#cbd5e1', fontSize: '8px', textAlign: 'center', lineHeight: 1.2 }}>
                    {w.label.split(' ')[1]}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: '8px', color: '#94a3b8', fontSize: '10px', textAlign: 'center' }}>Last 8 weeks · blue = this week</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

        {/* Score distribution */}
        <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ color: '#64748b', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '16px' }}>Fit Score Distribution</div>
          {data.scoreBuckets.every(b => b.count === 0) ? (
            <div style={{ color: '#94a3b8', fontSize: '12px', padding: '20px 0' }}>Run AI analysis on your jobs to see scores.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {data.scoreBuckets.map(b => {
                const maxBucket = Math.max(...data.scoreBuckets.map(x => x.count), 1);
                const pct = Math.round((b.count / maxBucket) * 100);
                const color = b.min >= 9 ? '#10b981' : b.min >= 7 ? '#3b82f6' : b.min >= 5 ? '#06b6d4' : '#ef4444';
                return (
                  <div key={b.label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ color: '#475569', fontSize: '11px' }}>{b.label}</span>
                      <span style={{ color, fontSize: '11px', fontWeight: 700 }}>{b.count}</span>
                    </div>
                    <div style={{ height: '6px', backgroundColor: '#f1f5f9', borderRadius: '10px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, borderRadius: '10px', backgroundColor: color, opacity: 0.8 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Avg days to stage */}
        <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ color: '#64748b', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '16px' }}>Avg Days to Stage Change</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {(['applied', 'interviewing', 'offer', 'rejected'] as const).map(stage => {
              const days = data.avgDaysToStage[stage];
              return (
                <div key={stage} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', backgroundColor: '#f8fafc', borderRadius: '10px', border: '1px solid #f1f5f9' }}>
                  <span style={{ color: '#475569', fontSize: '12px', fontWeight: 500 }}>{STATUS_LABELS[stage]}</span>
                  <span style={{ color: days != null ? STATUS_COLORS[stage] : '#cbd5e1', fontSize: '13px', fontWeight: 700 }}>
                    {days != null ? `${days}d` : '—'}
                  </span>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: '12px', color: '#cbd5e1', fontSize: '10px' }}>From date added → status change</div>
        </div>
      </div>
    </div>
  );
}
