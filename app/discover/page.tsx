'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, RefreshCw, Plus, X, Loader, AlertCircle } from 'lucide-react'; // Plus used by lead save button

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
function fitColor(s: number) { return s >= 8 ? '#22c55e' : s >= 6 ? '#3b82f6' : s >= 4 ? '#f97316' : '#ef4444'; }
function verdictColor(v: string) {
  if (v === 'Strong Match') return '#22c55e'; if (v === 'Good Fit') return '#3b82f6';
  if (v === 'Stretch') return '#f97316'; return '#ef4444';
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
    <div style={{ padding: '28px 32px', minHeight: '100vh', backgroundColor: '#0d1e30' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '22px' }}>
        <div>
          <h1 style={{ color: '#eaf2ff', fontSize: '18px', fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>Discover</h1>
          <p style={{ color: '#3c5875', fontSize: '12px', margin: '4px 0 0' }}>Research companies · explore leads</p>
        </div>
        <button onClick={() => loadLeads(true)} disabled={leadsLoading} style={{
          display: 'inline-flex', alignItems: 'center', gap: '5px', backgroundColor: 'transparent',
          color: '#3c5875', border: '1px solid #1e3d5c', borderRadius: '10px', padding: '6px 12px',
          fontSize: '11px', cursor: leadsLoading ? 'wait' : 'pointer', fontFamily: 'inherit',
        }}
          onMouseEnter={e => !leadsLoading && (e.currentTarget.style.color = '#628aaa')}
          onMouseLeave={e => (e.currentTarget.style.color = '#3c5875')}
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
              flex: 1, backgroundColor: '#152845', border: '1px solid #1e3d5c', borderRadius: '14px',
              padding: '11px 16px', color: '#eaf2ff', fontSize: '13px', outline: 'none', fontFamily: 'inherit',
            }}
            onFocus={e => (e.target.style.borderColor = '#3b82f6')}
            onBlur={e => (e.target.style.borderColor = '#1e3d5c')}
          />
          <button type="submit" disabled={searching || !query.trim()} style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px', flexShrink: 0,
            backgroundColor: searching || !query.trim() ? '#1a2e4a' : '#2563eb',
            color: searching || !query.trim() ? '#507090' : '#000',
            border: 'none', borderRadius: '10px', padding: '11px 20px',
            fontSize: '13px', fontWeight: 700, cursor: searching || !query.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
          }}>
            {searching
              ? <><Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> Searching…</>
              : <><Search size={13} /> Research</>}
          </button>
        </div>
        {searchErr && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#f87171', fontSize: '12px', marginTop: '10px' }}>
            <AlertCircle size={12} /> {searchErr}
          </div>
        )}
      </form>

      {/* Research result */}
      {result && (
        <div style={{ backgroundColor: '#152845', border: '1px solid #1e3d5c', borderRadius: '14px', padding: '24px', marginBottom: '36px', animation: 'fadeIn 0.25s ease' }}>
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
                <span style={{ color: '#eaf2ff', fontSize: '16px', fontWeight: 700 }}>{result.company}</span>
                <span style={{
                  backgroundColor: `${verdictColor(result.fit_verdict)}1a`, border: `1px solid ${verdictColor(result.fit_verdict)}33`,
                  color: verdictColor(result.fit_verdict), borderRadius: '20px',
                  padding: '2px 10px', fontSize: '11px', fontWeight: 700,
                }}>{result.fit_verdict} · {result.fit_score}/10</span>
                {result.size !== 'Unknown' && <span style={{ color: '#3c5875', fontSize: '11px' }}>{result.size}</span>}
                {result.stage && <span style={{ color: '#3c5875', fontSize: '11px' }}>· {result.stage}</span>}
              </div>
              <p style={{ color: '#507090', fontSize: '12px', margin: 0, lineHeight: 1.6 }}>{result.what_they_do}</p>
            </div>
          </div>

          {/* Culture signals */}
          {result.culture_signals?.length > 0 && (
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '20px' }}>
              {result.culture_signals.map((s, i) => (
                <span key={i} style={{ backgroundColor: '#1a2e48', color: '#507090', border: '1px solid #1e3d5c', borderRadius: '20px', padding: '3px 9px', fontSize: '11px' }}>{s}</span>
              ))}
            </div>
          )}

          {/* Roles + Fit grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

            {/* Roles */}
            <div>
              <div style={{ marginBottom: '10px' }}>
                <div style={{ color: '#3c5875', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Role Types to Search</div>
                <div style={{ color: '#3c5875', fontSize: '10px', marginTop: '3px' }}>Suggestions — verify on their careers page</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                {result.roles?.map((role, i) => {
                  return (
                    <div key={i} style={{ backgroundColor: '#152845', borderRadius: '7px', padding: '10px 12px' }}>
                      <div style={{ color: '#d5e5f5', fontSize: '12px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{role.title}</div>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '3px' }}>
                        <span style={{ color: TYPE_COLORS[role.type] || '#507090', fontSize: '10px', fontWeight: 700 }}>{TYPE_LABELS[role.type] || role.type}</span>
                        <span style={{ color: '#3c5875', fontSize: '10px' }}>·</span>
                        <span style={{ color: '#507090', fontSize: '10px' }}>{role.location}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Fit analysis */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ backgroundColor: '#111', borderRadius: '8px', padding: '13px 15px' }}>
                <div style={{ color: '#333', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '7px' }}>Why You Fit</div>
                <p style={{ color: '#666', fontSize: '12px', margin: 0, lineHeight: 1.65 }}>{result.fit_reasoning}</p>
              </div>
              <div style={{ backgroundColor: '#0d1e30', border: '1px solid #1a2e48', borderRadius: '8px', padding: '13px 15px' }}>
                <div style={{ color: '#60a5fa', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '7px' }}>Your Angle</div>
                <p style={{ color: '#60a5fa', fontSize: '12px', margin: 0, lineHeight: 1.65 }}>{result.nicholas_angle}</p>
              </div>
              {result.caveat && (
                <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', padding: '2px 0' }}>
                  <span style={{ color: '#333', fontSize: '11px', flexShrink: 0, marginTop: '1px' }}>⚠</span>
                  <span style={{ color: '#2e2e2e', fontSize: '11px', lineHeight: 1.55 }}>{result.caveat}</span>
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
            <span style={{ color: '#333', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>For You</span>
            {leadsAge && !leadsLoading && <span style={{ color: '#1e1e1e', fontSize: '10px' }}>· {leadsAge}</span>}
          </div>
          <span style={{ color: '#1e1e1e', fontSize: '11px' }}>AI-generated — verify openings on company sites</span>
        </div>

        {leadsLoading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#2a2a2a', fontSize: '12px', padding: '48px 0' }}>
            <Loader size={14} color="#333" style={{ animation: 'spin 1s linear infinite' }} />
            Finding leads for you…
          </div>
        )}

        {!leadsLoading && leads.length > 0 && visible.length === 0 && (
          <div style={{ color: '#2a2a2a', fontSize: '12px', padding: '32px 0' }}>
            All leads dismissed.{' '}
            <button onClick={() => loadLeads(true)} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '12px', padding: 0, fontFamily: 'inherit' }}>Refresh</button>
            {' '}for new ones.
          </div>
        )}

        {!leadsLoading && visible.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            {visible.map(lead => {
              const isSaved = saved.has(lead.id);
              const friendly = lead.type !== 'full-time' && isStudentFriendly(lead.location);
              const color = badgeColor(lead.company);
              return (
                <div key={lead.id} style={{
                  backgroundColor: '#152845', border: '1px solid #181818', borderRadius: '10px',
                  padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px',
                }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = '#242424')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = '#181818')}
                >
                  {/* Top: badge + info + dismiss */}
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <div style={{
                      width: '32px', height: '32px', borderRadius: '7px', flexShrink: 0,
                      backgroundColor: color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '11px', fontWeight: 800, color: '#fff', letterSpacing: '-0.3px',
                    }}>{initials(lead.company)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#d0d0d0', fontSize: '12px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.company}</div>
                      <div style={{ color: '#4a4a4a', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.title}</div>
                    </div>
                    <button onClick={() => setDismissed(prev => new Set([...prev, lead.id]))} style={{
                      background: 'none', border: 'none', color: '#222', cursor: 'pointer', padding: '2px', display: 'flex', flexShrink: 0,
                    }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#555')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#222')}
                    ><X size={13} /></button>
                  </div>

                  {/* Type + location + score */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                    <span style={{ color: TYPE_COLORS[lead.type] || '#555', fontSize: '10px', fontWeight: 700 }}>{TYPE_LABELS[lead.type] || lead.type}</span>
                    <span style={{ color: '#222', fontSize: '10px' }}>·</span>
                    <span style={{ color: '#3a3a3a', fontSize: '10px' }}>{lead.location}</span>
                    {lead.type !== 'full-time' && (
                      <span style={{
                        fontSize: '9px', fontWeight: 600, padding: '1px 5px', borderRadius: '3px',
                        backgroundColor: friendly ? '#081408' : '#180e00',
                        color: friendly ? '#22c55e' : '#f97316',
                      }}>{friendly ? 'Student-friendly' : 'On-site only'}</span>
                    )}
                    <span style={{ marginLeft: 'auto', color: fitColor(lead.fit_score), fontSize: '13px', fontWeight: 800 }}>{lead.fit_score}/10</span>
                  </div>

                  {/* Why */}
                  <p style={{ color: '#4a4a4a', fontSize: '11px', lineHeight: 1.6, margin: 0 }}>{lead.why}</p>

                  {/* Tags */}
                  {lead.tags?.length > 0 && (
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {lead.tags.map((t, i) => (
                        <span key={i} style={{ backgroundColor: '#131313', color: '#2e2e2e', border: '1px solid #1c1c1c', borderRadius: '3px', padding: '2px 7px', fontSize: '10px' }}>{t}</span>
                      ))}
                    </div>
                  )}

                  {/* Save button */}
                  <button onClick={() => saveLead(lead)} disabled={isSaved} style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                    backgroundColor: isSaved ? '#081408' : '#111',
                    color: isSaved ? '#22c55e' : '#555',
                    border: `1px solid ${isSaved ? '#166534' : '#1e1e1e'}`,
                    borderRadius: '6px', padding: '8px', fontSize: '11px', fontWeight: 600,
                    cursor: isSaved ? 'default' : 'pointer', fontFamily: 'inherit', width: '100%',
                    transition: 'all 0.15s',
                  }}
                    onMouseEnter={e => { if (!isSaved) { (e.currentTarget as HTMLButtonElement).style.borderColor = '#2563eb'; (e.currentTarget as HTMLButtonElement).style.color = '#2563eb'; } }}
                    onMouseLeave={e => { if (!isSaved) { (e.currentTarget as HTMLButtonElement).style.borderColor = '#1e1e1e'; (e.currentTarget as HTMLButtonElement).style.color = '#555'; } }}
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
