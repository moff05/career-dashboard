'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, Plus, Loader, RefreshCw, Info, MapPin, Building2 } from 'lucide-react';

interface JobResult {
  title: string;
  company: string;
  location: string;
  match_score: number;
  url?: string;
  description?: string;
  type?: string;
  reason?: string;
}

const TYPE_OPTIONS = [
  { value: '', label: 'Any Type' },
  { value: 'fall-2026-internship', label: 'Fall 2026 Intern' },
  { value: 'spring-2027-internship', label: 'Spring 2027 Intern' },
  { value: 'summer-internship', label: 'Summer Intern' },
  { value: 'full-time', label: 'Full-Time' },
];

const TYPE_COLORS: Record<string, string> = {
  'fall-2026-internship':   '#7c3aed',
  'spring-2027-internship': '#0891b2',
  'summer-internship':      '#059669',
  'full-time':              '#d97706',
};

// Vibrant hash-based badge — same logic as tracker
const BADGE_PALETTE: [string, string][] = [
  ['#7c3aed', '#fff'],
  ['#2563eb', '#fff'],
  ['#059669', '#fff'],
  ['#d97706', '#fff'],
  ['#dc2626', '#fff'],
  ['#0891b2', '#fff'],
  ['#db2777', '#fff'],
  ['#ea580c', '#fff'],
  ['#65a30d', '#fff'],
  ['#0f766e', '#fff'],
  ['#9333ea', '#fff'],
  ['#be185d', '#fff'],
];

function getCompanyColor(name: string): [string, string] {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h << 5) - h + name.charCodeAt(i);
  return BADGE_PALETTE[Math.abs(h) % BADGE_PALETTE.length];
}

function CompanyBadge({ company, size = 36 }: { company: string; size?: number }) {
  const initials = company.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const [bg, text] = getCompanyColor(company);
  return (
    <div style={{
      width: size, height: size, borderRadius: Math.round(size * 0.25) + 'px',
      backgroundColor: bg, color: text,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.38) + 'px', fontWeight: 800,
      flexShrink: 0, letterSpacing: '-0.5px', userSelect: 'none',
    }}>
      {initials}
    </div>
  );
}

function getMatchColor(score: number): string {
  if (score >= 8) return '#4ade80';
  if (score >= 5) return '#60a5fa';
  if (score >= 3) return '#fbbf24';
  return '#f87171';
}

function getMatchBg(score: number): string {
  if (score >= 8) return '#4ade8018';
  if (score >= 5) return '#60a5fa18';
  if (score >= 3) return '#fbbf2418';
  return '#f8717118';
}

// Internships should be Miami, FL or Remote for a student still in school
const INTERNSHIP_TYPES = new Set(['fall-2026-internship', 'spring-2027-internship', 'summer-internship']);
const STUDENT_LOCATIONS = ['remote', 'miami', 'coral gables'];

function isLocationOk(job: JobResult): boolean | null {
  if (!job.type || !INTERNSHIP_TYPES.has(job.type)) return null; // full-time: no restriction
  if (!job.location) return null;
  const loc = job.location.toLowerCase();
  return STUDENT_LOCATIONS.some(l => loc.includes(l));
}

