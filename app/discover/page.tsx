'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, RefreshCw, Plus, X, Loader, AlertCircle } from 'lucide-react';

interface Lead {
  id: number;
  company: string; title: string; type: string; location: string;
  fit_score: number; why: string; tags: string[];
}

interface ResearchRole { title: string; location: string; type: string; }

interface ResearchResult {
  company: string; what_they_do: string; size: string; stage: string;
  culture_signals: string[];
  roles: ResearchRole[];
  fit_score: number; fit_verdict: string; fit_reasoning: string;
  nicholas_angle: string; caveat: string;
}

const CACHE_KEY = 'discover-leads-v2';
const TTL = 10 * 60 * 1000;

const TYPE_LABELS: Record<string, string> = {
  'fall-2026-internship': 'Fall 2026', 'spring-2027-internship': 'Spring 2027',
  'summer-internship': 'Summer Intern', 'full-time': 'Full-Time',
};
const TYPE_COLORS: Record<string, string> = {
  'fall-2026-internship': '#7c3aed', 'spring-2027-internship': '#0891b2',
  'summer-internship': '#059669', 'full-time': '#2563eb',
};
const BADGE_COLORS = ['#7c3aed','#2563eb','#0891b2','#059669','#2563eb','#dc2626','#db2777','#4f46e5','#0284c7','#16a34a','#ca8a04'];
function badgeColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return BADGE_COLORS[Math.abs(h) % BADGE_COLORS.length];
}
function fitColor(s: number) { return s >= 8 ? '#059669' : s >= 6 ? '#2563eb' : s >= 4 ? '#d97706' : '#dc2626'; }
function verdictColor(v: string) {
  if (v === 'Strong Match') return '#059669'; if (v === 'Good Fit') return '#2563eb';
  if (v === 'Stretch') return '#d97706'; return '#dc2626';
}
function initials(name: string) { return name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase(); }
function isStudentFriendly(location: string) { return location === 'Remote' || location.toLowerCase().includes('miami'); }
function ageStr(ts: number) {
  const m = Math.round((Date.now() - ts) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`;
}

export default function DiscoverPage() {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [searchErr, setSearchErr] = useState('');

  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [leadsAge, setLeadsAge] = useState('');
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [saved, setSaved] = useState<Set<number>>(new Set());
  const [connectedCompanies, setConnectedCompanies] = useState<Set<string>>(new Set());

  const loadLeads = useCallback(async (force = false) => {
    if (!force) {
      try {
        const c = JSON.parse(sessionStorage.getItem(CACHE_KEY) || '{}');
        if (c.data && Date.now() - c.ts < TTL) {
          setLeads(c.data.map((l: Omit<Lead,'id'>, i: number) => ({ ...l, id: i })));
          setLeadsAge(ageStr(c.ts));
          return;
        }
      } catch { /* ignore */ }
    }
    setLeadsLoading(true);
    setDismissed(new Set());
    setSaved(new Set());
    try {
      const res = await fetch('/api/discover/suggestions');
      const data = await res.json();
      if (data.leads) {
        const withIds = data.leads.map((l: Omit<Lead,'id'>, i: number) => ({ ...l, id: i }));
        setLeads(withIds);
        setLeadsAge('just now');
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data: data.leads, ts: Date.now() }));
      }
    } catch { /* silently fail */ }
    setLeadsLoading(false);
  }, []);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  useEffect(() => {
    fetch('/api/connections')
      .then(r => r.json())
      .then((data: { company: string }[]) => {
        if (Array.isArray(data)) setConnectedCompanies(new Set(data.map(c => c.company)));
      })
      .catch(() => {});
  }, []);

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim() || searching) return;
    setSearching(true); setResult(null); setSearchErr('');
    try {
      const res = await fetch('/api/discover', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim() }),
      });
      const data = await res.json();
      if (data.error) setSearchErr(data.error); else setResult(data);
    } catch { setSearchErr('Search failed. Try again.'); }
    setSearching(false);
  };

  const saveLead = async (lead: Lead) => {
    if (saved.has(lead.id)) return;
    await fetch('/api/jobs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: lead.company, title: lead.title, type: lead.type, status: 'saved', location: lead.location, source: 'Discover', notes: lead.why }),
    });
    setSaved(prev => new Set([...prev, lead.id]));
  };

  const visible = leads.filter(l => !dismissed.has(l.id));

  return (
    <div className="page-container" style={{ minHeight: '100vh', backgroundColor: '#f1f5f9' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '22px' }}>
        <div>
          <h1 style={{ color: '#0f172a', fontSize: '18px', fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>Discover</h1>
          <p style={{ color: '#94a3b8', fontSize: '12px', margin: '4px 0 0' }}>Research companies · explore leads</p>
        </div>
        <button onClick={() => loadLeads(true)} disabled={leadsLoading} style={{
          display: 'inline-flex', alignItems: 'center', gap: '5px', backgroundColor: '#ffffff',
          color: '#94a3b8', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '6px 12px',
          fontSize: '11px', cursor: leadsLoading ? 'wait' : 'pointer', fontFamily: 'inherit',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}
          onMouseEnter={e => !leadsLoading && (e.currentTarget.style.color = '#3b82f6')}
          onMouseLeave={e => (e.currentTarget.style.color = '#94a3b8')}
        >
          <RefreshCw size={11} style={leadsLoading ? { animation: 'spin 1s linear infinite' } : {}} /> Refresh leads
        </button>
      </div>

      {/* Search bar */}
      <form onSubmit={handleSearch} style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', gap: '8px', maxWidth: '620px' }}>
          <input
            type="text" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search a company or role — e.g. 'CoStar', 'PropTech analyst', 'Anthropic'..."
            style={{
              flex: 1, backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px',
              padding: '11px 16px', color: '#0f172a', fontSize: '13px', outline: 'none', fontFamily: 'inherit',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
            onFocus={e => (e.target.style.borderColor = '#3b82f6')}
            onBlur={e => (e.target.style.borderColor = '#e2e8f0')}
          />
          <button type="submit" disabled={searching || !query.trim()} style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px', flexShrink: 0,
            background: searching || !query.trim() ? '#f1f5f9' : 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
            color: searching || !query.trim() ? '#94a3b8' : '#fff',
            border: searching || !query.trim() ? '1px solid #e2e8f0' : 'none',
            borderRadius: '10px', padding: '11px 20px',
            fontSize: '13px', fontWeight: 700, cursor: searching || !query.trim() ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            boxShadow: searching || !query.trim() ? 'none' : '0 4px 14px rgba(59,130,246,0.25)',
          }}>
            {searching
              ? <><Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> Searching…</>
              : <><Search size={13} /> Research</>}
          </button>
        </div>
        {searchErr && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#dc2626', fontSize: '12px', marginTop: '10px' }}>
            <AlertCircle size={12} /> {searchErr}
          </div>
        )}
      </form>

      {/* Research result */}
      {result && (
        <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '24px', marginBottom: '36px', animation: 'fadeIn 0.25s ease', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          {/* Top row */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '16px' }}>
            <div style={{
              width: '42px', height: '42px', borderRadius: '10px', flexShrink: 0,
              backgroundColor: badgeColor(result.company),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '14px', fontWeight: 800, color: '#fff', letterSpacing: '-0.5px',
            }}>{initials(result.company)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '4px' }}>
                <span style={{ color: '#0f172a', fontSize: '16px', fontWeight: 700 }}>{result.company}</span>
                <span style={{
                  backgroundColor: `${verdictColor(result.fit_verdict)}14`, border: `1px solid ${verdictColor(result.fit_verdict)}33`,
                  color: verdictColor(result.fit_verdict), borderRadius: '20px',
                  padding: '2px 10px', fontSize: '11px', fontWeight: 700,
                }}>{result.fit_verdict} · {result.fit_score}/10</span>
                {result.size !== 'Unknown' && <span style={{ color: '#94a3b8', fontSize: '11px' }}>{result.size}</span>}
                {result.stage && <span style={{ color: '#94a3b8', fontSize: '11px' }}>· {result.stage}</span>}
              </div>
              <p style={{ color: '#64748b', fontSize: '12px', margin: 0, lineHeight: 1.6 }}>{result.what_they_do}</p>
            </div>
          </div>

          {/* Culture signals */}
          {result.culture_signals?.length > 0 && (
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '20px' }}>
              {result.culture_signals.map((s, i) => (
                <span key={i} style={{ backgroundColor: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '20px', padding: '3px 9px', fontSize: '11px' }}>{s}</span>
              ))}
            </div>
          )}

          {/* Roles + Fit grid */}
          <div className="grid-2col" style={{ gap: '20px' }}>

            {/* Roles */}
            <div>
              <div style={{ marginBottom: '10px' }}>
                <div style={{ color: '#64748b', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Role Types to Search</div>
                <div style={{ color: '#94a3b8', fontSize: '10px', marginTop: '3px' }}>Suggestions — verify on their careers page</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                {result.roles?.map((role, i) => (
                  <div key={i} style={{ backgroundColor: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: '7px', padding: '10px 12px' }}>
                    <div style={{ color: '#334155', fontSize: '12px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{role.title}</div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '3px' }}>
                      <span style={{ color: TYPE_COLORS[role.type] || '#64748b', fontSize: '10px', fontWeight: 700 }}>{TYPE_LABELS[role.type] || role.type}</span>
                      <span style={{ color: '#cbd5e1', fontSize: '10px' }}>·</span>
                      <span style={{ color: '#94a3b8', fontSize: '10px' }}>{role.location}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Fit analysis */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ backgroundColor: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: '8px', padding: '13px 15px' }}>
                <div style={{ color: '#64748b', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '7px' }}>Why You Fit</div>
                <p style={{ color: '#475569', fontSize: '12px', margin: 0, lineHeight: 1.65 }}>{result.fit_reasoning}</p>
              </div>
              <div style={{ backgroundColor: 'rgba(59,130,246,0.04)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: '8px', padding: '13px 15px' }}>
                <div style={{ color: '#2563eb', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '7px' }}>Your Angle</div>
                <p style={{ color: '#2563eb', fontSize: '12px', margin: 0, lineHeight: 1.65 }}>{result.nicholas_angle}</p>
              </div>
              {result.caveat && (
                <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', padding: '2px 0' }}>
                  <span style={{ color: '#94a3b8', fontSize: '11px', flexShrink: 0, marginTop: '1px' }}>⚠</span>
                  <span style={{ color: '#64748b', fontSize: '11px', lineHeight: 1.55 }}>{result.caveat}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lead feed */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ color: '#64748b', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>For You</span>
            {leadsAge && !leadsLoading && <span style={{ color: '#cbd5e1', fontSize: '10px' }}>· {leadsAge}</span>}
          </div>
          <span style={{ color: '#94a3b8', fontSize: '11px' }}>AI-generated — verify openings on company sites</span>
        </div>

        {leadsLoading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#94a3b8', fontSize: '12px', padding: '48px 0' }}>
            <Loader size={14} color="#94a3b8" style={{ animation: 'spin 1s linear infinite' }} />
            Finding leads for you…
          </div>
        )}

        {!leadsLoading && leads.length > 0 && visible.length === 0 && (
          <div style={{ color: '#94a3b8', fontSize: '12px', padding: '32px 0' }}>
            All leads dismissed.{' '}
            <button onClick={() => loadLeads(true)} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '12px', padding: 0, fontFamily: 'inherit' }}>Refresh</button>
            {' '}for new ones.
          </div>
        )}

        {!leadsLoading && visible.length > 0 && (
          <div className="grid-3col">
            {visible.map(lead => {
              const isSaved = saved.has(lead.id);
              const friendly = lead.type !== 'full-time' && isStudentFriendly(lead.location);
              const color = badgeColor(lead.company);
              return (
                <div key={lead.id} style={{
                  backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px',
                  padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  transition: 'box-shadow 0.15s, border-color 0.15s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)'; }}
                >
                  {/* Top: badge + info + dismiss */}
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <div style={{
                        width: '32px', height: '32px', borderRadius: '7px',
                        backgroundColor: color,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '11px', fontWeight: 800, color: '#fff', letterSpacing: '-0.3px',
                      }}>{initials(lead.company)}</div>
                      {connectedCompanies.has(lead.company) && (
                        <div title="You have a connection at this company" style={{
                          position: 'absolute', top: '-3px', right: '-3px',
                          width: '9px', height: '9px', borderRadius: '50%',
                          backgroundColor: '#7c3aed', border: '1.5px solid #ffffff',
                        }} />
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#1e293b', fontSize: '12px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.company}</div>
                      <div style={{ color: '#64748b', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.title}</div>
                    </div>
                    <button onClick={() => setDismissed(prev => new Set([...prev, lead.id]))} style={{
                      background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', padding: '2px', display: 'flex', flexShrink: 0,
                    }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#94a3b8')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#cbd5e1')}
                    ><X size={13} /></button>
                  </div>

                  {/* Type + location + score */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                    <span style={{ color: TYPE_COLORS[lead.type] || '#64748b', fontSize: '10px', fontWeight: 700 }}>{TYPE_LABELS[lead.type] || lead.type}</span>
                    <span style={{ color: '#cbd5e1', fontSize: '10px' }}>·</span>
                    <span style={{ color: '#64748b', fontSize: '10px' }}>{lead.location}</span>
                    {lead.type !== 'full-time' && (
                      <span style={{
                        fontSize: '9px', fontWeight: 600, padding: '1px 5px', borderRadius: '3px',
                        backgroundColor: friendly ? 'rgba(5,150,105,0.07)' : 'rgba(220,38,38,0.07)',
                        color: friendly ? '#059669' : '#dc2626',
                      }}>{friendly ? 'Student-friendly' : 'On-site only'}</span>
                    )}
                    <span style={{ marginLeft: 'auto', color: fitColor(lead.fit_score), fontSize: '13px', fontWeight: 800 }}>{lead.fit_score}/10</span>
                  </div>

                  {/* Why */}
                  <p style={{ color: '#475569', fontSize: '11px', lineHeight: 1.6, margin: 0 }}>{lead.why}</p>

                  {/* Tags */}
                  {lead.tags?.length > 0 && (
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {lead.tags.map((t, i) => (
                        <span key={i} style={{ backgroundColor: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '3px', padding: '2px 7px', fontSize: '10px' }}>{t}</span>
                      ))}
                    </div>
                  )}

                  {/* Save button */}
                  <button onClick={() => saveLead(lead)} disabled={isSaved} style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                    backgroundColor: isSaved ? 'rgba(5,150,105,0.06)' : '#f8fafc',
                    color: isSaved ? '#059669' : '#94a3b8',
                    border: `1px solid ${isSaved ? 'rgba(5,150,105,0.3)' : '#e2e8f0'}`,
                    borderRadius: '6px', padding: '8px', fontSize: '11px', fontWeight: 600,
                    cursor: isSaved ? 'default' : 'pointer', fontFamily: 'inherit', width: '100%',
                    transition: 'all 0.15s',
                  }}
                    onMouseEnter={e => { if (!isSaved) { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(59,130,246,0.3)'; (e.currentTarget as HTMLButtonElement).style.color = '#3b82f6'; } }}
                    onMouseLeave={e => { if (!isSaved) { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e2e8f0'; (e.currentTarget as HTMLButtonElement).style.color = '#94a3b8'; } }}
                  >
                    {isSaved ? '✓ Saved to Tracker' : <><Plus size={11} /> Save to Tracker</>}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
