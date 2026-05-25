'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Star, Trash2, ExternalLink, FileText, ChevronDown, ChevronRight, Plus, LinkIcon, Loader, AlertCircle, ArrowLeft, ImageIcon, Edit2, RotateCcw, X } from 'lucide-react';

interface Job {
  id: number; company: string; title: string; type: string; status: string;
  match_score: number | null; posting_date: string | null; deadline: string | null;
  url: string | null; description: string | null; salary_range: string | null;
  location: string | null; source: string | null; notes: string | null;
  created_at: string; status_updated_at: string | null; starred: number;
}

interface AnalysisCategory { name: string; score: number; rationale: string; }
interface AnalysisResult { categories: AnalysisCategory[]; total: number; summary: string; }
type AnalysisState = AnalysisResult | 'loading' | 'error';

interface DetailsResult { company_overview: string; role_summary: string; key_qualifications: string[]; what_to_highlight: string; }
type DetailsState = DetailsResult | 'loading' | 'error';

interface GapsResult { gaps: { skill: string; severity: string; how_to_address: string }[]; positioning: string; quick_wins: string[]; should_apply: boolean; apply_reasoning: string; }
type GapsState = GapsResult | 'loading' | 'error';

interface BulletsResult { lead_with: { experience: string; why: string }[]; tailored_bullets: { original: string; tailored: string; why: string }[]; keywords_to_add: string[]; deprioritize: string[]; }
type BulletsState = BulletsResult | 'loading' | 'error';

interface CoverLetterResult { letter: string; tone: string; }
type CoverLetterState = CoverLetterResult | 'loading' | 'error';

interface Connection { id: number; company: string; name: string; relationship: string | null; notes: string | null; status: string; created_at: string; }
const CONN_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  not_reached_out: { label: 'Not reached out', color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' },
  reached_out:     { label: 'Reached out',     color: '#3b82f6', bg: 'rgba(59,130,246,0.08)' },
  responded:       { label: 'Responded',        color: '#059669', bg: 'rgba(5,150,105,0.08)'  },
  warm:            { label: 'Warm',             color: '#7c3aed', bg: 'rgba(124,58,237,0.08)' },
};
const CONN_CYCLE = ['not_reached_out', 'reached_out', 'responded', 'warm'];

// ─── Colors ──────────────────────────────────────────────────────────────────
const BADGE_PALETTE: [string, string][] = [
  ['#7c3aed','#fff'],['#2563eb','#fff'],['#059669','#fff'],['#2563eb','#fff'],
  ['#dc2626','#fff'],['#0891b2','#fff'],['#db2777','#fff'],['#ea580c','#fff'],
  ['#65a30d','#fff'],['#0f766e','#fff'],['#9333ea','#fff'],['#be185d','#fff'],
];
function getCompanyColor(name: string): [string, string] {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h << 5) - h + name.charCodeAt(i);
  return BADGE_PALETTE[Math.abs(h) % BADGE_PALETTE.length];
}

const STATUS_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  saved:        { bg: 'rgba(122,143,168,0.1)', text: '#64748b', border: 'rgba(122,143,168,0.2)' },
  applied:      { bg: 'rgba(129,140,248,0.1)', text: '#818cf8', border: 'rgba(129,140,248,0.25)' },
  interviewing: { bg: 'rgba(6,182,212,0.1)',   text: '#06b6d4', border: 'rgba(6,182,212,0.25)' },
  offer:        { bg: 'rgba(52,211,153,0.1)',   text: '#34d399', border: 'rgba(52,211,153,0.25)' },
  rejected:     { bg: 'rgba(248,113,113,0.1)',  text: '#f87171', border: 'rgba(248,113,113,0.25)' },
};

function scoreColor(s: number) {
  if (s >= 80) return '#22c55e'; if (s >= 60) return '#3b82f6'; return '#ef4444';
}
function scoreGlow(s: number) {
  if (s >= 80) return 'rgba(34,197,94,0.35)'; if (s >= 60) return 'rgba(59,130,246,0.35)'; return 'rgba(239,68,68,0.35)';
}

const TYPE_OPTIONS = [
  { value: 'fall-2026-internship',   label: 'Fall 2026' },
  { value: 'spring-2027-internship', label: 'Spring 2027' },
  { value: 'summer-internship',      label: 'Summer Intern' },
  { value: 'full-time',              label: 'Full-Time' },
];
const TYPE_COLORS: Record<string, string> = {
  'fall-2026-internship': '#7c3aed', 'spring-2027-internship': '#0891b2',
  'summer-internship': '#059669',    'full-time': '#2563eb',
};
const STATUS_OPTIONS = ['saved', 'applied', 'interviewing', 'offer', 'rejected'];

// ─── Subcomponents ────────────────────────────────────────────────────────────
function CompanyBadge({ company, size = 26 }: { company: string; size?: number }) {
  const initials = company.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const [bg, text] = getCompanyColor(company);
  return (
    <div style={{
      width: size, height: size, borderRadius: Math.round(size * 0.28) + 'px',
      backgroundColor: bg, color: text,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.38) + 'px', fontWeight: 800,
      flexShrink: 0, letterSpacing: '-0.5px', userSelect: 'none',
    }}>{initials}</div>
  );
}