function LocationBadge({ job }: { job: JobResult }) {
  const ok = isLocationOk(job);
  if (ok === null) return null;
  if (ok) return (
    <span style={{ fontSize: '10px', fontWeight: 600, color: '#4ade80', backgroundColor: '#4ade8018', borderRadius: '4px', padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
      <MapPin size={9} /> Student-friendly
    </span>
  );
  return (
    <span style={{ fontSize: '10px', fontWeight: 600, color: '#f87171', backgroundColor: '#f8717118', borderRadius: '4px', padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
      <MapPin size={9} /> On-site only
    </span>
  );
}

const SUGGESTIONS_CACHE_KEY = 'career-suggestions-v2';
const AUTO_REFRESH_MS = 10 * 60 * 1000; // 10 minutes

export default function DiscoverPage() {
  const [role, setRole] = useState('');
  const [location, setLocation] = useState('');
  const [type, setType] = useState('');
  const [searchResults, setSearchResults] = useState<JobResult[]>([]);
  const [suggestions, setSuggestions] = useState<JobResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState('');
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [minutesAgo, setMinutesAgo] = useState(0);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadSuggestions(false);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (autoRefreshRef.current) clearTimeout(autoRefreshRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update "X min ago" counter every minute
  useEffect(() => {
    timerRef.current = setInterval(() => {
      if (lastRefreshed) setMinutesAgo(Math.floor((Date.now() - lastRefreshed.getTime()) / 60000));
    }, 60000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [lastRefreshed]);

  const loadSuggestions = async (forceRefresh: boolean) => {
    if (!forceRefresh) {
      try {
        const cached = sessionStorage.getItem(SUGGESTIONS_CACHE_KEY);
        if (cached) {
          const { data, ts } = JSON.parse(cached) as { data: JobResult[]; ts: number };
          if (Array.isArray(data) && data.length > 0 && Date.now() - ts < AUTO_REFRESH_MS) {
            setSuggestions(data);
            const d = new Date(ts);
            setLastRefreshed(d);
            setMinutesAgo(Math.floor((Date.now() - ts) / 60000));
            setLoadingSuggestions(false);
            scheduleAutoRefresh(AUTO_REFRESH_MS - (Date.now() - ts));
            return;
          }
        }
      } catch { /* ignore */ }
    }

    setLoadingSuggestions(true);
    try {
      const res = await fetch('/api/discover/suggestions');
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setSuggestions(list);
      const now = new Date();
      setLastRefreshed(now);
      setMinutesAgo(0);
      try { sessionStorage.setItem(SUGGESTIONS_CACHE_KEY, JSON.stringify({ data: list, ts: now.getTime() })); } catch { /* ignore */ }
      scheduleAutoRefresh(AUTO_REFRESH_MS);
    } catch {
      setSuggestions([]);
    }
    setLoadingSuggestions(false);
  };

  const scheduleAutoRefresh = (delay: number) => {
    if (autoRefreshRef.current) clearTimeout(autoRefreshRef.current);
    autoRefreshRef.current = setTimeout(() => { loadSuggestions(true); }, Math.max(delay, 60000));
  };

  const handleRefresh = () => {
    try { sessionStorage.removeItem(SUGGESTIONS_CACHE_KEY); } catch { /* ignore */ }
    loadSuggestions(true);
  };

  const handleSearch = async () => {
    if (!role.trim()) return;
    setSearching(true);
    setSearchResults([]);
    setShowSearchResults(true);
    try {
      const res = await fetch('/api/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, location, type }),
      });
      const data = await res.json();
      setSearchResults(Array.isArray(data) ? data : []);
    } catch { setSearchResults([]); }
    setSearching(false);
  };

  const jobKey = (job: JobResult) => `${job.company}::${job.title}`;

  const saveToTracker = async (job: JobResult) => {
    const key = jobKey(job);
    setSavedKeys(prev => new Set([...prev, key]));
    await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company: job.company, title: job.title,
        type: job.type || 'fall-2026-internship', status: 'saved',
        match_score: job.match_score, location: job.location,
        url: job.url || '', notes: job.reason || job.description || '',
        source: 'discover',
      }),
    });
    setToast(`Saved "${job.title}" at ${job.company}`);
    setTimeout(() => setToast(''), 3000);
  };

  const JobCard = ({ job }: { job: JobResult }) => {
    const key = jobKey(job);
    const isSaved = savedKeys.has(key);
    const locOk = isLocationOk(job);
    return (
      <div style={{
        backgroundColor: '#1e1e1e', border: '1px solid #282828',
        borderRadius: '10px', padding: '16px',
        display: 'flex', flexDirection: 'column', gap: '10px',
        transition: 'border-color 0.15s',
        // dim on-site internships slightly
        opacity: locOk === false ? 0.75 : 1,
      }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = '#333')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = '#282828')}
      >
        {/* Top row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <CompanyBadge company={job.company} size={36} />
            <div style={{ minWidth: 0 }}>
              <div style={{ color: '#e8e8e8', fontWeight: 600, fontSize: '13px', lineHeight: 1.3 }}>{job.title}</div>
              <div style={{ color: '#666', fontSize: '11px', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Building2 size={10} /> {job.company}
              </div>
            </div>
          </div>
          <div style={{
            color: getMatchColor(job.match_score), backgroundColor: getMatchBg(job.match_score),
            fontSize: '12px', fontWeight: 700, borderRadius: '5px', padding: '3px 8px', flexShrink: 0,
          }}>
            {job.match_score}/10
          </div>
        </div>

        {/* Tags row */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          {job.type && (
            <span style={{ fontSize: '10px', fontWeight: 600, color: TYPE_COLORS[job.type] || '#888', backgroundColor: (TYPE_COLORS[job.type] || '#888') + '18', borderRadius: '4px', padding: '2px 7px' }}>
              {TYPE_OPTIONS.find(t => t.value === job.type)?.label || job.type}
            </span>
          )}
          {job.location && (
            <span style={{ fontSize: '10px', color: '#555', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
              <MapPin size={9} /> {job.location}
            </span>
          )}
          <LocationBadge job={job} />
        </div>

        {/* Reason/description */}
        {(job.reason || job.description) && (
          <p style={{ color: '#666', fontSize: '12px', margin: 0, lineHeight: 1.5 }}>
            {job.reason || job.description}
          </p>
        )}

        {/* Action */}
        <button
          onClick={() => saveToTracker(job)}
          disabled={isSaved}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            backgroundColor: isSaved ? '#1e1e1e' : '#d97706',
            color: isSaved ? '#555' : '#fff',
            border: isSaved ? '1px solid #333' : 'none',
            borderRadius: '6px', padding: '7px 14px', fontSize: '12px', fontWeight: 500,
            cursor: isSaved ? 'default' : 'pointer', alignSelf: 'flex-start', marginTop: '2px',
          }}
        >
          <Plus size={12} />
          {isSaved ? 'Saved to Tracker' : 'Save to Tracker'}
        </button>
      </div>
    );
  };

  return (
    <div style={{ padding: '28px 32px', minHeight: '100vh', backgroundColor: '#1a1a1a' }}>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ color: '#e8e8e8', fontSize: '18px', fontWeight: 600, margin: 0, letterSpacing: '-0.01em' }}>Discover Jobs</h1>
        <p style={{ color: '#555', fontSize: '12px', margin: '3px 0 0' }}>AI-powered leads tailored to your profile · auto-refreshes every 10 min</p>
      </div>

      {/* Source transparency banner */}
      <div style={{
        backgroundColor: '#1e1e1e', border: '1px solid #2a2a2a', borderRadius: '8px',
        padding: '10px 14px', marginBottom: '20px',
        display: 'flex', alignItems: 'center', gap: '8px',
      }}>
        <Info size={13} color="#d97706" style={{ flexShrink: 0 }} />
        <span style={{ color: '#666', fontSize: '12px' }}>
          <strong style={{ color: '#888' }}>Source:</strong> Suggestions are generated by Claude using your resume, skills, and job targets. Companies are real; verify open roles at their careers pages. Internships marked &quot;On-site only&quot; conflict with your school schedule — prioritize Remote/Miami roles.
        </span>
      </div>

      {/* Search bar */}
      <div style={{
        backgroundColor: '#1e1e1e', border: '1px solid #2a2a2a', borderRadius: '10px',
        padding: '16px 20px', marginBottom: '24px',
      }}>
        <div style={{ color: '#888', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '10px' }}>Search for specific roles</div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <input
            type="text" placeholder="Role title (e.g., Proptech Analyst Intern)"
            value={role} onChange={e => setRole(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            style={{
              flex: 2, minWidth: '200px', backgroundColor: '#141414', border: '1px solid #2a2a2a',
              borderRadius: '6px', padding: '9px 12px', color: '#e8e8e8', fontSize: '13px', outline: 'none',
            }}
          />
          <input
            type="text" placeholder="Location (optional)"
            value={location} onChange={e => setLocation(e.target.value)}
            style={{
              flex: 1, minWidth: '140px', backgroundColor: '#141414', border: '1px solid #2a2a2a',
              borderRadius: '6px', padding: '9px 12px', color: '#e8e8e8', fontSize: '13px', outline: 'none',
            }}
          />
          <select value={type} onChange={e => setType(e.target.value)} style={{
            flex: 1, minWidth: '150px', backgroundColor: '#141414', border: '1px solid #2a2a2a',
            borderRadius: '6px', padding: '9px 12px', color: '#e8e8e8', fontSize: '13px', outline: 'none',
          }}>
            {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <button
            onClick={handleSearch} disabled={searching || !role.trim()}
            style={{
              display: 'flex', alignItems: 'center', gap: '7px',
              backgroundColor: searching || !role.trim() ? '#2a2a2a' : '#d97706',
              color: searching || !role.trim() ? '#555' : '#fff',
              border: 'none', borderRadius: '6px', padding: '9px 18px',
              fontSize: '13px', fontWeight: 500, cursor: searching || !role.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {searching ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={13} />}
            {searching ? 'Searching...' : 'Search'}
          </button>
        </div>
      </div>

      {/* Search results (shown above suggestions when active) */}
      {showSearchResults && (
        <div style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h2 style={{ color: '#e8e8e8', fontSize: '14px', fontWeight: 600, margin: 0 }}>
              Search Results
            </h2>
            <button onClick={() => { setShowSearchResults(false); setSearchResults([]); }}
              style={{ background: 'none', border: 'none', color: '#555', fontSize: '12px', cursor: 'pointer' }}>
              Clear
            </button>
          </div>
          {searching ? (
            <div style={{ color: '#666', display: 'flex', alignItems: 'center', gap: '10px', padding: '20px 0', fontSize: '13px' }}>
              <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> Searching with AI...
            </div>
          ) : searchResults.length === 0 ? (
            <div style={{ color: '#555', fontSize: '13px', padding: '20px 0' }}>No results found. Try a different role or location.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '14px' }}>
              {searchResults.map((job, i) => <JobCard key={i} job={job} />)}
            </div>
          )}
        </div>
      )}

      {/* Suggestions — primary section */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div>
            <h2 style={{ color: '#e8e8e8', fontSize: '14px', fontWeight: 600, margin: 0 }}>Your Leads</h2>
            <p style={{ color: '#555', fontSize: '11px', margin: '3px 0 0' }}>
              {lastRefreshed
                ? minutesAgo === 0 ? 'Updated just now' : `Updated ${minutesAgo}m ago`
                : 'Loading...'}
              {' · '}Auto-refreshes every 10 min
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={loadingSuggestions}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              backgroundColor: '#1e1e1e', border: '1px solid #2a2a2a',
              borderRadius: '6px', padding: '7px 12px', color: '#888',
              fontSize: '12px', cursor: loadingSuggestions ? 'not-allowed' : 'pointer',
            }}
            onMouseEnter={e => !loadingSuggestions && ((e.currentTarget as HTMLButtonElement).style.borderColor = '#444')}
            onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.borderColor = '#2a2a2a')}
          >
            <RefreshCw size={12} style={{ animation: loadingSuggestions ? 'spin 1s linear infinite' : 'none' }} />
            Refresh Leads
          </button>
        </div>

        {loadingSuggestions ? (
          <div style={{ color: '#666', display: 'flex', alignItems: 'center', gap: '10px', padding: '40px 0', fontSize: '13px' }}>
            <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> Finding leads for you...
          </div>
        ) : suggestions.length === 0 ? (
          <div style={{ color: '#555', fontSize: '13px', padding: '40px 0' }}>
            No suggestions yet. Click &quot;Refresh Leads&quot; to generate new ones.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '14px' }}>
            {suggestions.map((job, i) => <JobCard key={i} job={job} />)}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
          backgroundColor: '#1e1e1e', border: '1px solid #d97706',
          color: '#e8e8e8', padding: '10px 20px', borderRadius: '8px', fontSize: '13px', zIndex: 1000,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          ✓ {toast}
        </div>
      )}
    </div>
  );
}
