'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/apiFetch';
import { Search, RefreshCw, Plus, X, Loader, AlertCircle, ExternalLink, Target } from 'lucide-react';

interface Lead {
  id: number;
  company: string; title: string; type: string; location: string;
  fit_score: number; why: string; tags: string[];
}

interface HuntedLead {
  id: number;
  company: string; title: string; url: string | null; location: string;
  type: string; fit_score: number; fit_reasoning: string; tags: string[];
  source_query: string; created_at: string;
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
function urlDomain(url: string): string {
  try {
    const h = new URL(url).hostname.replace('www.', '');
    if (h.includes('linkedin')) return 'LinkedIn';
    if (h.includes('greenhouse')) return 'Greenhouse';
    if (h.includes('lever')) return 'Lever';
    if (h.includes('workday')) return 'Workday';
    if (h.includes('handshake')) return 'Handshake';
    if (h.includes('indeed')) return 'Indeed';
    if (h.includes('jobvite')) return 'Jobvite';
    if (h.includes('smartrecruiters')) return 'SmartRecruit';
    if (h.includes('ashbyhq')) return 'Ashby';
    return h.split('.')[0].charAt(0).toUpperCase() + h.split('.')[0].slice(1);
  } catch { return 'Job Board'; }
}
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

  const [hunted, setHunted] = useState<HuntedLead[]>([]);
  const [hunting, setHunting] = useState(false);
  const [huntErr, setHuntErr] = useState('');
  const [savedHunted, setSavedHunted] = useState<Set<number>>(new Set());

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
      const res = await apiFetch('/api/discover/suggestions');
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