function PostedDisplay({ date }: { date: string | null }) {
  if (!date) return <span style={{ color: '#cbd5e1' }}>—</span>;
  const d = new Date(date); d.setHours(0,0,0,0);
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return <span style={{ color: '#64748b', fontSize: '11px' }}>Today</span>;
  if (diff < 0) return <span style={{ color: '#64748b', fontSize: '11px' }}>{d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>;
  if (diff < 7) return <span style={{ color: '#64748b', fontSize: '11px' }}>{diff}d ago</span>;
  if (diff < 30) return <span style={{ color: '#94a3b8', fontSize: '11px' }}>{Math.round(diff/7)}w ago</span>;
  return <span style={{ color: '#94a3b8', fontSize: '11px' }}>{d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>;
}

function DeadlineDisplay({ deadline }: { deadline: string | null }) {
  if (!deadline) return <span style={{ color: '#cbd5e1' }}>—</span>;
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(deadline); d.setHours(0,0,0,0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return <span style={{ color: '#ef4444', fontSize: '11px' }}>Expired</span>;
  if (diff === 0) return <span style={{ color: '#ef4444', fontSize: '11px', fontWeight: 700 }}>Today!</span>;
  if (diff <= 3) return <span style={{ color: '#ef4444', fontSize: '11px', fontWeight: 600 }}>{diff}d left</span>;
  if (diff <= 7) return <span style={{ color: '#3b82f6', fontSize: '11px' }}>{diff}d left</span>;
  if (diff <= 30) return <span style={{ color: '#64748b', fontSize: '11px' }}>{diff}d</span>;
  return <span style={{ color: '#94a3b8', fontSize: '11px' }}>{d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>;
}

function StatusBadge({ job, onStatusChange }: { job: Job; onStatusChange: (id: number, status: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  const s = STATUS_STYLE[job.status] || STATUS_STYLE.saved;
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <span onClick={e => { e.stopPropagation(); setOpen(o => !o); }} style={{
        backgroundColor: s.bg, color: s.text, border: `1px solid ${s.border}`,
        borderRadius: '5px', padding: '3px 8px', fontSize: '10px', fontWeight: 700,
        textTransform: 'capitalize', cursor: 'pointer', userSelect: 'none', display: 'inline-block',
        letterSpacing: '0.02em',
      }}>{job.status}</span>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 100,
          backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px',
          overflow: 'hidden', minWidth: '120px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        }}>
          {STATUS_OPTIONS.map(st => {
            const ss = STATUS_STYLE[st] || STATUS_STYLE.saved;
            return (
              <div key={st} onClick={e => { e.stopPropagation(); onStatusChange(job.id, st); setOpen(false); }} style={{
                padding: '8px 14px', fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                color: ss.text, textTransform: 'capitalize',
                backgroundColor: job.status === st ? '#e2e8f0' : 'transparent',
              }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#ffffff')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = job.status === st ? '#e2e8f0' : 'transparent')}
              >{st}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Form helpers ─────────────────────────────────────────────────────────────
const EMPTY_FORM = {
  company: '', title: '', type: 'fall-2026-internship', status: 'saved',
  match_score: '', location: '', source: '', posting_date: '',
  deadline: '', url: '', salary_range: '', notes: '', description: '',
};
type FormData = typeof EMPTY_FORM;

const formInput: React.CSSProperties = {
  width: '100%', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0',
  borderRadius: '10px', padding: '8px 10px', color: '#0f172a', fontSize: '13px',
  outline: 'none', boxSizing: 'border-box',
};

function Field({ label, field, form, setForm, type = 'text' }: {
  label: string; field: keyof FormData;
  form: FormData; setForm: React.Dispatch<React.SetStateAction<FormData>>; type?: string;
}) {
  return (
    <div>
      <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 500, marginBottom: '5px' }}>{label}</label>
      <input type={type} value={form[field]}
        onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
        style={formInput}
        onFocus={e => (e.target.style.borderColor = '#3b82f6')}
        onBlur={e => (e.target.style.borderColor = '#e2e8f0')} />
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
export default function TrackerPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());
  const [expandedJobs, setExpandedJobs] = useState<Set<number>>(new Set());
  const [jobTabs, setJobTabs] = useState<Record<number, string>>({});

  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [starFilter, setStarFilter] = useState(false);
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [sortClicks, setSortClicks] = useState<Record<string, number>>({});

  // Analysis + Details cache: per job id, persists for session
  const analysisCacheRef = useRef<Record<number, AnalysisState>>({});
  const [analysisResults, setAnalysisResults] = useState<Record<number, AnalysisState>>({});
  const detailsCacheRef = useRef<Record<number, DetailsState>>({});
  const [detailsResults, setDetailsResults] = useState<Record<number, DetailsState>>({});
  const [showRawJd, setShowRawJd] = useState<Record<number, boolean>>({});

  const gapsCacheRef = useRef<Record<number, GapsState>>({});
  const [gapsResults, setGapsResults] = useState<Record<number, GapsState>>({});

  const bulletsCacheRef = useRef<Record<number, BulletsState>>({});
  const [bulletsResults, setBulletsResults] = useState<Record<number, BulletsState>>({});

  const coverLetterCacheRef = useRef<Record<number, CoverLetterState>>({});
  const [coverLetterResults, setCoverLetterResults] = useState<Record<number, CoverLetterState>>({});
  const [coverLetterTones, setCoverLetterTones] = useState<Record<number, string>>({});
  const [copiedJobId, setCopiedJobId] = useState<number | null>(null);

  const connectionsCacheRef = useRef<Record<string, Connection[]>>({});
  const [connectionsMap, setConnectionsMap] = useState<Record<string, Connection[]>>({});
  const [connAddForm, setConnAddForm] = useState<Record<string, { show: boolean; name: string; relationship: string; notes: string }>>({});

  const runAnalysis = useCallback((id: number) => {
    analysisCacheRef.current[id] = 'loading';
    setAnalysisResults(prev => ({ ...prev, [id]: 'loading' }));
    fetch(`/api/jobs/${id}/analyze`, { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        const result: AnalysisState = data.error ? 'error' : data;
        analysisCacheRef.current[id] = result;
        setAnalysisResults(prev => ({ ...prev, [id]: result }));
        if (!data.error && typeof data.total === 'number') {
          const score = Math.round(data.total / 10);
          fetch(`/api/jobs/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ match_score: score }) });
          setJobs(prev => prev.map(j => j.id === id ? { ...j, match_score: score } : j));
        }
      })
      .catch(() => {
        analysisCacheRef.current[id] = 'error';
        setAnalysisResults(prev => ({ ...prev, [id]: 'error' }));
      });
  }, []);

  const refreshAnalysis = useCallback((id: number) => {
    delete analysisCacheRef.current[id];
    runAnalysis(id);
  }, [runAnalysis]);

  const runDetails = useCallback((id: number) => {
    detailsCacheRef.current[id] = 'loading';
    setDetailsResults(prev => ({ ...prev, [id]: 'loading' }));
    fetch(`/api/jobs/${id}/details`, { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        const result: DetailsState = data.error ? 'error' : data;
        detailsCacheRef.current[id] = result;
        setDetailsResults(prev => ({ ...prev, [id]: result }));
      })
      .catch(() => {
        detailsCacheRef.current[id] = 'error';
        setDetailsResults(prev => ({ ...prev, [id]: 'error' }));
      });
  }, []);

  const refreshDetails = useCallback((id: number) => {
    delete detailsCacheRef.current[id];
    runDetails(id);
  }, [runDetails]);

  const runGaps = useCallback((id: number) => {
    gapsCacheRef.current[id] = 'loading';
    setGapsResults(prev => ({ ...prev, [id]: 'loading' }));
    fetch(`/api/jobs/${id}/gaps`, { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        const result: GapsState = data.error ? 'error' : data;
        gapsCacheRef.current[id] = result;
        setGapsResults(prev => ({ ...prev, [id]: result }));
      })
      .catch(() => { gapsCacheRef.current[id] = 'error'; setGapsResults(prev => ({ ...prev, [id]: 'error' })); });
  }, []);

  const runBullets = useCallback((id: number) => {
    bulletsCacheRef.current[id] = 'loading';
    setBulletsResults(prev => ({ ...prev, [id]: 'loading' }));
    fetch(`/api/jobs/${id}/bullets`, { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        const result: BulletsState = data.error ? 'error' : data;
        bulletsCacheRef.current[id] = result;
        setBulletsResults(prev => ({ ...prev, [id]: result }));
      })
      .catch(() => { bulletsCacheRef.current[id] = 'error'; setBulletsResults(prev => ({ ...prev, [id]: 'error' })); });
  }, []);

  const runCoverLetter = useCallback((id: number, tone: string) => {
    coverLetterCacheRef.current[id] = 'loading';
    setCoverLetterResults(prev => ({ ...prev, [id]: 'loading' }));
    fetch(`/api/jobs/${id}/cover-letter`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tone }) })
      .then(r => r.json())
      .then(data => {
        const result: CoverLetterState = data.error ? 'error' : data;
        coverLetterCacheRef.current[id] = result;
        setCoverLetterResults(prev => ({ ...prev, [id]: result }));
      })
      .catch(() => { coverLetterCacheRef.current[id] = 'error'; setCoverLetterResults(prev => ({ ...prev, [id]: 'error' })); });
  }, []);

  const fetchConnections = useCallback(async (company: string) => {
    if (!company || connectionsCacheRef.current[company] !== undefined) return;
    connectionsCacheRef.current[company] = [];
    const data = await fetch(`/api/connections?company=${encodeURIComponent(company)}`).then(r => r.json()).catch(() => []);
    connectionsCacheRef.current[company] = data;
    setConnectionsMap(prev => ({ ...prev, [company]: data }));
  }, []);

  const addConnection = async (company: string) => {
    const f = connAddForm[company];
    if (!f?.name.trim()) return;
    const data = await fetch('/api/connections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company, name: f.name.trim(), relationship: f.relationship.trim() || null, notes: f.notes.trim() || null }) }).then(r => r.json());
    const updated = [...(connectionsCacheRef.current[company] || []), data];
    connectionsCacheRef.current[company] = updated;
    setConnectionsMap(prev => ({ ...prev, [company]: updated }));
    setConnAddForm(prev => ({ ...prev, [company]: { show: false, name: '', relationship: '', notes: '' } }));
  };

  const cycleConnStatus = async (company: string, connId: number, current: string) => {
    const next = CONN_CYCLE[(CONN_CYCLE.indexOf(current) + 1) % CONN_CYCLE.length];
    await fetch(`/api/connections/${connId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next }) });
    const updated = (connectionsMap[company] || []).map(c => c.id === connId ? { ...c, status: next } : c);
    connectionsCacheRef.current[company] = updated;
    setConnectionsMap(prev => ({ ...prev, [company]: updated }));
  };

  const deleteConnection = async (company: string, connId: number) => {
    await fetch(`/api/connections/${connId}`, { method: 'DELETE' });
    const updated = (connectionsCacheRef.current[company] || []).filter(c => c.id !== connId);
    connectionsCacheRef.current[company] = updated;
    setConnectionsMap(prev => ({ ...prev, [company]: updated }));
  };

  // Import modal
  const [importStep, setImportStep] = useState<null | 'input' | 'loading' | 'review'>(null);
  const [importUrl, setImportUrl] = useState('');
  const [importForm, setImportForm] = useState<FormData>(EMPTY_FORM);
  const [importWarning, setImportWarning] = useState('');
  const [importFetchError, setImportFetchError] = useState('');
  const [importExtraText, setImportExtraText] = useState('');
  const [importExtraLink, setImportExtraLink] = useState('');
  const [importImage, setImportImage] = useState<{ base64: string; mediaType: string; previewUrl: string } | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const previewUrl = URL.createObjectURL(file);
    const reader = new FileReader();
    reader.onload = ev => {
      const r = ev.target?.result as string;
      setImportImage({ base64: r.split(',')[1], mediaType: file.type, previewUrl });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };
  const removeImage = () => { if (importImage?.previewUrl) URL.revokeObjectURL(importImage.previewUrl); setImportImage(null); };
  const openImport = () => { setImportUrl(''); setImportForm(EMPTY_FORM); setImportWarning(''); setImportFetchError(''); setImportExtraText(''); setImportExtraLink(''); removeImage(); setImportStep('input'); };
  const closeImport = () => { removeImage(); setImportStep(null); };

  const fetchImport = async () => {
    const trimmed = importUrl.trim();
    if (!trimmed) return;
    setImportFetchError(''); setImportStep('loading');
    try {
      const res = await fetch('/api/jobs/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed, extraText: importExtraText.trim() || undefined, imageBase64: importImage?.base64, imageMediaType: importImage?.mediaType, extraLink: importExtraLink.trim() || undefined }),
      });
      const data = await res.json();
      if (data.error && !data.url) { setImportFetchError(data.error); setImportStep('input'); return; }
      setImportWarning(data.warning || '');
      setImportForm({ company: data.company||'', title: data.title||'', type: data.type||'fall-2026-internship', status: 'saved', match_score: '', location: data.location||'', source: data.source||'company site', posting_date: data.posting_date||'', deadline: data.deadline||'', url: data.url||trimmed, salary_range: data.salary_range||'', notes: '', description: data.description||'' });
      setImportStep('review');
    } catch { setImportFetchError('Request failed.'); setImportStep('input'); }
  };

  const handleImportSave = async () => {
    setSaving(true);
    await fetch('/api/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...importForm, match_score: importForm.match_score ? parseInt(importForm.match_score) : null }) });
    setSaving(false); closeImport(); fetchJobs();
  };

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    const data = await fetch('/api/jobs').then(r => r.json());
    setJobs(data);
    setLoading(false);
    setExpandedCompanies(new Set([...new Set(data.map((j: Job) => j.company))] as string[]));
  }, []);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const handleSave = async () => {
    setSaving(true);
    const payload = { ...form, match_score: form.match_score ? parseInt(form.match_score) : null };
    if (editingJob) {
      await fetch(`/api/jobs/${editingJob.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    } else {
      await fetch('/api/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    }
    setSaving(false); setShowModal(false); fetchJobs();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this job?')) return;
    await fetch(`/api/jobs/${id}`, { method: 'DELETE' });
    setExpandedJobs(prev => { const n = new Set(prev); n.delete(id); return n; });
    fetchJobs();
  };

  const handleStatusChange = async (id: number, status: string) => {
    await fetch(`/api/jobs/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    setJobs(prev => prev.map(j => j.id === id ? { ...j, status } : j));
  };

  const handleStarToggle = async (id: number, current: number) => {
    const starred = current ? 0 : 1;
    await fetch(`/api/jobs/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ starred }) });
    setJobs(prev => prev.map(j => j.id === id ? { ...j, starred } : j));
  };

  const toggleJob = useCallback((id: number) => {
    setExpandedJobs(prev => {
      const n = new Set(prev);
      if (n.has(id)) { n.delete(id); }
      else {
        n.add(id);
        // Only auto-score if this job has never been scored — avoids re-calling on every page load
        const thisJob = jobs.find(j => j.id === id);
        if (!analysisCacheRef.current[id] && !thisJob?.match_score) runAnalysis(id);
        fetchConnections(thisJob?.company || '');
        // Details load on-demand when the tab is clicked (see setTab)
      }
      return n;
    });
    setJobTabs(prev => prev[id] ? prev : { ...prev, [id]: 'overview' });
  }, [runAnalysis, fetchConnections, jobs]);

  const setTab = (id: number, tab: string) => {
    setJobTabs(prev => ({ ...prev, [id]: tab }));
    if (tab === 'score' && !analysisCacheRef.current[id]) {
      // Only auto-run if this job has never been scored in the DB
      const thisJob = jobs.find(j => j.id === id);
      if (!thisJob?.match_score) runAnalysis(id);
    }
    if (tab === 'description' && !detailsCacheRef.current[id]) runDetails(id);
    if (tab === 'gaps' && !gapsCacheRef.current[id]) runGaps(id);
    if (tab === 'bullets' && !bulletsCacheRef.current[id]) runBullets(id);
  };

  const openEdit = (job: Job) => {
    setEditingJob(job);
    setForm({ company: job.company, title: job.title, type: job.type, status: job.status, match_score: job.match_score?.toString()||'', location: job.location||'', source: job.source||'', posting_date: job.posting_date||'', deadline: job.deadline||'', url: job.url||'', salary_range: job.salary_range||'', notes: job.notes||'', description: job.description||'' });
    setShowModal(true);
  };

  const handleSort = (col: string) => {
    const clicks = (sortClicks[col] || 0) + 1;
    if (clicks === 3) { setSortBy(null); setSortDir('asc'); setSortClicks(p => ({ ...p, [col]: 0 })); }
    else { setSortBy(col); setSortDir(clicks === 1 ? 'asc' : 'desc'); setSortClicks(p => ({ ...p, [col]: clicks })); }
  };

  const filteredJobs = jobs.filter(job => {
    if (searchText.trim() && !job.company.toLowerCase().includes(searchText.toLowerCase()) && !job.title.toLowerCase().includes(searchText.toLowerCase())) return false;
    if (statusFilter !== 'all' && job.status !== statusFilter) return false;
    if (typeFilter !== 'all' && job.type !== typeFilter) return false;
    if (starFilter && !job.starred) return false;
    return true;
  });

  const sortedJobs = [...filteredJobs].sort((a, b) => {
    if (!sortBy) return (b.starred - a.starred); // stars float up by default
    let cmp = 0;
    if (sortBy === 'match_score') cmp = (a.match_score ?? -1) - (b.match_score ?? -1);
    else if (sortBy === 'deadline') { if (!a.deadline && !b.deadline) cmp = 0; else if (!a.deadline) cmp = 1; else if (!b.deadline) cmp = -1; else cmp = new Date(a.deadline).getTime() - new Date(b.deadline).getTime(); }
    else if (sortBy === 'posting_date') { if (!a.posting_date && !b.posting_date) cmp = 0; else if (!a.posting_date) cmp = 1; else if (!b.posting_date) cmp = -1; else cmp = new Date(a.posting_date).getTime() - new Date(b.posting_date).getTime(); }
    else if (sortBy === 'title') cmp = a.title.localeCompare(b.title);
    else if (sortBy === 'status') cmp = a.status.localeCompare(b.status);
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const grouped = sortedJobs.reduce((acc, job) => {
    if (!acc[job.company]) acc[job.company] = [];
    acc[job.company].push(job);
    return acc;
  }, {} as Record<string, Job[]>);

  const stats = {
    total: jobs.length,
    applied: jobs.filter(j => j.status === 'applied').length,
    interviewing: jobs.filter(j => j.status === 'interviewing').length,
    offers: jobs.filter(j => j.status === 'offer').length,
    starred: jobs.filter(j => j.starred).length,
  };

  const SortIcon = ({ col }: { col: string }) => sortBy !== col ? null : <span style={{ marginLeft: '3px', fontSize: '9px' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>;
  const colHdr = (col: string): React.CSSProperties => ({ cursor: 'pointer', userSelect: 'none', color: sortBy === col ? '#3b82f6' : '#94a3b8', display: 'flex', alignItems: 'center' });

  const GRID = '28px 1fr 90px 95px 46px 90px 90px 72px';
  const GAP = '0 8px';

  const isStale = (job: Job) => job.status === 'applied' && !!job.status_updated_at && (Date.now() - new Date(job.status_updated_at).getTime()) / 86400000 >= 14;

  return (
    <div style={{ padding: '28px 32px', minHeight: '100vh', backgroundColor: '#f1f5f9' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ color: '#0f172a', fontSize: '18px', fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>Job Tracker</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '5px' }}>
            {[
              { label: 'tracked', value: stats.total, color: '#64748b', always: true },
              { label: 'applied', value: stats.applied, color: '#93c5fd', always: false },
              { label: 'interviewing', value: stats.interviewing, color: '#fde68a', always: false },
              { label: stats.offers === 1 ? 'offer' : 'offers', value: stats.offers, color: '#86efac', always: false },
              { label: 'starred', value: stats.starred, color: '#3b82f6', always: false },
            ].filter(s => s.always || s.value > 0).map(({ label, value, color }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'baseline', gap: '3px' }}>
                <span style={{ color, fontWeight: 700, fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
                <span style={{ color: '#cbd5e1', fontSize: '11px' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={openImport} style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', color: '#fff', border: 'none',
            borderRadius: '7px', padding: '8px 16px', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
            boxShadow: '0 0 16px rgba(59,130,246,0.25)',
          }}>
            <LinkIcon size={13} /> Import from URL
          </button>
          <button onClick={() => { setEditingJob(null); setForm(EMPTY_FORM); setShowModal(true); }} style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            backgroundColor: '#ffffff', color: '#94a3b8', border: '1px solid #e2e8f0',
            borderRadius: '7px', padding: '8px 12px', fontSize: '12px', fontWeight: 500, cursor: 'pointer',
          }}>
            <Plus size={12} /> Manual
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {/* Row 1: search + status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <input
            type="text" placeholder="Search..."
            value={searchText} onChange={e => setSearchText(e.target.value)}
            style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '6px 12px', color: '#0f172a', fontSize: '12px', outline: 'none', width: '160px', flexShrink: 0 }}
          />
          <div style={{ display: 'flex', gap: '4px' }}>
            {['all','saved','applied','interviewing','offer','rejected'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)} style={{
                backgroundColor: statusFilter === s ? '#3b82f6' : '#ffffff',
                color: statusFilter === s ? '#fff' : '#64748b',
                border: `1px solid ${statusFilter === s ? '#3b82f6' : '#e2e8f0'}`,
                borderRadius: '20px', padding: '4px 10px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize', transition: 'all 0.1s',
              }}>{s === 'all' ? 'All' : s}</button>
            ))}
          </div>
        </div>
        {/* Row 2: type + starred */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {['all', ...TYPE_OPTIONS.map(t => t.value)].map(v => {
            const label = v === 'all' ? 'All Types' : TYPE_OPTIONS.find(t => t.value === v)?.label || v;
            return (
              <button key={v} onClick={() => setTypeFilter(v)} style={{
                backgroundColor: typeFilter === v ? '#7c3aed' : '#ffffff',
                color: typeFilter === v ? '#fff' : '#64748b',
                border: `1px solid ${typeFilter === v ? '#7c3aed' : '#e2e8f0'}`,
                borderRadius: '20px', padding: '4px 10px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.1s',
              }}>{label}</button>
            );
          })}
          <div style={{ width: '1px', height: '16px', backgroundColor: '#e2e8f0', margin: '0 4px' }} />
          <button onClick={() => setStarFilter(p => !p)} style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            backgroundColor: starFilter ? 'rgba(6,182,212,0.08)' : '#ffffff',
            color: starFilter ? '#3b82f6' : '#64748b',
            border: `1px solid ${starFilter ? 'rgba(59,130,246,0.3)' : '#e2e8f0'}`,
            borderRadius: '20px', padding: '4px 10px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.1s',
          }}>
            <Star size={11} fill={starFilter ? '#3b82f6' : 'none'} /> Starred
          </button>
        </div>
      </div>
      {(searchText || statusFilter !== 'all' || typeFilter !== 'all' || starFilter) && (
        <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '10px' }}>
          {sortedJobs.length} result{sortedJobs.length !== 1 ? 's' : ''}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ color: '#cbd5e1', textAlign: 'center', padding: '80px', fontSize: '13px' }}>Loading...</div>
      ) : jobs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 32px' }}>
          <LinkIcon size={28} color="#ffffff" style={{ marginBottom: '16px' }} />
          <div style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '6px' }}>No jobs tracked yet</div>
          <div style={{ color: '#cbd5e1', fontSize: '12px', marginBottom: '24px' }}>Paste a job posting URL to get started</div>
          <button onClick={openImport} style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', color: '#fff', border: 'none',
            borderRadius: '7px', padding: '10px 20px', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
          }}>
            <LinkIcon size={13} /> Import from URL
          </button>
        </div>
      ) : (
        <div style={{ backgroundColor: '#f8fafc', border: '1px solid #ffffff', borderRadius: '16px', overflow: 'hidden' }}>
          {/* Column headers */}
          <div style={{
            display: 'grid', gridTemplateColumns: GRID, gap: GAP,
            padding: '9px 16px', borderBottom: '1px solid #f8fafc',
            fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
          }}>
            <div />
            <div style={colHdr('title')} onClick={() => handleSort('title')}>Title <SortIcon col="title" /></div>
            <div style={colHdr('type')} onClick={() => handleSort('type')}>Type <SortIcon col="type" /></div>
            <div style={colHdr('status')} onClick={() => handleSort('status')}>Status <SortIcon col="status" /></div>
            <div style={colHdr('match_score')} onClick={() => handleSort('match_score')}>Score <SortIcon col="match_score" /></div>
            <div style={colHdr('deadline')} onClick={() => handleSort('deadline')}>Deadline <SortIcon col="deadline" /></div>
            <div style={colHdr('posting_date')} onClick={() => handleSort('posting_date')}>Posted <SortIcon col="posting_date" /></div>
            <div style={{ color: '#94a3b8' }}>Actions</div>
          </div>

          {Object.entries(grouped).map(([company, companyJobs], groupIdx) => {
            const isExpanded = expandedCompanies.has(company);
            const isLast = groupIdx === Object.entries(grouped).length - 1;
            const [badgeBg] = getCompanyColor(company);
            return (
              <div key={company}>
                {/* Company header */}
                <div onClick={() => setExpandedCompanies(prev => { const n = new Set(prev); n.has(company) ? n.delete(company) : n.add(company); return n; })}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '11px 16px', backgroundColor: '#ffffff',
                    borderTop: groupIdx > 0 ? '1px solid #f8fafc' : undefined,
                    borderBottom: isExpanded ? '1px solid #f8fafc' : (!isLast ? '1px solid #f8fafc' : undefined),
                    borderLeft: `3px solid ${badgeBg}`,
                    cursor: 'pointer', userSelect: 'none',
                  }}>
                  {isExpanded ? <ChevronDown size={11} color="#94a3b8" /> : <ChevronRight size={11} color="#94a3b8" />}
                  <CompanyBadge company={company} size={22} />
                  <span style={{ color: '#334155', fontWeight: 700, fontSize: '13px' }}>{company}</span>
                  <span style={{ backgroundColor: '#f8fafc', color: '#94a3b8', borderRadius: '20px', padding: '1px 7px', fontSize: '10px', fontWeight: 500 }}>
                    {companyJobs.length} {companyJobs.length === 1 ? 'role' : 'roles'}
                  </span>
                  {companyJobs.some(j => j.starred) && <Star size={11} color="#3b82f6" fill="#3b82f6" />}
                </div>

                {isExpanded && companyJobs.map((job, idx) => {
                  const isJobExpanded = expandedJobs.has(job.id);
                  const activeTab = jobTabs[job.id] || 'overview';
                  const analysis = analysisResults[job.id];
                  const isLastInGroup = idx === companyJobs.length - 1;
                  return (
                    <div key={job.id}>
                      {/* Job row */}
                      <div
                        onClick={() => toggleJob(job.id)}
                        style={{
                          display: 'grid', gridTemplateColumns: GRID, gap: GAP, alignItems: 'center',
                          padding: '12px 16px',
                          borderBottom: (isJobExpanded || !isLastInGroup) ? '1px solid #f1f5f9' : undefined,
                          cursor: 'pointer', transition: 'background 0.1s',
                          backgroundColor: isJobExpanded ? '#ffffff' : 'transparent',
                        }}
                        onMouseEnter={e => !isJobExpanded && (e.currentTarget.style.backgroundColor = '#ffffff')}
                        onMouseLeave={e => !isJobExpanded && (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        {/* Star */}
                        <div onClick={e => { e.stopPropagation(); handleStarToggle(job.id, job.starred); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                          <Star size={13} color={job.starred ? '#3b82f6' : '#cbd5e1'} fill={job.starred ? '#3b82f6' : 'none'}
                            style={{ transition: 'all 0.15s' }} />
                        </div>

                        {/* Title */}
                        <div>
                          <div style={{ color: '#0f172a', fontWeight: 600, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {job.title}
                          </div>
                          {isStale(job) && (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', marginTop: '3px', backgroundColor: 'rgba(168,85,247,0.08)', borderRadius: '20px', padding: '1px 6px' }}>
                              <div style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#a855f7' }} />
                              <span style={{ color: '#a855f7', fontSize: '10px', fontWeight: 600 }}>Follow up</span>
                            </div>
                          )}
                        </div>

                        {/* Type */}
                        <div>
                          <span style={{ color: TYPE_COLORS[job.type] || '#94a3b8', fontSize: '10px', fontWeight: 700, letterSpacing: '0.02em' }}>
                            {TYPE_OPTIONS.find(t => t.value === job.type)?.label || job.type}
                          </span>
                        </div>

                        {/* Status */}
                        <div onClick={e => e.stopPropagation()}>
                          <StatusBadge job={job} onStatusChange={handleStatusChange} />
                        </div>

                        {/* Score */}
                        <div>
                          {job.match_score ? (
                            <span style={{ color: job.match_score >= 8 ? '#22c55e' : job.match_score >= 6 ? '#3b82f6' : '#f87171', fontWeight: 800, fontSize: '12px', fontVariantNumeric: 'tabular-nums' }}>
                              {job.match_score}/10
                            </span>
                          ) : <span style={{ color: '#cbd5e1' }}>—</span>}
                        </div>

                        {/* Deadline */}
                        <div><DeadlineDisplay deadline={job.deadline} /></div>

                        {/* Posted date */}
                        <div><PostedDisplay date={job.posting_date} /></div>

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: '2px', alignItems: 'center', justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                          <button onClick={() => openEdit(job)} title="Edit" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: '5px', borderRadius: '20px', display: 'flex' }}
                            onMouseEnter={e => (e.currentTarget.style.color = '#64748b')} onMouseLeave={e => (e.currentTarget.style.color = '#cbd5e1')}>
                            <Edit2 size={11} />
                          </button>
                          <button onClick={() => window.location.href = `/coach?prefill=cover-letter&company=${encodeURIComponent(job.company)}&title=${encodeURIComponent(job.title)}`} title="Cover letter" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: '5px', borderRadius: '20px', display: 'flex' }}
                            onMouseEnter={e => (e.currentTarget.style.color = '#3b82f6')} onMouseLeave={e => (e.currentTarget.style.color = '#cbd5e1')}>
                            <FileText size={11} />
                          </button>
                          <button onClick={() => handleDelete(job.id)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: '5px', borderRadius: '20px', display: 'flex' }}
                            onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')} onMouseLeave={e => (e.currentTarget.style.color = '#cbd5e1')}>
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>

                      {/* Expanded panel */}
                      {isJobExpanded && (
                        <div style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #ffffff', padding: '0 16px 24px' }}>
                          {/* Tabs */}
                          <div style={{ display: 'flex', gap: '0px', borderBottom: '1px solid #ffffff', marginBottom: '20px', paddingTop: '14px', flexWrap: 'nowrap', overflowX: 'auto' }}>
                            {[
                              { id: 'overview',      label: 'Overview' },
                              { id: 'description',   label: 'Job Details' },
                              { id: 'score',         label: '✦ AI Score' },
                              { id: 'cover-letter',  label: 'Cover Letter' },
                              { id: 'gaps',          label: 'Fit Gaps' },
                              { id: 'bullets',       label: 'Bullets' },
                            ].map(tab => (
                              <button key={tab.id} onClick={() => setTab(job.id, tab.id)} style={{
                                backgroundColor: 'transparent',
                                color: activeTab === tab.id ? '#3b82f6' : '#94a3b8',
                                border: 'none', borderBottom: activeTab === tab.id ? '2px solid #3b82f6' : '2px solid transparent',
                                padding: '6px 14px', fontSize: '11px', fontWeight: activeTab === tab.id ? 700 : 400,
                                cursor: 'pointer', fontFamily: 'inherit', marginBottom: '-1px', transition: 'color 0.1s',
                                whiteSpace: 'nowrap',
                              }}
                                onMouseEnter={e => { if (activeTab !== tab.id) e.currentTarget.style.color = '#64748b'; }}
                                onMouseLeave={e => { if (activeTab !== tab.id) e.currentTarget.style.color = '#94a3b8'; }}
                              >{tab.label}</button>
                            ))}
                          </div>

                          {/* Overview tab */}
                          {activeTab === 'overview' && (
                            <div>
                              {job.url && (
                                <a href={job.url} target="_blank" rel="noopener noreferrer" style={{
                                  display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '18px',
                                  backgroundColor: '#3b82f6', color: '#fff', borderRadius: '7px',
                                  padding: '8px 18px', fontSize: '13px', fontWeight: 700, textDecoration: 'none',
                                  boxShadow: '0 0 16px rgba(59,130,246,0.2)',
                                }}>
                                  <ExternalLink size={13} /> Open Job Posting
                                </a>
                              )}
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px 20px', marginBottom: '14px' }}>
                                {[
                                  { label: 'Location', value: job.location },
                                  { label: 'Deadline', value: job.deadline ? <><span style={{ color: '#64748b' }}>{job.deadline}</span> <DeadlineDisplay deadline={job.deadline} /></> : null },
                                  { label: 'Salary', value: job.salary_range },
                                  { label: 'Type', value: job.type ? <span style={{ color: TYPE_COLORS[job.type] || '#64748b', fontWeight: 700 }}>{TYPE_OPTIONS.find(t => t.value === job.type)?.label}</span> : null },
                                  { label: 'Source', value: job.source },
                                  { label: 'Posted', value: job.posting_date },
                                ].map(({ label, value }) => (
                                  value ? (
                                    <div key={label}>
                                      <div style={{ color: '#94a3b8', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '4px' }}>{label}</div>
                                      <div style={{ color: '#64748b', fontSize: '12px', lineHeight: 1.4 }}>{value}</div>
                                    </div>
                                  ) : null
                                ))}
                              </div>
                              {job.notes && (
                                <div style={{ backgroundColor: '#ffffff', borderRadius: '14px', padding: '12px 14px' }}>
                                  <div style={{ color: '#94a3b8', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px' }}>Notes</div>
                                  <div style={{ color: '#64748b', fontSize: '12px', lineHeight: 1.6 }}>{job.notes}</div>
                                </div>
                              )}

                              {/* Network / Connections */}
                              {(() => {
                                const conns = connectionsMap[job.company] || [];
                                const form = connAddForm[job.company] || { show: false, name: '', relationship: '', notes: '' };
                                return (
                                  <div style={{ backgroundColor: '#ffffff', borderRadius: '14px', padding: '12px 14px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: conns.length > 0 || form.show ? '10px' : 0 }}>
                                      <div style={{ color: '#94a3b8', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        Network
                                        {conns.length > 0 && <span style={{ backgroundColor: '#f1f5f9', color: '#64748b', borderRadius: '20px', padding: '0 5px', fontSize: '9px', fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>{conns.length}</span>}
                                      </div>
                                      <button onClick={() => setConnAddForm(prev => ({ ...prev, [job.company]: { ...form, show: !form.show } }))} style={{ background: 'none', border: 'none', color: form.show ? '#3b82f6' : '#cbd5e1', cursor: 'pointer', fontSize: '11px', fontWeight: 600, padding: '1px 4px', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '3px', borderRadius: '4px' }}
                                        onMouseEnter={e => { if (!form.show) e.currentTarget.style.color = '#64748b'; }}
                                        onMouseLeave={e => { if (!form.show) e.currentTarget.style.color = '#cbd5e1'; }}>
                                        <Plus size={11} /> Add
                                      </button>
                                    </div>

                                    {conns.length === 0 && !form.show && (
                                      <div style={{ color: '#cbd5e1', fontSize: '11px', fontStyle: 'italic' }}>No connections at {job.company} yet.</div>
                                    )}

                                    {conns.length > 0 && (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: form.show ? '10px' : 0 }}>
                                        {conns.map(conn => {
                                          const cs = CONN_STATUS[conn.status] || CONN_STATUS.not_reached_out;
                                          return (
                                            <div key={conn.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#f8fafc', borderRadius: '8px', padding: '7px 10px' }}>
                                              <div style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: cs.color, flexShrink: 0 }} />
                                              <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ color: '#334155', fontSize: '12px', fontWeight: 600 }}>{conn.name}</div>
                                                {conn.relationship && <div style={{ color: '#94a3b8', fontSize: '10px' }}>{conn.relationship}</div>}
                                              </div>
                                              <button onClick={() => cycleConnStatus(job.company, conn.id, conn.status)} style={{ backgroundColor: cs.bg, color: cs.color, border: 'none', borderRadius: '20px', padding: '3px 9px', fontSize: '10px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, whiteSpace: 'nowrap' }}
                                                title="Click to update status">
                                                {cs.label}
                                              </button>
                                              <button onClick={() => deleteConnection(job.company, conn.id)} style={{ background: 'none', border: 'none', color: '#e2e8f0', cursor: 'pointer', padding: '2px', display: 'flex', flexShrink: 0 }}
                                                onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                                                onMouseLeave={e => (e.currentTarget.style.color = '#e2e8f0')}>
                                                <Trash2 size={11} />
                                              </button>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}

                                    {form.show && (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px' }}>
                                          <input placeholder="Name *" value={form.name} onChange={e => setConnAddForm(prev => ({ ...prev, [job.company]: { ...form, name: e.target.value } }))} onKeyDown={e => { if (e.key === 'Enter') addConnection(job.company); if (e.key === 'Escape') setConnAddForm(prev => ({ ...prev, [job.company]: { show: false, name: '', relationship: '', notes: '' } })); }} autoFocus style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '7px 10px', color: '#0f172a', fontSize: '12px', outline: 'none', fontFamily: 'inherit' }} onFocus={e => (e.target.style.borderColor = '#3b82f6')} onBlur={e => (e.target.style.borderColor = '#e2e8f0')} />
                                          <input placeholder="How you know them" value={form.relationship} onChange={e => setConnAddForm(prev => ({ ...prev, [job.company]: { ...form, relationship: e.target.value } }))} style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '7px 10px', color: '#0f172a', fontSize: '12px', outline: 'none', fontFamily: 'inherit' }} onFocus={e => (e.target.style.borderColor = '#3b82f6')} onBlur={e => (e.target.style.borderColor = '#e2e8f0')} />
                                        </div>
                                        <input placeholder="Notes (optional)" value={form.notes} onChange={e => setConnAddForm(prev => ({ ...prev, [job.company]: { ...form, notes: e.target.value } }))} style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '7px 10px', color: '#0f172a', fontSize: '12px', outline: 'none', fontFamily: 'inherit' }} onFocus={e => (e.target.style.borderColor = '#3b82f6')} onBlur={e => (e.target.style.borderColor = '#e2e8f0')} />
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                          <button onClick={() => addConnection(job.company)} disabled={!form.name.trim()} style={{ backgroundColor: form.name.trim() ? '#3b82f6' : '#f1f5f9', color: form.name.trim() ? '#fff' : '#94a3b8', border: 'none', borderRadius: '8px', padding: '6px 14px', fontSize: '12px', fontWeight: 600, cursor: form.name.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>Save</button>
                                          <button onClick={() => setConnAddForm(prev => ({ ...prev, [job.company]: { show: false, name: '', relationship: '', notes: '' } }))} style={{ backgroundColor: 'transparent', color: '#94a3b8', border: 'none', padding: '6px 10px', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          )}

                          {/* Job Details tab */}
                          {activeTab === 'description' && (() => {
                            const details = detailsResults[job.id];
                            const rawVisible = showRawJd[job.id];
                            return (
                              <div>
                                {(!details || details === 'loading') && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', fontSize: '12px', padding: '20px 0' }}>
                                    <Loader size={14} color="#3b82f6" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                                    Generating job breakdown...
                                  </div>
                                )}
                                {details === 'error' && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '12px', padding: '12px 0' }}>
                                    <AlertCircle size={13} color="#ef4444" />
                                    Failed to generate.{' '}
                                    <button onClick={() => refreshDetails(job.id)} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '12px', padding: 0, fontFamily: 'inherit' }}>Retry</button>
                                  </div>
                                )}
                                {details && details !== 'loading' && details !== 'error' && (() => {
                                  const d = details as DetailsResult;
                                  return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

                                      {/* Company + Role row */}
                                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                        <div style={{ backgroundColor: '#ffffff', borderRadius: '14px', padding: '14px 16px' }}>
                                          <div style={{ color: '#94a3b8', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Company</div>
                                          <p style={{ color: '#64748b', fontSize: '12px', lineHeight: 1.65, margin: 0 }}>{d.company_overview}</p>
                                        </div>
                                        <div style={{ backgroundColor: '#ffffff', borderRadius: '14px', padding: '14px 16px' }}>
                                          <div style={{ color: '#94a3b8', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>The Role</div>
                                          <p style={{ color: '#64748b', fontSize: '12px', lineHeight: 1.65, margin: 0 }}>{d.role_summary}</p>
                                        </div>
                                      </div>

                                      {/* Qualifications */}
                                      <div style={{ backgroundColor: '#ffffff', borderRadius: '14px', padding: '14px 16px' }}>
                                        <div style={{ color: '#94a3b8', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>What They&apos;re Looking For</div>
                                        <ul style={{ margin: 0, paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                          {d.key_qualifications.map((q, i) => (
                                            <li key={i} style={{ color: '#64748b', fontSize: '12px', lineHeight: 1.5 }}>{q}</li>
                                          ))}
                                        </ul>
                                      </div>

                                      {/* Your Angle — highlighted */}
                                      <div style={{ backgroundColor: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.18)', borderRadius: '14px', padding: '14px 16px' }}>
                                        <div style={{ color: '#2563eb', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>✦ Your Angle</div>
                                        <p style={{ color: '#2563eb', fontSize: '12px', lineHeight: 1.65, margin: 0 }}>{d.what_to_highlight}</p>
                                      </div>

                                      {/* Footer: refresh + raw JD toggle */}
                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <button onClick={() => refreshDetails(job.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: '11px', padding: 0, fontFamily: 'inherit' }}
                                          onMouseEnter={e => (e.currentTarget.style.color = '#64748b')} onMouseLeave={e => (e.currentTarget.style.color = '#cbd5e1')}>
                                          <RotateCcw size={10} /> Regenerate
                                        </button>
                                        {job.description && (
                                          <button onClick={() => setShowRawJd(p => ({ ...p, [job.id]: !p[job.id] }))} style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: '11px', padding: 0, fontFamily: 'inherit' }}
                                            onMouseEnter={e => (e.currentTarget.style.color = '#64748b')} onMouseLeave={e => (e.currentTarget.style.color = '#cbd5e1')}>
                                            {rawVisible ? 'Hide raw JD' : 'View raw JD'}
                                          </button>
                                        )}
                                      </div>

                                      {/* Raw JD */}
                                      {rawVisible && job.description && (
                                        <div style={{ backgroundColor: '#f8fafc', border: '1px solid #ffffff', borderRadius: '14px', padding: '14px 16px', maxHeight: '280px', overflowY: 'auto' }}>
                                          <pre style={{ color: '#94a3b8', fontSize: '11px', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, fontFamily: 'inherit' }}>
                                            {job.description}
                                          </pre>
                                        </div>
                                      )}

                                    </div>
                                  );
                                })()}
                              </div>
                            );
                          })()}

                          {/* Score tab */}
                          {activeTab === 'score' && (
                            <div>
                              {analysis === 'loading' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', fontSize: '12px', padding: '20px 0' }}>
                                  <Loader size={14} color="#3b82f6" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                                  Analyzing fit against your profile...
                                </div>
                              )}
                              {!analysis && job.match_score && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '20px', padding: '8px 0' }}>
                                  <div style={{
                                    width: '82px', height: '82px', borderRadius: '50%', flexShrink: 0,
                                    border: `3px solid ${scoreColor(job.match_score * 10)}`,
                                    boxShadow: `0 0 28px ${scoreGlow(job.match_score * 10)}`,
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                  }}>
                                    <span style={{ fontSize: '28px', fontWeight: 800, color: scoreColor(job.match_score * 10), lineHeight: 1 }}>{job.match_score * 10}</span>
                                    <span style={{ fontSize: '10px', color: '#94a3b8' }}>/100</span>
                                  </div>
                                  <div>
                                    <div style={{ color: '#64748b', fontSize: '13px', marginBottom: '8px' }}>Score from last analysis.</div>
                                    <button onClick={() => runAnalysis(job.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', backgroundColor: '#ffffff', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '10px', padding: '6px 14px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                                      Load full breakdown →
                                    </button>
                                  </div>
                                </div>
                              )}
                              {analysis === 'error' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '12px', padding: '12px 0' }}>
                                  <AlertCircle size={13} color="#ef4444" />
                                  Analysis failed.{' '}
                                  <button onClick={() => refreshAnalysis(job.id)} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '12px', padding: 0, fontFamily: 'inherit' }}>Retry</button>
                                </div>
                              )}
                              {analysis && analysis !== 'loading' && analysis !== 'error' && (() => {
                                const r = analysis as AnalysisResult;
                                return (
                                  <div>
                                    {/* Total score */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '20px' }}>
                                      <div style={{
                                        width: '82px', height: '82px', borderRadius: '50%', flexShrink: 0,
                                        border: `3px solid ${scoreColor(r.total)}`,
                                        boxShadow: `0 0 28px ${scoreGlow(r.total)}`,
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                      }}>
                                        <span style={{ fontSize: '28px', fontWeight: 800, color: scoreColor(r.total), lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{r.total}</span>
                                        <span style={{ fontSize: '10px', color: '#94a3b8' }}>/100</span>
                                      </div>
                                      <div style={{ flex: 1 }}>
                                        <div style={{ color: '#334155', fontSize: '13px', lineHeight: 1.6 }}>{r.summary}</div>
                                        <button onClick={() => refreshAnalysis(job.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '8px', background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: '11px', padding: 0, fontFamily: 'inherit' }}
                                          onMouseEnter={e => (e.currentTarget.style.color = '#64748b')} onMouseLeave={e => (e.currentTarget.style.color = '#cbd5e1')}>
                                          <RotateCcw size={10} /> Refresh
                                        </button>
                                      </div>
                                    </div>
                                    {/* Category bars */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '18px' }}>
                                      {r.categories.map(cat => (
                                        <div key={cat.name}>
                                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '5px' }}>
                                            <span style={{ color: '#334155', fontSize: '12px', fontWeight: 600 }}>{cat.name}</span>
                                            <span style={{ color: scoreColor(cat.score), fontSize: '13px', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{cat.score}</span>
                                          </div>
                                          <div style={{ backgroundColor: '#ffffff', borderRadius: '20px', height: '4px', overflow: 'hidden', marginBottom: '4px' }}>
                                            <div style={{
                                              width: `${cat.score}%`, height: '100%', borderRadius: '20px',
                                              backgroundColor: scoreColor(cat.score),
                                              boxShadow: `0 0 6px ${scoreGlow(cat.score)}`,
                                              transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)',
                                            }} />
                                          </div>
                                          <div style={{ color: '#cbd5e1', fontSize: '11px', lineHeight: 1.5 }}>{cat.rationale}</div>
                                        </div>
                                      ))}
                                    </div>
                                    <button onClick={() => {
                                        const scoreData = analysisResults[job.id];
                                        if (scoreData && scoreData !== 'loading' && scoreData !== 'error') {
                                          sessionStorage.setItem('coach-score-brief', JSON.stringify({
                                            company: job.company, title: job.title,
                                            ...(scoreData as AnalysisResult),
                                          }));
                                        }
                                        window.location.href = '/coach';
                                      }}
                                      style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                                        backgroundColor: 'transparent', color: '#a855f7', border: '1px solid rgba(168,85,247,0.3)',
                                        borderRadius: '10px', padding: '7px 14px', fontSize: '12px', fontWeight: 600,
                                        cursor: 'pointer', fontFamily: 'inherit',
                                      }}>
                                      <MessageSquare size={12} /> Discuss with Coach
                                    </button>
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                          {/* Cover Letter tab */}
                          {activeTab === 'cover-letter' && (() => {
                            const cl = coverLetterResults[job.id];
                            const tone = coverLetterTones[job.id] || 'professional';
                            const isLoading = cl === 'loading';
                            const isError = cl === 'error';
                            const result = cl && cl !== 'loading' && cl !== 'error' ? cl as CoverLetterResult : null;
                            return (
                              <div>
                                {/* Tone selector + generate */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                                  <span style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 600, flexShrink: 0 }}>Tone:</span>
                                  {(['professional', 'confident', 'concise'] as const).map(t => (
                                    <button key={t} onClick={() => setCoverLetterTones(p => ({ ...p, [job.id]: t }))} style={{
                                      backgroundColor: tone === t ? 'rgba(6,182,212,0.1)' : '#ffffff',
                                      color: tone === t ? '#3b82f6' : '#64748b',
                                      border: `1px solid ${tone === t ? 'rgba(59,130,246,0.3)' : '#e2e8f0'}`,
                                      borderRadius: '20px', padding: '4px 12px', fontSize: '11px', fontWeight: 600,
                                      cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize',
                                    }}>{t}</button>
                                  ))}
                                  <button onClick={() => runCoverLetter(job.id, tone)} disabled={isLoading} style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '5px', marginLeft: 'auto',
                                    backgroundColor: isLoading ? '#e2e8f0' : '#2563eb', color: isLoading ? '#94a3b8' : '#fff',
                                    border: 'none', borderRadius: '10px', padding: '6px 16px', fontSize: '12px', fontWeight: 700,
                                    cursor: isLoading ? 'wait' : 'pointer', fontFamily: 'inherit',
                                  }}>
                                    {isLoading ? <><Loader size={11} style={{ animation: 'spin 1s linear infinite' }} /> Generating…</> : result ? 'Regenerate' : 'Generate'}
                                  </button>
                                </div>

                                {isError && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '12px', padding: '12px 0' }}>
                                    <AlertCircle size={13} color="#ef4444" /> Failed.{' '}
                                    <button onClick={() => runCoverLetter(job.id, tone)} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '12px', padding: 0, fontFamily: 'inherit' }}>Retry</button>
                                  </div>
                                )}

                                {!cl && !isLoading && (
                                  <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '32px 20px', textAlign: 'center' }}>
                                    <div style={{ color: '#cbd5e1', fontSize: '12px' }}>Select a tone and click Generate</div>
                                  </div>
                                )}

                                {result && (
                                  <div>
                                    <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px', marginBottom: '12px', maxHeight: '360px', overflowY: 'auto', animation: 'fadeIn 0.25s ease' }}>
                                      <pre style={{ color: '#334155', fontSize: '12px', lineHeight: 1.75, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, fontFamily: 'inherit' }}>
                                        {result.letter}
                                      </pre>
                                    </div>
                                    <button
                                      onClick={() => {
                                        navigator.clipboard.writeText(result.letter);
                                        setCopiedJobId(job.id);
                                        setTimeout(() => setCopiedJobId(null), 2000);
                                      }}
                                      style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                                        backgroundColor: copiedJobId === job.id ? '#14532d' : '#ffffff',
                                        color: copiedJobId === job.id ? '#86efac' : '#64748b',
                                        border: `1px solid ${copiedJobId === job.id ? '#166534' : '#e2e8f0'}`,
                                        borderRadius: '10px', padding: '6px 14px', fontSize: '12px', fontWeight: 600,
                                        cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                                      }}>
                                      {copiedJobId === job.id ? '✓ Copied!' : 'Copy to Clipboard'}
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          {/* Fit Gaps tab */}
                          {activeTab === 'gaps' && (() => {
                            const gaps = gapsResults[job.id];
                            return (
                              <div>
                                {(!gaps || gaps === 'loading') && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', fontSize: '12px', padding: '20px 0' }}>
                                    <Loader size={14} color="#3b82f6" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                                    Analyzing fit gaps...
                                  </div>
                                )}
                                {gaps === 'error' && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '12px', padding: '12px 0' }}>
                                    <AlertCircle size={13} color="#ef4444" /> Failed.{' '}
                                    <button onClick={() => { delete gapsCacheRef.current[job.id]; runGaps(job.id); }} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '12px', padding: 0, fontFamily: 'inherit' }}>Retry</button>
                                  </div>
                                )}
                                {gaps && gaps !== 'loading' && gaps !== 'error' && (() => {
                                  const g = gaps as GapsResult;
                                  return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', animation: 'fadeIn 0.25s ease' }}>

                                      {/* Positioning */}
                                      <div style={{ backgroundColor: 'rgba(5,150,105,0.05)', border: '1px solid rgba(5,150,105,0.18)', borderRadius: '14px', padding: '14px 16px' }}>
                                        <div style={{ color: '#059669', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Your Positioning</div>
                                        <p style={{ color: '#059669', fontSize: '12px', lineHeight: 1.65, margin: 0 }}>{g.positioning}</p>
                                      </div>

                                      {/* Gaps */}
                                      <div>
                                        <div style={{ color: '#94a3b8', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>Gaps to Address</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                          {g.gaps.map((gap, i) => (
                                            <div key={i} style={{ backgroundColor: '#ffffff', borderRadius: '14px', padding: '12px 14px', borderLeft: `3px solid ${gap.severity === 'major' ? '#ef4444' : '#3b82f6'}` }}>
                                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                                                <span style={{ color: gap.severity === 'major' ? '#ef4444' : '#3b82f6', fontSize: '11px', fontWeight: 700 }}>{gap.skill}</span>
                                                <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: gap.severity === 'major' ? '#dc2626' : '#2563eb', backgroundColor: gap.severity === 'major' ? 'rgba(220,38,38,0.08)' : 'rgba(37,99,235,0.08)', border: `1px solid ${gap.severity === 'major' ? 'rgba(220,38,38,0.2)' : 'rgba(37,99,235,0.2)'}`, borderRadius: '3px', padding: '1px 5px' }}>{gap.severity}</span>
                                              </div>
                                              <p style={{ color: '#64748b', fontSize: '11px', margin: 0, lineHeight: 1.55 }}>{gap.how_to_address}</p>
                                            </div>
                                          ))}
                                        </div>
                                      </div>

                                      {/* Apply signal — full-width banner */}
                                      <div style={{
                                        display: 'flex', alignItems: 'center', gap: '12px',
                                        backgroundColor: g.should_apply ? 'rgba(52,211,153,0.08)' : 'rgba(248,113,113,0.08)',
                                        border: `1px solid ${g.should_apply ? 'rgba(52,211,153,0.25)' : 'rgba(248,113,113,0.25)'}`,
                                        borderRadius: '14px', padding: '12px 16px',
                                      }}>
                                        <span style={{ color: g.should_apply ? '#34d399' : '#f87171', fontSize: '14px', fontWeight: 800, flexShrink: 0 }}>
                                          {g.should_apply ? '✓ Apply' : '✗ Skip'}
                                        </span>
                                        <span style={{ color: '#64748b', fontSize: '12px', lineHeight: 1.5 }}>{g.apply_reasoning}</span>
                                      </div>

                                      {/* Quick wins */}
                                      <div>
                                        <div style={{ color: '#94a3b8', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Quick Wins</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                          {g.quick_wins.map((w, i) => (
                                            <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                              <span style={{ color: '#22c55e', fontSize: '11px', flexShrink: 0, marginTop: '2px' }}>→</span>
                                              <span style={{ color: '#64748b', fontSize: '12px', lineHeight: 1.55 }}>{w}</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>

                                      <button onClick={() => { delete gapsCacheRef.current[job.id]; runGaps(job.id); }} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: '11px', padding: 0, fontFamily: 'inherit', alignSelf: 'flex-start' }}
                                        onMouseEnter={e => (e.currentTarget.style.color = '#64748b')} onMouseLeave={e => (e.currentTarget.style.color = '#cbd5e1')}>
                                        <RotateCcw size={10} /> Regenerate
                                      </button>
                                    </div>
                                  );
                                })()}
                              </div>
                            );
                          })()}

                          {/* Bullets tab */}
                          {activeTab === 'bullets' && (() => {
                            const bl = bulletsResults[job.id];
                            return (
                              <div>
                                {(!bl || bl === 'loading') && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', fontSize: '12px', padding: '20px 0' }}>
                                    <Loader size={14} color="#3b82f6" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                                    Tailoring resume bullets...
                                  </div>
                                )}
                                {bl === 'error' && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '12px', padding: '12px 0' }}>
                                    <AlertCircle size={13} color="#ef4444" /> Failed.{' '}
                                    <button onClick={() => { delete bulletsCacheRef.current[job.id]; runBullets(job.id); }} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '12px', padding: 0, fontFamily: 'inherit' }}>Retry</button>
                                  </div>
                                )}
                                {bl && bl !== 'loading' && bl !== 'error' && (() => {
                                  const b = bl as BulletsResult;
                                  return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', animation: 'fadeIn 0.25s ease' }}>

                                      {/* Lead With */}
                                      <div>
                                        <div style={{ color: '#94a3b8', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Lead With These</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                          {b.lead_with.map((item, i) => (
                                            <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', backgroundColor: '#ffffff', borderRadius: '14px', padding: '10px 13px' }}>
                                              <span style={{ color: '#3b82f6', fontWeight: 800, fontSize: '12px', flexShrink: 0, marginTop: '1px' }}>{i + 1}</span>
                                              <div>
                                                <div style={{ color: '#334155', fontSize: '12px', fontWeight: 600, marginBottom: '2px' }}>{item.experience}</div>
                                                <div style={{ color: '#94a3b8', fontSize: '11px', lineHeight: 1.5 }}>{item.why}</div>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>

                                      {/* Tailored bullets */}
                                      <div>
                                        <div style={{ color: '#94a3b8', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Tailored Bullets</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                          {b.tailored_bullets.map((item, i) => (
                                            <div key={i} style={{ backgroundColor: '#ffffff', borderRadius: '14px', padding: '12px 14px' }}>
                                              <div style={{ display: 'flex', gap: '6px', marginBottom: '6px', alignItems: 'flex-start' }}>
                                                <span style={{ color: '#cbd5e1', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0, marginTop: '2px', lineHeight: 1.6 }}>Before</span>
                                                <span style={{ color: '#94a3b8', fontSize: '11px', lineHeight: 1.55, textDecoration: 'line-through' }}>{item.original}</span>
                                              </div>
                                              <div style={{ display: 'flex', gap: '6px', marginBottom: '6px', alignItems: 'flex-start' }}>
                                                <span style={{ color: '#22c55e', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0, marginTop: '2px', lineHeight: 1.6 }}>After</span>
                                                <span style={{ color: '#334155', fontSize: '11px', lineHeight: 1.55, fontWeight: 500 }}>{item.tailored}</span>
                                              </div>
                                              <div style={{ color: '#cbd5e1', fontSize: '10px', lineHeight: 1.5, borderTop: '1px solid #ffffff', paddingTop: '6px', marginTop: '4px' }}>{item.why}</div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>

                                      {/* Keywords + Deprioritize */}
                                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                        <div>
                                          <div style={{ color: '#94a3b8', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Add These Keywords</div>
                                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                                            {b.keywords_to_add.map((k, i) => (
                                              <span key={i} style={{ backgroundColor: '#ffffff', color: '#818cf8', border: '1px solid rgba(129,140,248,0.2)', borderRadius: '20px', padding: '3px 8px', fontSize: '11px', fontWeight: 500 }}>{k}</span>
                                            ))}
                                          </div>
                                        </div>
                                        {b.deprioritize.length > 0 && (
                                          <div>
                                            <div style={{ color: '#94a3b8', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Deprioritize</div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                              {b.deprioritize.map((item, i) => (
                                                <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                                                  <span style={{ color: '#ef4444', fontSize: '11px', flexShrink: 0 }}>↓</span>
                                                  <span style={{ color: '#94a3b8', fontSize: '11px', lineHeight: 1.5 }}>{item}</span>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                      </div>

                                      <button onClick={() => { delete bulletsCacheRef.current[job.id]; runBullets(job.id); }} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: '11px', padding: 0, fontFamily: 'inherit', alignSelf: 'flex-start' }}
                                        onMouseEnter={e => (e.currentTarget.style.color = '#64748b')} onMouseLeave={e => (e.currentTarget.style.color = '#cbd5e1')}>
                                        <RotateCcw size={10} /> Regenerate
                                      </button>
                                    </div>
                                  );
                                })()}
                              </div>
                            );
                          })()}

                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Import Modal */}
      {importStep && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, backdropFilter: 'blur(3px)' }}
          onClick={e => { if (e.target === e.currentTarget) closeImport(); }}>
          <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '28px', width: '560px', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.8)' }}>
            {importStep === 'input' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <h2 style={{ color: '#0f172a', fontSize: '15px', fontWeight: 700, margin: 0 }}>Import from URL</h2>
                  <button onClick={closeImport} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}>×</button>
                </div>
                <p style={{ color: '#64748b', fontSize: '12px', margin: '0 0 16px' }}>Paste a job posting link. Add context below if the page doesn&apos;t load or you have extra info.</p>
                <input type="url" value={importUrl} onChange={e => setImportUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') fetchImport(); }}
                  placeholder="https://jobs.company.com/..." autoFocus
                  style={{ width: '100%', backgroundColor: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '11px 14px', color: '#0f172a', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                  onFocus={e => (e.target.style.borderColor = '#3b82f6')} onBlur={e => (e.target.style.borderColor = '#e2e8f0')} />
                <div style={{ marginTop: '16px', borderTop: '1px solid #f8fafc', paddingTop: '14px' }}>
                  <div style={{ color: '#cbd5e1', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '10px' }}>Extra context <span style={{ color: '#cbd5e1', fontWeight: 400 }}>— optional</span></div>
                  <textarea value={importExtraText} onChange={e => setImportExtraText(e.target.value)} placeholder="Paste job description, recruiter email, or any extra details..." rows={3}
                    style={{ width: '100%', backgroundColor: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 12px', color: '#64748b', fontSize: '12px', outline: 'none', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, marginBottom: '8px' }} />
                  <input type="url" value={importExtraLink} onChange={e => setImportExtraLink(e.target.value)} placeholder="Additional link (LinkedIn, company page...)"
                    style={{ width: '100%', backgroundColor: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '9px 12px', color: '#64748b', fontSize: '12px', outline: 'none', boxSizing: 'border-box', marginBottom: '8px' }} />
                  <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: 'none' }} onChange={handleImageUpload} />
                  {!importImage ? (
                    <button onClick={() => imageInputRef.current?.click()}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: 'transparent', color: '#64748b', border: '1px dashed #e2e8f0', borderRadius: '10px', padding: '8px 14px', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}>
                      <ImageIcon size={12} /> Upload screenshot
                    </button>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '8px 10px' }}>
                      <img src={importImage.previewUrl} alt="screenshot" style={{ width: '44px', height: '44px', objectFit: 'cover', borderRadius: '20px', flexShrink: 0 }} />
                      <div style={{ flex: 1 }}><div style={{ color: '#334155', fontSize: '12px', fontWeight: 500 }}>Screenshot attached</div><div style={{ color: '#64748b', fontSize: '11px' }}>Claude will read this image</div></div>
                      <button onClick={removeImage} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}>×</button>
                    </div>
                  )}
                </div>
                {importFetchError && <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#f87171', fontSize: '12px', marginTop: '12px' }}><AlertCircle size={13} /> {importFetchError}</div>}
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '18px' }}>
                  <button onClick={closeImport} style={{ backgroundColor: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
                  <button onClick={fetchImport} disabled={!importUrl.trim()} style={{ background: !importUrl.trim() ? '#ffffff' : 'linear-gradient(135deg,#3b82f6,#1d4ed8)', color: !importUrl.trim() ? '#94a3b8' : '#000', border: 'none', borderRadius: '10px', padding: '8px 20px', fontSize: '13px', fontWeight: 700, cursor: !importUrl.trim() ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <LinkIcon size={13} /> Fetch & Parse
                  </button>
                </div>
              </>
            )}
            {importStep === 'loading' && (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <Loader size={28} color="#3b82f6" style={{ animation: 'spin 1s linear infinite', marginBottom: '16px' }} />
                <div style={{ color: '#64748b', fontSize: '13px' }}>Parsing job details...</div>
                <div style={{ color: '#cbd5e1', fontSize: '11px', marginTop: '6px' }}>Takes a few seconds</div>
              </div>
            )}
            {importStep === 'review' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <h2 style={{ color: '#0f172a', fontSize: '15px', fontWeight: 700, margin: 0 }}>Review & Add</h2>
                  <button onClick={closeImport} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}>×</button>
                </div>
                {importWarning && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '7px', backgroundColor: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '10px', padding: '10px 12px', marginBottom: '16px' }}>
                    <AlertCircle size={13} color="#3b82f6" style={{ flexShrink: 0, marginTop: '1px' }} />
                    <span style={{ color: '#3b82f6', fontSize: '12px', lineHeight: 1.5 }}>{importWarning}</span>
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <Field label="Company *" field="company" form={importForm} setForm={setImportForm} />
                  <Field label="Job Title *" field="title" form={importForm} setForm={setImportForm} />
                  <Field label="Location" field="location" form={importForm} setForm={setImportForm} />
                  <Field label="Salary" field="salary_range" form={importForm} setForm={setImportForm} />
                  <Field label="Date Posted" field="posting_date" form={importForm} setForm={setImportForm} type="date" />
                  <Field label="Deadline" field="deadline" form={importForm} setForm={setImportForm} type="date" />
                  <div>
                    <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 500, marginBottom: '5px' }}>Type</label>
                    <select value={importForm.type} onChange={e => setImportForm(p => ({ ...p, type: e.target.value }))} style={{ ...formInput }}>
                      {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 500, marginBottom: '5px' }}>Source</label>
                    <input value={importForm.source} onChange={e => setImportForm(p => ({ ...p, source: e.target.value }))} style={formInput} />
                  </div>
                </div>
                <div style={{ marginTop: '12px' }}>
                  <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 500, marginBottom: '5px' }}>URL</label>
                  <input value={importForm.url} onChange={e => setImportForm(p => ({ ...p, url: e.target.value }))} style={formInput} />
                </div>
                <div style={{ marginTop: '12px' }}>
                  <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 500, marginBottom: '5px' }}>Notes</label>
                  <textarea value={importForm.notes} onChange={e => setImportForm(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ ...formInput, resize: 'vertical', fontFamily: 'inherit' }} />
                </div>
                <div style={{ marginTop: '12px' }}>
                  <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 500, marginBottom: '5px' }}>Description</label>
                  <textarea value={importForm.description} onChange={e => setImportForm(p => ({ ...p, description: e.target.value }))} rows={3} style={{ ...formInput, resize: 'vertical', fontFamily: 'inherit' }} />
                </div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
                  <button onClick={() => setImportStep('input')} style={{ display: 'flex', alignItems: 'center', gap: '5px', backgroundColor: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '8px 14px', fontSize: '13px', cursor: 'pointer' }}>
                    <ArrowLeft size={12} /> Back
                  </button>
                  <button onClick={closeImport} style={{ backgroundColor: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
                  <button onClick={handleImportSave} disabled={saving || !importForm.company || !importForm.title} style={{
                    background: !importForm.company || !importForm.title ? '#ffffff' : 'linear-gradient(135deg,#3b82f6,#1d4ed8)',
                    color: !importForm.company || !importForm.title ? '#94a3b8' : '#000',
                    border: 'none', borderRadius: '10px', padding: '8px 20px', fontSize: '13px', fontWeight: 700,
                    cursor: saving || !importForm.company || !importForm.title ? 'not-allowed' : 'pointer',
                  }}>
                    {saving ? 'Adding...' : 'Add to Tracker'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, backdropFilter: 'blur(3px)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '24px', width: '580px', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.8)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ color: '#0f172a', fontSize: '15px', fontWeight: 700, margin: 0 }}>{editingJob ? 'Edit Job' : 'Add Job'}</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex' }}><X size={16} /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <Field label="Company *" field="company" form={form} setForm={setForm} />
              <Field label="Job Title *" field="title" form={form} setForm={setForm} />
              <Field label="Location" field="location" form={form} setForm={setForm} />
              <Field label="Salary Range" field="salary_range" form={form} setForm={setForm} />
              <Field label="Posting Date" field="posting_date" form={form} setForm={setForm} type="date" />
              <Field label="Deadline" field="deadline" form={form} setForm={setForm} type="date" />
              <Field label="Match Score (1–10)" field="match_score" form={form} setForm={setForm} type="number" />
              <Field label="Source" field="source" form={form} setForm={setForm} />
              <div>
                <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 500, marginBottom: '5px' }}>Type</label>
                <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} style={formInput}>
                  {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 500, marginBottom: '5px' }}>Status</label>
                <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} style={formInput}>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginTop: '12px' }}><Field label="URL" field="url" form={form} setForm={setForm} /></div>
            <div style={{ marginTop: '12px' }}>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 500, marginBottom: '5px' }}>Notes</label>
              <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ ...formInput, resize: 'vertical', fontFamily: 'inherit' }} />
            </div>
            <div style={{ marginTop: '12px' }}>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 500, marginBottom: '5px' }}>Description</label>
              <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={3} style={{ ...formInput, resize: 'vertical', fontFamily: 'inherit' }} />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button onClick={() => setShowModal(false)} style={{ backgroundColor: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.company || !form.title} style={{
                background: !form.company || !form.title ? '#ffffff' : 'linear-gradient(135deg,#3b82f6,#1d4ed8)',
                color: !form.company || !form.title ? '#94a3b8' : '#000',
                border: 'none', borderRadius: '10px', padding: '8px 20px', fontSize: '13px', fontWeight: 700,
                cursor: saving || !form.company || !form.title ? 'not-allowed' : 'pointer',
              }}>
                {saving ? 'Saving...' : 'Save Job'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Fix unused import warning
function MessageSquare({ size }: { size: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
}