  const loadHunted = useCallback(async () => {
    try {
      const data = await apiFetch('/api/discover/leads').then(r => r.json());
      if (Array.isArray(data)) setHunted(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadLeads(); loadHunted(); }, [loadLeads, loadHunted]);

  useEffect(() => {
    apiFetch('/api/connections')
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
      const res = await apiFetch('/api/discover', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim() }),
      });
      const data = await res.json();
      if (data.error) setSearchErr(data.error); else setResult(data);
    } catch { setSearchErr('Search failed. Try again.'); }
    setSearching(false);
  };

  const huntJobs = async () => {
    if (hunting) return;
    setHunting(true); setHuntErr('');
    try {
      const res = await apiFetch('/api/discover/hunt', { method: 'POST' });
      const data = await res.json();
      if (data.error && !data.leads?.length) {
        setHuntErr('Hunt failed — try again');
      } else {
        setHunted(Array.isArray(data.leads) ? data.leads : []);
        setSavedHunted(new Set());
      }
    } catch { setHuntErr('Hunt failed — try again'); }
    setHunting(false);
  };

  const dismissHunted = async (id: number) => {
    await apiFetch(`/api/discover/leads/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dismissed: true }),
    });
    setHunted(prev => prev.filter(l => l.id !== id));
  };

  const saveHunted = async (lead: HuntedLead) => {
    if (savedHunted.has(lead.id)) return;
    await apiFetch('/api/jobs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company: lead.company, title: lead.title, type: lead.type,
        status: 'saved', location: lead.location, url: lead.url || '',
        source: 'Hunt Agent', notes: lead.fit_reasoning,
      }),
    });
    setSavedHunted(prev => new Set([...prev, lead.id]));
  };

  const saveLead = async (lead: Lead) => {
    if (saved.has(lead.id)) return;
    await apiFetch('/api/jobs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: lead.company, title: lead.title, type: lead.type, status: 'saved', location: lead.location, source: 'Discover', notes: lead.why }),
    });
    setSaved(prev => new Set([...prev, lead.id]));
  };

  const visible = leads.filter(l => !dismissed.has(l.id));
  const huntedAt = hunted.length > 0 ? ageStr(new Date(hunted[0].created_at).getTime()) : '';

  return (
    <div style={{ padding: '28px 32px', minHeight: '100vh', background: 'transparent' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '22px' }}>
        <div>
          <h1 style={{ color: 'rgba(232,244,255,0.95)', fontSize: '18px', fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>Discover</h1>
          <p style={{ color: 'rgba(135,185,230,0.65)', fontSize: '12px', margin: '4px 0 0' }}>Research companies · explore leads</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button onClick={() => loadLeads(true)} disabled={leadsLoading} style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'rgba(125,220,255,0.055)', backdropFilter: 'blur(20px)',
            color: 'rgba(135,185,230,0.65)', border: '1px solid rgba(125,220,255,0.13)', borderRadius: '10px', padding: '6px 12px',
            fontSize: '11px', cursor: leadsLoading ? 'wait' : 'pointer', fontFamily: 'inherit',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
            onMouseEnter={e => !leadsLoading && (e.currentTarget.style.color = '#3b82f6')}
            onMouseLeave={e => (e.currentTarget.style.color = '#94a3b8')}
          >
            <RefreshCw size={11} style={leadsLoading ? { animation: 'spin 1s linear infinite' } : {}} /> Refresh
          </button>
          <button onClick={huntJobs} disabled={hunting} style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            background: hunting ? 'rgba(125,220,255,0.06)' : 'linear-gradient(135deg, #d97706, #b45309)',
            color: hunting ? '#94a3b8' : '#fff',
            border: hunting ? '1px solid rgba(125,220,255,0.13)' : 'none',
            borderRadius: '10px', padding: '6px 14px',
            fontSize: '12px', fontWeight: 700, cursor: hunting ? 'wait' : 'pointer',
            fontFamily: 'inherit',
            boxShadow: hunting ? 'none' : '0 4px 14px rgba(180,83,9,0.3)',
          }}>
            {hunting
              ? <><Loader size={11} style={{ animation: 'spin 1s linear infinite' }} /> Hunting…</>
              : <><Target size={11} /> Hunt for Jobs</>}
          </button>
        </div>
      </div>

      {/* Search bar */}
      <form onSubmit={handleSearch} style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', gap: '8px', maxWidth: '620px' }}>
          <input
            type="text" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search a company or role — e.g. 'CoStar', 'PropTech analyst', 'Anthropic'..."
            style={{
              flex: 1, background: 'rgba(125,220,255,0.055)', backdropFilter: 'blur(20px)', border: '1px solid rgba(125,220,255,0.13)', borderRadius: '14px',
              padding: '11px 16px', color: 'rgba(232,244,255,0.95)', fontSize: '13px', outline: 'none', fontFamily: 'inherit',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
            onFocus={e => (e.target.style.borderColor = '#3b82f6')}
            onBlur={e => (e.target.style.borderColor = 'rgba(125,220,255,0.13)')}
          />
          <button type="submit" disabled={searching || !query.trim()} style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px', flexShrink: 0,
            background: searching || !query.trim() ? 'rgba(125,220,255,0.06)' : 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
            color: searching || !query.trim() ? '#94a3b8' : '#fff',
            border: searching || !query.trim() ? '1px solid rgba(125,220,255,0.13)' : 'none',
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
        <div style={{ background: 'rgba(125,220,255,0.055)', backdropFilter: 'blur(20px)', border: '1px solid rgba(125,220,255,0.13)', borderRadius: '14px', padding: '24px', marginBottom: '36px', animation: 'fadeIn 0.25s ease' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '16px' }}>
            <div style={{
              width: '42px', height: '42px', borderRadius: '10px', flexShrink: 0,
              backgroundColor: badgeColor(result.company),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '14px', fontWeight: 800, color: '#fff', letterSpacing: '-0.5px',
            }}>{initials(result.company)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '4px' }}>
                <span style={{ color: 'rgba(232,244,255,0.95)', fontSize: '16px', fontWeight: 700 }}>{result.company}</span>
                <span style={{
                  backgroundColor: `${verdictColor(result.fit_verdict)}14`, border: `1px solid ${verdictColor(result.fit_verdict)}33`,
                  color: verdictColor(result.fit_verdict), borderRadius: '20px',
                  padding: '2px 10px', fontSize: '11px', fontWeight: 700,
                }}>{result.fit_verdict} · {result.fit_score}/10</span>
                {result.size !== 'Unknown' && <span style={{ color: 'rgba(135,185,230,0.65)', fontSize: '11px' }}>{result.size}</span>}
                {result.stage && <span style={{ color: 'rgba(135,185,230,0.65)', fontSize: '11px' }}>· {result.stage}</span>}
              </div>
              <p style={{ color: 'rgba(158,202,242,0.72)', fontSize: '12px', margin: 0, lineHeight: 1.6 }}>{result.what_they_do}</p>
            </div>
          </div>

          {result.culture_signals?.length > 0 && (
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '20px' }}>
              {result.culture_signals.map((s, i) => (
                <span key={i} style={{ background: 'transparent', color: 'rgba(158,202,242,0.72)', border: '1px solid rgba(125,220,255,0.13)', borderRadius: '20px', padding: '3px 9px', fontSize: '11px' }}>{s}</span>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <div style={{ marginBottom: '10px' }}>
                <div style={{ color: 'rgba(158,202,242,0.72)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Role Types to Search</div>
                <div style={{ color: 'rgba(135,185,230,0.65)', fontSize: '10px', marginTop: '3px' }}>Suggestions — verify on their careers page</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                {result.roles?.map((role, i) => (
                  <div key={i} style={{ background: 'rgba(125,220,255,0.025)', border: '1px solid rgba(125,220,255,0.06)', borderRadius: '7px', padding: '10px 12px' }}>
                    <div style={{ color: 'rgba(200,228,255,0.85)', fontSize: '12px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{role.title}</div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '3px' }}>
                      <span style={{ color: TYPE_COLORS[role.type] || '#64748b', fontSize: '10px', fontWeight: 700 }}>{TYPE_LABELS[role.type] || role.type}</span>
                      <span style={{ color: 'rgba(125,175,230,0.35)', fontSize: '10px' }}>·</span>
                      <span style={{ color: 'rgba(135,185,230,0.65)', fontSize: '10px' }}>{role.location}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ background: 'rgba(125,220,255,0.025)', border: '1px solid rgba(125,220,255,0.06)', borderRadius: '8px', padding: '13px 15px' }}>
                <div style={{ color: 'rgba(158,202,242,0.72)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '7px' }}>Why You Fit</div>
                <p style={{ color: '#475569', fontSize: '12px', margin: 0, lineHeight: 1.65 }}>{result.fit_reasoning}</p>
              </div>
              <div style={{ backgroundColor: 'rgba(59,130,246,0.04)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: '8px', padding: '13px 15px' }}>
                <div style={{ color: '#2563eb', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '7px' }}>Your Angle</div>
                <p style={{ color: '#2563eb', fontSize: '12px', margin: 0, lineHeight: 1.65 }}>{result.nicholas_angle}</p>
              </div>
              {result.caveat && (
                <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', padding: '2px 0' }}>
                  <span style={{ color: 'rgba(135,185,230,0.65)', fontSize: '11px', flexShrink: 0, marginTop: '1px' }}>⚠</span>
                  <span style={{ color: 'rgba(158,202,242,0.72)', fontSize: '11px', lineHeight: 1.55 }}>{result.caveat}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Hunted Leads */}
      {(hunted.length > 0 || hunting) && (
        <div style={{ marginBottom: '36px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Target size={13} color="#d97706" />
              <span style={{ color: 'rgba(158,202,242,0.72)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Hunted Leads</span>
              {huntedAt && !hunting && <span style={{ color: 'rgba(125,175,230,0.35)', fontSize: '10px' }}>· {huntedAt}</span>}
              {hunting && <span style={{ color: '#d97706', fontSize: '10px' }}>· searching the web…</span>}
            </div>
            <span style={{ color: 'rgba(135,185,230,0.65)', fontSize: '11px' }}>Live postings via web search · verify before applying</span>
          </div>

          {hunting && (
            <div style={{ background: 'rgba(125,220,255,0.055)', backdropFilter: 'blur(20px)', border: '1px solid rgba(217,119,6,0.2)', borderRadius: '12px', padding: '28px', textAlign: 'center' }}>
              <Loader size={20} color="#d97706" style={{ animation: 'spin 1s linear infinite', margin: '0 auto 10px', display: 'block' }} />
              <div style={{ color: '#92400e', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>Hunting across 5-6 search queries…</div>
              <div style={{ color: 'rgba(135,185,230,0.65)', fontSize: '11px' }}>This takes 30-60 seconds — searching live job boards</div>
            </div>
          )}

          {!hunting && hunted.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {hunted.map(lead => {
                const isSaved = savedHunted.has(lead.id);
                const friendly = lead.type !== 'full-time' && isStudentFriendly(lead.location);
                const color = badgeColor(lead.company);
                return (
                  <div key={lead.id} style={{
                    background: 'rgba(125,220,255,0.055)', backdropFilter: 'blur(20px)', border: '1px solid rgba(217,119,6,0.15)', borderRadius: '12px',
                    padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                    transition: 'box-shadow 0.15s, border-color 0.15s',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(217,119,6,0.35)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(217,119,6,0.15)'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)'; }}
                  >
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                      <div style={{
                        width: '32px', height: '32px', borderRadius: '7px', flexShrink: 0,
                        backgroundColor: color,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '11px', fontWeight: 800, color: '#fff', letterSpacing: '-0.3px',
                      }}>{initials(lead.company)}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: 'rgba(220,235,255,0.90)', fontSize: '12px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.company}</div>
                        <div style={{ color: 'rgba(158,202,242,0.72)', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.title}</div>
                      </div>
                      <button onClick={() => dismissHunted(lead.id)} style={{
                        background: 'none', border: 'none', color: 'rgba(125,175,230,0.35)', cursor: 'pointer', padding: '2px', display: 'flex', flexShrink: 0,
                      }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#94a3b8')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(125,175,230,0.35)')}
                      ><X size={13} /></button>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                      <span style={{ color: TYPE_COLORS[lead.type] || '#64748b', fontSize: '10px', fontWeight: 700 }}>{TYPE_LABELS[lead.type] || lead.type}</span>
                      <span style={{ color: 'rgba(125,175,230,0.35)', fontSize: '10px' }}>·</span>
                      <span style={{ color: 'rgba(158,202,242,0.72)', fontSize: '10px' }}>{lead.location}</span>
                      {lead.type !== 'full-time' && (
                        <span style={{
                          fontSize: '9px', fontWeight: 600, padding: '1px 5px', borderRadius: '3px',
                          backgroundColor: friendly ? 'rgba(5,150,105,0.07)' : 'rgba(220,38,38,0.07)',
                          color: friendly ? '#059669' : '#dc2626',
                        }}>{friendly ? 'Student-friendly' : 'On-site only'}</span>
                      )}
                      <span style={{ marginLeft: 'auto', color: fitColor(lead.fit_score), fontSize: '13px', fontWeight: 800 }}>{lead.fit_score}/10</span>
                    </div>

                    {lead.url && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{
                          backgroundColor: 'rgba(59,130,246,0.07)', color: '#2563eb',
                          border: '1px solid rgba(59,130,246,0.2)', borderRadius: '4px',
                          padding: '1px 6px', fontSize: '9px', fontWeight: 700,
                        }}>{urlDomain(lead.url)}</span>
                        <span style={{ color: 'rgba(125,175,230,0.35)', fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{lead.url}</span>
                      </div>
                    )}

                    <p style={{ color: '#475569', fontSize: '11px', lineHeight: 1.6, margin: 0 }}>{lead.fit_reasoning}</p>

                    {lead.tags?.length > 0 && (
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {lead.tags.map((t, i) => (
                          <span key={i} style={{ background: 'transparent', color: 'rgba(158,202,242,0.72)', border: '1px solid rgba(125,220,255,0.13)', borderRadius: '3px', padding: '2px 7px', fontSize: '10px' }}>{t}</span>
                        ))}
                      </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <a href={lead.url!} target="_blank" rel="noopener noreferrer" style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                        background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', color: '#fff',
                        borderRadius: '6px', padding: '8px', fontSize: '11px', fontWeight: 700,
                        textDecoration: 'none', boxShadow: '0 2px 8px rgba(59,130,246,0.25)',
                      }}>
                        <ExternalLink size={11} /> View Job Posting on {urlDomain(lead.url!)}
                      </a>
                      <button onClick={() => saveHunted(lead)} disabled={isSaved} style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                        backgroundColor: isSaved ? 'rgba(5,150,105,0.06)' : 'rgba(125,220,255,0.04)',
                        color: isSaved ? '#059669' : '#94a3b8',
                        border: `1px solid ${isSaved ? 'rgba(5,150,105,0.3)' : 'rgba(125,220,255,0.13)'}`,
                        borderRadius: '6px', padding: '7px', fontSize: '11px', fontWeight: 600,
                        cursor: isSaved ? 'default' : 'pointer', fontFamily: 'inherit',
                        transition: 'all 0.15s',
                      }}
                        onMouseEnter={e => { if (!isSaved) { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(59,130,246,0.3)'; (e.currentTarget as HTMLButtonElement).style.color = '#3b82f6'; } }}
                        onMouseLeave={e => { if (!isSaved) { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(125,220,255,0.13)'; (e.currentTarget as HTMLButtonElement).style.color = '#94a3b8'; } }}
                      >
                        {isSaved ? '✓ Saved to Tracker' : <><Plus size={11} /> Save to Tracker</>}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Hunt CTA if no hunted leads yet */}
      {!hunting && hunted.length === 0 && (
        <div style={{
          background: 'rgba(125,220,255,0.055)', backdropFilter: 'blur(20px)', border: '1px solid rgba(217,119,6,0.2)', borderRadius: '14px',
          padding: '20px 24px', marginBottom: '36px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '4px' }}>
              <Target size={14} color="#d97706" />
              <span style={{ color: '#92400e', fontSize: '13px', fontWeight: 700 }}>Hunt for Jobs</span>
            </div>
            <p style={{ color: 'rgba(135,185,230,0.65)', fontSize: '12px', margin: 0, lineHeight: 1.5 }}>
              AI searches live job boards across 5-6 targeted queries, scores fit, and saves the best matches here permanently.
            </p>
          </div>
          <button onClick={huntJobs} style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px', flexShrink: 0,
            background: 'linear-gradient(135deg, #d97706, #b45309)',
            color: '#fff', border: 'none', borderRadius: '10px', padding: '9px 18px',
            fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: '0 4px 14px rgba(180,83,9,0.3)',
          }}>
            <Target size={13} /> Hunt Now
          </button>
        </div>
      )}

      {/* Lead feed */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ color: 'rgba(158,202,242,0.72)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>For You</span>
            {leadsAge && !leadsLoading && <span style={{ color: 'rgba(125,175,230,0.35)', fontSize: '10px' }}>· {leadsAge}</span>}
          </div>
          <span style={{ color: 'rgba(135,185,230,0.65)', fontSize: '11px' }}>AI-generated — verify openings on company sites</span>
        </div>

        {leadsLoading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'rgba(135,185,230,0.65)', fontSize: '12px', padding: '48px 0' }}>
            <Loader size={14} color="#94a3b8" style={{ animation: 'spin 1s linear infinite' }} />
            Finding leads for you…
          </div>
        )}

        {!leadsLoading && leads.length > 0 && visible.length === 0 && (
          <div style={{ color: 'rgba(135,185,230,0.65)', fontSize: '12px', padding: '32px 0' }}>
            All leads dismissed.{' '}
            <button onClick={() => loadLeads(true)} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '12px', padding: 0, fontFamily: 'inherit' }}>Refresh</button>
            {' '}for new ones.
          </div>
        )}

        {!leadsLoading && visible.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {visible.map(lead => {
              const isSaved = saved.has(lead.id);
              const friendly = lead.type !== 'full-time' && isStudentFriendly(lead.location);
              const color = badgeColor(lead.company);
              return (
                <div key={lead.id} style={{
                  background: 'rgba(125,220,255,0.055)', backdropFilter: 'blur(20px)', border: '1px solid rgba(125,220,255,0.13)', borderRadius: '12px',
                  padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  transition: 'box-shadow 0.15s, border-color 0.15s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(125,175,230,0.35)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(125,220,255,0.13)'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)'; }}
                >
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
                          backgroundColor: '#7c3aed', border: '1.5px solid rgba(255,255,255,0.9)',
                        }} />
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: 'rgba(220,235,255,0.90)', fontSize: '12px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.company}</div>
                      <div style={{ color: 'rgba(158,202,242,0.72)', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.title}</div>
                    </div>
                    <button onClick={() => setDismissed(prev => new Set([...prev, lead.id]))} style={{
                      background: 'none', border: 'none', color: 'rgba(125,175,230,0.35)', cursor: 'pointer', padding: '2px', display: 'flex', flexShrink: 0,
                    }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#94a3b8')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'rgba(125,175,230,0.35)')}
                    ><X size={13} /></button>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                    <span style={{ color: TYPE_COLORS[lead.type] || '#64748b', fontSize: '10px', fontWeight: 700 }}>{TYPE_LABELS[lead.type] || lead.type}</span>
                    <span style={{ color: 'rgba(125,175,230,0.35)', fontSize: '10px' }}>·</span>
                    <span style={{ color: 'rgba(158,202,242,0.72)', fontSize: '10px' }}>{lead.location}</span>
                    {lead.type !== 'full-time' && (
                      <span style={{
                        fontSize: '9px', fontWeight: 600, padding: '1px 5px', borderRadius: '3px',
                        backgroundColor: friendly ? 'rgba(5,150,105,0.07)' : 'rgba(220,38,38,0.07)',
                        color: friendly ? '#059669' : '#dc2626',
                      }}>{friendly ? 'Student-friendly' : 'On-site only'}</span>
                    )}
                    <span style={{ marginLeft: 'auto', color: fitColor(lead.fit_score), fontSize: '13px', fontWeight: 800 }}>{lead.fit_score}/10</span>
                  </div>

                  <p style={{ color: '#475569', fontSize: '11px', lineHeight: 1.6, margin: 0 }}>{lead.why}</p>

                  {lead.tags?.length > 0 && (
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {lead.tags.map((t, i) => (
                        <span key={i} style={{ background: 'transparent', color: 'rgba(158,202,242,0.72)', border: '1px solid rgba(125,220,255,0.13)', borderRadius: '3px', padding: '2px 7px', fontSize: '10px' }}>{t}</span>
                      ))}
                    </div>
                  )}

                  <button onClick={() => saveLead(lead)} disabled={isSaved} style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                    backgroundColor: isSaved ? 'rgba(5,150,105,0.06)' : 'rgba(125,220,255,0.04)',
                    color: isSaved ? '#059669' : '#94a3b8',
                    border: `1px solid ${isSaved ? 'rgba(5,150,105,0.3)' : 'rgba(125,220,255,0.13)'}`,
                    borderRadius: '6px', padding: '8px', fontSize: '11px', fontWeight: 600,
                    cursor: isSaved ? 'default' : 'pointer', fontFamily: 'inherit', width: '100%',
                    transition: 'all 0.15s',
                  }}
                    onMouseEnter={e => { if (!isSaved) { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(59,130,246,0.3)'; (e.currentTarget as HTMLButtonElement).style.color = '#3b82f6'; } }}
                    onMouseLeave={e => { if (!isSaved) { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(125,220,255,0.13)'; (e.currentTarget as HTMLButtonElement).style.color = '#94a3b8'; } }}
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
