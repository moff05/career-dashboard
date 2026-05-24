'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Edit2, Trash2, ChevronDown, ChevronRight, ExternalLink, FileText, X, MapPin, Calendar, DollarSign, Link2, StickyNote, AlignLeft, Tag, LinkIcon, Loader, AlertCircle, ArrowLeft, RotateCcw, ImageIcon, ExternalLink as LinkOut } from 'lucide-react';

interface Job {
  id: number;
  company: string;
  title: string;
  type: string;
  status: string;
  match_score: number | null;
  posting_date: string | null;
  deadline: string | null;
  url: string | null;
  description: string | null;
  salary_range: string | null;
  location: string | null;
  source: string | null;
  notes: string | null;
  created_at: string;
}

// Vibrant hash-based badge colors — no network calls, always consistent
const BADGE_PALETTE: [string, string][] = [
  ['#7c3aed', '#fff'], // violet
  ['#2563eb', '#fff'], // blue
  ['#059669', '#fff'], // emerald
  ['#d97706', '#fff'], // amber
  ['#dc2626', '#fff'], // red
  ['#0891b2', '#fff'], // cyan
  ['#db2777', '#fff'], // pink
  ['#ea580c', '#fff'], // orange
  ['#65a30d', '#fff'], // lime
  ['#0f766e', '#fff'], // teal
  ['#9333ea', '#fff'], // purple
  ['#be185d', '#fff'], // rose
];

function getCompanyColor(name: string): [string, string] {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h << 5) - h + name.charCodeAt(i);
  return BADGE_PALETTE[Math.abs(h) % BADGE_PALETTE.length];
}

function CompanyBadge({ company, size = 28 }: { company: string; size?: number }) {
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

const STATUS_OPTIONS = ['saved', 'applied', 'interviewing', 'offer', 'rejected'];
const TYPE_OPTIONS = [
  { value: 'fall-2026-internship', label: 'Fall 2026 Intern' },
  { value: 'spring-2027-internship', label: 'Spring 2027 Intern' },
  { value: 'summer-internship', label: 'Summer Intern' },
  { value: 'full-time', label: 'Full-Time' },
];

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  saved:        { bg: '#ffffff18', text: '#888' },
  applied:      { bg: '#3b82f622', text: '#60a5fa' },
  interviewing: { bg: '#d9770622', text: '#fbbf24' },
  offer:        { bg: '#22c55e22', text: '#4ade80' },
  rejected:     { bg: '#ef444422', text: '#f87171' },
};

const TYPE_COLORS: Record<string, string> = {
  'fall-2026-internship':   '#7c3aed',
  'spring-2027-internship': '#0891b2',
  'summer-internship':      '#059669',
  'full-time':              '#d97706',
};

function getMatchColor(score: number | null): string {
  if (!score) return '#555';
  if (score >= 8) return '#4ade80';
  if (score >= 5) return '#60a5fa';
  if (score >= 3) return '#fbbf24';
  return '#f87171';
}

function getMatchBg(score: number | null): string {
  if (!score) return '#1f1f1f';
  if (score >= 8) return '#4ade8015';
  if (score >= 5) return '#60a5fa15';
  if (score >= 3) return '#fbbf2415';
  return '#f8717115';
}

function DeadlineDisplay({ deadline }: { deadline: string | null }) {
  if (!deadline) return <span style={{ color: '#444' }}>—</span>;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(deadline); d.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return <span style={{ color: '#f87171', fontSize: '11px' }}>Expired</span>;
  if (diff === 0) return <span style={{ color: '#f87171', fontSize: '11px', fontWeight: 600 }}>Today!</span>;
  if (diff <= 7) return <span style={{ color: '#fb923c', fontSize: '11px' }}>{diff}d left</span>;
  if (diff <= 30) return <span style={{ color: '#fbbf24', fontSize: '11px' }}>{diff}d</span>;
  return <span style={{ color: '#555', fontSize: '11px' }}>{d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>;
}

interface AnalysisCategory { name: string; score: number; rationale: string; }
interface AnalysisResult { categories: AnalysisCategory[]; total: number; summary: string; }
type AnalysisState = AnalysisResult | 'loading' | 'error';

function scoreColor(s: number) {
  if (s >= 80) return '#4ade80';
  if (s >= 60) return '#fbbf24';
  return '#f87171';
}

const EMPTY_FORM = {
  company: '', title: '', type: 'fall-2026-internship', status: 'saved',
  match_score: '', location: '', source: '', posting_date: '',
  deadline: '', url: '', salary_range: '', notes: '', description: '',
};
type FormData = typeof EMPTY_FORM;

function InputField({ label, field, form, setForm, type = 'text' }: {
  label: string; field: keyof FormData;
  form: FormData; setForm: React.Dispatch<React.SetStateAction<FormData>>;
  type?: string;
}) {
  return (
    <div>
      <label style={{ display: 'block', color: '#666', fontSize: '11px', fontWeight: 500, marginBottom: '5px', letterSpacing: '0.03em' }}>{label}</label>
      <input
        type={type}
        value={form[field]}
        onChange={e => setForm(prev => ({ ...prev, [field]: e.target.value }))}
        min={field === 'match_score' ? '1' : undefined}
        max={field === 'match_score' ? '10' : undefined}
        style={{
          width: '100%', backgroundColor: '#1e1e1e', border: '1px solid #2e2e2e',
          borderRadius: '6px', padding: '8px 10px', color: '#e8e8e8', fontSize: '13px',
          outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s',
        }}
        onFocus={e => (e.target.style.borderColor = '#d97706')}
        onBlur={e => (e.target.style.borderColor = '#2e2e2e')}
      />
    </div>
  );
}

function StatusBadge({ job, onStatusChange }: { job: Job; onStatusChange: (id: number, status: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <span
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        style={{
          backgroundColor: STATUS_COLORS[job.status]?.bg || '#33333322',
          color: STATUS_COLORS[job.status]?.text || '#888',
          borderRadius: '4px', padding: '3px 8px',
          fontSize: '10px', fontWeight: 600, textTransform: 'capitalize',
          cursor: 'pointer', userSelect: 'none', display: 'inline-block',
        }}
      >
        {job.status}
      </span>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 100,
          backgroundColor: '#222', border: '1px solid #333', borderRadius: '6px',
          overflow: 'hidden', minWidth: '120px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        }}>
          {STATUS_OPTIONS.map(s => (
            <div
              key={s}
              onClick={e => { e.stopPropagation(); onStatusChange(job.id, s); setOpen(false); }}
              style={{
                padding: '7px 14px', fontSize: '11px', fontWeight: 600,
                color: STATUS_COLORS[s]?.text || '#888',
                cursor: 'pointer', textTransform: 'capitalize',
                backgroundColor: job.status === s ? '#2a2a2a' : 'transparent',
              }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#2a2a2a')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = job.status === s ? '#2a2a2a' : 'transparent')}
            >
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const JOB_GRID_COLS = '1fr 100px 80px 46px 85px 100px 16px 52px';
const JOB_GRID_GAP = '0 8px';

// Detail panel field row
function DetailField({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '14px' }}>
      <div style={{ color: '#444', marginTop: '2px', flexShrink: 0 }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: '#555', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '3px' }}>{label}</div>
        <div style={{ color: '#d0d0d0', fontSize: '13px', lineHeight: 1.5, wordBreak: 'break-word' }}>{children}</div>
      </div>
    </div>
  );
}

export default function TrackerPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [detailJob, setDetailJob] = useState<Job | null>(null);

  // Analysis scorecard — cached per job id for the session
  const analysisCacheRef = useRef<Record<number, AnalysisState>>({});
  const [analysisResult, setAnalysisResult] = useState<AnalysisState | null>(null);

  const runAnalysis = useCallback((id: number) => {
    analysisCacheRef.current[id] = 'loading';
    setAnalysisResult('loading');
    fetch(`/api/jobs/${id}/analyze`, { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        const result: AnalysisState = data.error ? 'error' : data;
        analysisCacheRef.current[id] = result;
        setAnalysisResult(prev => prev === 'loading' ? result : prev);
      })
      .catch(() => {
        analysisCacheRef.current[id] = 'error';
        setAnalysisResult(prev => prev === 'loading' ? 'error' : prev);
      });
  }, []);

  useEffect(() => {
    if (!detailJob) { setAnalysisResult(null); return; }
    const id = detailJob.id;
    const cached = analysisCacheRef.current[id];
    if (cached) { setAnalysisResult(cached); return; }
    runAnalysis(id);
  }, [detailJob?.id, runAnalysis]);

  const refreshAnalysis = useCallback((id: number) => {
    delete analysisCacheRef.current[id];
    runAnalysis(id);
  }, [runAnalysis]);

  // URL import flow
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
      const result = ev.target?.result as string;
      setImportImage({ base64: result.split(',')[1], mediaType: file.type, previewUrl });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const removeImage = () => {
    if (importImage?.previewUrl) URL.revokeObjectURL(importImage.previewUrl);
    setImportImage(null);
  };

  const openImport = () => {
    setImportUrl(''); setImportForm(EMPTY_FORM); setImportWarning('');
    setImportFetchError(''); setImportExtraText(''); setImportExtraLink('');
    removeImage(); setImportStep('input');
  };
  const closeImport = () => { removeImage(); setImportStep(null); };

  const fetchImport = async () => {
    const trimmed = importUrl.trim();
    if (!trimmed) return;
    setImportFetchError('');
    setImportStep('loading');
    try {
      const res = await fetch('/api/jobs/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: trimmed,
          extraText: importExtraText.trim() || undefined,
          imageBase64: importImage?.base64 || undefined,
          imageMediaType: importImage?.mediaType || undefined,
          extraLink: importExtraLink.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.error && !data.url) { setImportFetchError(data.error); setImportStep('input'); return; }
      setImportWarning(data.warning || '');
      setImportForm({
        company: data.company || '',
        title: data.title || '',
        type: data.type || 'fall-2026-internship',
        status: 'saved',
        match_score: '',
        location: data.location || '',
        source: data.source || 'company site',
        posting_date: '',
        deadline: data.deadline || '',
        url: data.url || trimmed,
        salary_range: data.salary_range || '',
        notes: '',
        description: data.description || '',
      });
      setImportStep('review');
    } catch {
      setImportFetchError('Request failed. Check the URL and try again.');
      setImportStep('input');
    }
  };

  const handleImportSave = async () => {
    setSaving(true);
    const payload = { ...importForm, match_score: importForm.match_score ? parseInt(importForm.match_score) : null };
    await fetch('/api/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    setSaving(false);
    closeImport();
    fetchJobs();
  };

  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [sortClickCount, setSortClickCount] = useState<Record<string, number>>({});
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/jobs');
    const data = await res.json();
    setJobs(data);
    setLoading(false);
    const companies = [...new Set(data.map((j: Job) => j.company))] as string[];
    setExpandedCompanies(new Set(companies));
  }, []);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const openAdd = () => { setEditingJob(null); setForm(EMPTY_FORM); setShowModal(true); };
  const openEdit = (job: Job) => {
    setEditingJob(job);
    setForm({
      company: job.company, title: job.title, type: job.type, status: job.status,
      match_score: job.match_score?.toString() || '',
      location: job.location || '', source: job.source || '',
      posting_date: job.posting_date || '', deadline: job.deadline || '',
      url: job.url || '', salary_range: job.salary_range || '',
      notes: job.notes || '', description: job.description || '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const payload = { ...form, match_score: form.match_score ? parseInt(form.match_score) : null };
    if (editingJob) {
      await fetch(`/api/jobs/${editingJob.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    } else {
      await fetch('/api/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    }
    setSaving(false);
    setShowModal(false);
    fetchJobs();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this job?')) return;
    await fetch(`/api/jobs/${id}`, { method: 'DELETE' });
    if (detailJob?.id === id) setDetailJob(null);
    fetchJobs();
  };

  const handleStatusChange = async (id: number, status: string) => {
    await fetch(`/api/jobs/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    setDetailJob(prev => prev?.id === id ? { ...prev, status } : prev);
    fetchJobs();
  };

  const openCoverLetter = (company: string, title: string) => {
    window.location.href = `/coach?prefill=cover-letter&company=${encodeURIComponent(company)}&title=${encodeURIComponent(title)}`;
  };

  const toggleCompany = (company: string) => {
    setExpandedCompanies(prev => { const n = new Set(prev); n.has(company) ? n.delete(company) : n.add(company); return n; });
  };

  const handleSort = (col: string) => {
    const clicks = (sortClickCount[col] || 0) + 1;
    if (clicks === 3) { setSortBy(null); setSortDir('asc'); setSortClickCount(prev => ({ ...prev, [col]: 0 })); }
    else { setSortBy(col); setSortDir(clicks === 1 ? 'asc' : 'desc'); setSortClickCount(prev => ({ ...prev, [col]: clicks })); }
  };

  const filteredJobs = jobs.filter(job => {
    const matchesSearch = !searchText.trim() ||
      job.company.toLowerCase().includes(searchText.toLowerCase()) ||
      job.title.toLowerCase().includes(searchText.toLowerCase());
    const matchesStatus = statusFilter === 'all' || job.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const sortedJobs = [...filteredJobs].sort((a, b) => {
    if (!sortBy) return 0;
    let cmp = 0;
    if (sortBy === 'match_score') {
      if (a.match_score === null && b.match_score !== null) return 1;
      if (b.match_score === null && a.match_score !== null) return -1;
      cmp = (a.match_score ?? -1) - (b.match_score ?? -1);
    } else if (sortBy === 'deadline') {
      if (!a.deadline && !b.deadline) cmp = 0;
      else if (!a.deadline) cmp = 1;
      else if (!b.deadline) cmp = -1;
      else cmp = new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    } else if (sortBy === 'title') cmp = a.title.localeCompare(b.title);
    else if (sortBy === 'type') cmp = a.type.localeCompare(b.type);
    else if (sortBy === 'status') cmp = a.status.localeCompare(b.status);
    else if (sortBy === 'location') cmp = (a.location || '').localeCompare(b.location || '');
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const grouped = sortedJobs.reduce((acc, job) => {
    if (!acc[job.company]) acc[job.company] = [];
    acc[job.company].push(job);
    return acc;
  }, {} as Record<string, Job[]>);

  const stats = {
    total: jobs.length,
    saved: jobs.filter(j => j.status === 'saved').length,
    applied: jobs.filter(j => j.status === 'applied').length,
    interviewing: jobs.filter(j => j.status === 'interviewing').length,
    offers: jobs.filter(j => j.status === 'offer').length,
    rejected: jobs.filter(j => j.status === 'rejected').length,
  };

  const inputStyle = {
    width: '100%', backgroundColor: '#1e1e1e', border: '1px solid #2e2e2e',
    borderRadius: '6px', padding: '8px 10px', color: '#e8e8e8', fontSize: '13px',
    outline: 'none', boxSizing: 'border-box' as const,
  };
  const isFiltered = searchText.trim() !== '' || statusFilter !== 'all';

  const SortIcon = ({ col }: { col: string }) => {
    if (sortBy !== col) return null;
    return <span style={{ marginLeft: '3px', fontSize: '9px' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };
  const colHeaderStyle = (col: string): React.CSSProperties => ({
    cursor: 'pointer', userSelect: 'none',
    color: sortBy === col ? '#d97706' : '#444',
    display: 'flex', alignItems: 'center',
  });

  return (
    <div style={{ padding: '28px 32px', minHeight: '100vh', backgroundColor: '#1a1a1a' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ color: '#e8e8e8', fontSize: '18px', fontWeight: 600, margin: 0, letterSpacing: '-0.01em' }}>Job Tracker</h1>
          <p style={{ color: '#555', fontSize: '12px', margin: '3px 0 0' }}>Track and manage your applications</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={openImport} style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            backgroundColor: '#d97706', color: '#fff', border: 'none',
            borderRadius: '6px', padding: '8px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
          }}>
            <LinkIcon size={13} /> Import from URL
          </button>
          <button onClick={openAdd} style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            backgroundColor: 'transparent', color: '#777', border: '1px solid #333',
            borderRadius: '6px', padding: '8px 12px', fontSize: '12px', fontWeight: 500, cursor: 'pointer',
          }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#555'; (e.currentTarget as HTMLButtonElement).style.color = '#aaa'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#333'; (e.currentTarget as HTMLButtonElement).style.color = '#777'; }}
          >
            <Plus size={12} /> Manual
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {[
          { label: 'Total', value: stats.total, color: '#e8e8e8' },
          { label: 'Saved', value: stats.saved, color: '#888' },
          { label: 'Applied', value: stats.applied, color: '#60a5fa' },
          { label: 'Interviewing', value: stats.interviewing, color: '#fbbf24' },
          { label: 'Offers', value: stats.offers, color: '#4ade80' },
          { label: 'Rejected', value: stats.rejected, color: '#f87171' },
        ].map(stat => (
          <div key={stat.label} style={{
            backgroundColor: '#1e1e1e', border: '1px solid #2a2a2a',
            borderRadius: '8px', padding: '12px 16px', flex: 1, minWidth: 0,
          }}>
            <div style={{ color: stat.color, fontSize: '20px', fontWeight: 700, lineHeight: 1 }}>{stat.value}</div>
            <div style={{ color: '#555', fontSize: '11px', marginTop: '4px', fontWeight: 500 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Search and filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
        <input
          type="text"
          placeholder="Search company or title..."
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          style={{
            backgroundColor: '#1e1e1e', border: '1px solid #2a2a2a',
            borderRadius: '6px', padding: '7px 12px', color: '#e8e8e8',
            fontSize: '12px', outline: 'none', width: '220px',
          }}
        />
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {['all', 'saved', 'applied', 'interviewing', 'offer', 'rejected'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              style={{
                backgroundColor: statusFilter === s ? '#d97706' : '#1e1e1e',
                color: statusFilter === s ? '#fff' : '#666',
                border: `1px solid ${statusFilter === s ? '#d97706' : '#2a2a2a'}`,
                borderRadius: '20px', padding: '4px 11px',
                fontSize: '11px', fontWeight: 500, cursor: 'pointer', textTransform: 'capitalize',
              }}
            >
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>
      </div>
      {isFiltered && (
        <div style={{ color: '#555', fontSize: '11px', marginBottom: '8px' }}>
          {sortedJobs.length} job{sortedJobs.length !== 1 ? 's' : ''} shown
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ color: '#555', textAlign: 'center', padding: '80px', fontSize: '13px' }}>Loading...</div>
      ) : jobs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 32px' }}>
          <LinkIcon size={28} color="#2a2a2a" style={{ marginBottom: '16px' }} />
          <div style={{ color: '#555', fontSize: '14px', marginBottom: '8px' }}>No jobs tracked yet</div>
          <div style={{ color: '#3a3a3a', fontSize: '12px', marginBottom: '24px' }}>Paste a job posting URL to add your first application</div>
          <button onClick={openImport} style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            backgroundColor: '#d97706', color: '#fff', border: 'none',
            borderRadius: '6px', padding: '10px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
          }}>
            <LinkIcon size={13} /> Import from URL
          </button>
        </div>
      ) : (
        <div style={{ backgroundColor: '#1e1e1e', border: '1px solid #2a2a2a', borderRadius: '8px', overflowX: 'auto' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: JOB_GRID_COLS, gap: JOB_GRID_GAP, alignItems: 'center',
            padding: '7px 14px', borderBottom: '1px solid #252525',
            fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            <div style={colHeaderStyle('title')} onClick={() => handleSort('title')}>Title <SortIcon col="title" /></div>
            <div style={colHeaderStyle('type')} onClick={() => handleSort('type')}>Type <SortIcon col="type" /></div>
            <div style={colHeaderStyle('status')} onClick={() => handleSort('status')}>Status <SortIcon col="status" /></div>
            <div style={colHeaderStyle('match_score')} onClick={() => handleSort('match_score')}>Match <SortIcon col="match_score" /></div>
            <div style={colHeaderStyle('deadline')} onClick={() => handleSort('deadline')}>Deadline <SortIcon col="deadline" /></div>
            <div style={colHeaderStyle('location')} onClick={() => handleSort('location')}>Location <SortIcon col="location" /></div>
            <div style={{ color: '#444' }}></div>
            <div style={{ color: '#444' }}></div>
          </div>

          {Object.entries(grouped).map(([company, companyJobs], groupIdx) => {
            const isExpanded = expandedCompanies.has(company);
            const bestScore = Math.max(...companyJobs.map(j => j.match_score || 0));
            const isLast = groupIdx === Object.entries(grouped).length - 1;
            return (
              <div key={company}>
                <div
                  onClick={() => toggleCompany(company)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '10px 14px', backgroundColor: '#222', cursor: 'pointer',
                    borderTop: groupIdx > 0 ? '1px solid #252525' : undefined,
                    borderBottom: isExpanded ? '1px solid #252525' : (!isLast ? '1px solid #252525' : undefined),
                    userSelect: 'none',
                  }}
                >
                  {isExpanded ? <ChevronDown size={12} color="#555" style={{ flexShrink: 0 }} /> : <ChevronRight size={12} color="#555" style={{ flexShrink: 0 }} />}
                  <CompanyBadge company={company} size={24} />
                  <span style={{ color: '#d0d0d0', fontWeight: 600, fontSize: '13px' }}>{company}</span>
                  <span style={{ backgroundColor: '#2a2a2a', color: '#555', borderRadius: '10px', padding: '1px 7px', fontSize: '10px', fontWeight: 500 }}>
                    {companyJobs.length} {companyJobs.length === 1 ? 'role' : 'roles'}
                  </span>
                  {bestScore > 0 && (
                    <span style={{
                      marginLeft: 'auto', fontSize: '11px', fontWeight: 600,
                      color: getMatchColor(bestScore), backgroundColor: getMatchBg(bestScore),
                      padding: '2px 8px', borderRadius: '4px',
                    }}>{bestScore}/10</span>
                  )}
                </div>

                {isExpanded && companyJobs.map((job, idx) => (
                  <div
                    key={job.id}
                    onClick={() => setDetailJob(job)}
                    style={{
                      display: 'grid', gridTemplateColumns: JOB_GRID_COLS, gap: JOB_GRID_GAP, alignItems: 'center',
                      padding: '10px 14px',
                      borderBottom: idx < companyJobs.length - 1 ? '1px solid #222' : undefined,
                      fontSize: '12px', cursor: 'pointer',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#212121')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    {/* Title */}
                    <div>
                      <div style={{ color: '#e0e0e0', fontWeight: 500, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {job.title}
                      </div>
                      {job.notes && (
                        <div style={{ color: '#555', fontSize: '10px', marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {job.notes}
                        </div>
                      )}
                    </div>

                    {/* Type */}
                    <div>
                      <span style={{ color: TYPE_COLORS[job.type] || '#888', fontSize: '10px', fontWeight: 600 }}>
                        {TYPE_OPTIONS.find(t => t.value === job.type)?.label || job.type}
                      </span>
                    </div>

                    {/* Status */}
                    <div onClick={e => e.stopPropagation()}>
                      <StatusBadge job={job} onStatusChange={handleStatusChange} />
                    </div>

                    {/* Match */}
                    <div style={{
                      color: getMatchColor(job.match_score), fontWeight: 700, fontSize: '12px',
                      backgroundColor: getMatchBg(job.match_score),
                      borderRadius: '4px', padding: '2px 5px', textAlign: 'center',
                    }}>
                      {job.match_score ? `${job.match_score}` : '—'}
                    </div>

                    {/* Deadline */}
                    <div><DeadlineDisplay deadline={job.deadline} /></div>

                    {/* Location */}
                    <div style={{ color: '#555', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {job.location || '—'}
                    </div>

                    {/* Link */}
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      {job.url ? (
                        <a href={job.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ color: '#444', display: 'flex' }}>
                          <ExternalLink size={12} />
                        </a>
                      ) : null}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '2px', justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => openEdit(job)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#444', padding: '4px', borderRadius: '4px', display: 'flex', alignItems: 'center' }}
                        onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = '#888')}
                        onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = '#444')}>
                        <Edit2 size={11} />
                      </button>
                      <button onClick={() => openCoverLetter(job.company, job.title)} title="Write cover letter"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#444', padding: '4px', borderRadius: '4px', display: 'flex', alignItems: 'center' }}
                        onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = '#d97706')}
                        onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = '#444')}>
                        <FileText size={11} />
                      </button>
                      <button onClick={() => handleDelete(job.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#444', padding: '4px', borderRadius: '4px', display: 'flex', alignItems: 'center' }}
                        onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = '#f87171')}
                        onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = '#444')}>
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Job Detail Slide Panel */}
      {detailJob && (
        <>
          <div
            onClick={() => setDetailJob(null)}
            style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 200, backdropFilter: 'blur(1px)' }}
          />
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: '400px',
            backgroundColor: '#1a1a1a', borderLeft: '1px solid #2a2a2a',
            zIndex: 201, overflowY: 'auto', boxShadow: '-12px 0 48px rgba(0,0,0,0.5)',
            display: 'flex', flexDirection: 'column',
          }}>
            {/* Panel header */}
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #222', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <CompanyBadge company={detailJob.company} size={36} />
                <div>
                  <div style={{ color: '#e8e8e8', fontWeight: 700, fontSize: '14px' }}>{detailJob.company}</div>
                  <div style={{ color: TYPE_COLORS[detailJob.type] || '#888', fontSize: '10px', fontWeight: 600, marginTop: '2px' }}>
                    {TYPE_OPTIONS.find(t => t.value === detailJob.type)?.label || detailJob.type}
                  </div>
                </div>
              </div>
              <button onClick={() => setDetailJob(null)} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', padding: '4px', display: 'flex', borderRadius: '4px' }}
                onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = '#888')}
                onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = '#555')}>
                <X size={16} />
              </button>
            </div>

            {/* Panel body */}
            <div style={{ padding: '20px 24px', flex: 1 }}>
              <div style={{ color: '#e8e8e8', fontWeight: 600, fontSize: '16px', marginBottom: '12px', lineHeight: 1.3 }}>
                {detailJob.title}
              </div>

              {/* Status + Match */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                <StatusBadge job={detailJob} onStatusChange={handleStatusChange} />
                {detailJob.match_score && (
                  <span style={{
                    color: getMatchColor(detailJob.match_score),
                    backgroundColor: getMatchBg(detailJob.match_score),
                    borderRadius: '4px', padding: '3px 8px',
                    fontSize: '11px', fontWeight: 700,
                  }}>
                    {detailJob.match_score}/10 match
                  </span>
                )}
              </div>

              {/* ── Match Analysis Scorecard ── */}
              <div style={{ marginBottom: '20px', backgroundColor: '#1f1f1f', borderRadius: '10px', padding: '16px', border: '1px solid #2a2a2a' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <span style={{ color: '#555', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Match Analysis</span>
                  {analysisResult && analysisResult !== 'loading' && (
                    <button
                      onClick={() => refreshAnalysis(detailJob.id)}
                      style={{ background: 'none', border: 'none', color: '#3a3a3a', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px', padding: '2px 4px', borderRadius: '4px' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#666')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#3a3a3a')}
                    >
                      <RotateCcw size={10} /> refresh
                    </button>
                  )}
                </div>

                {/* Loading */}
                {(!analysisResult || analysisResult === 'loading') && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#444', fontSize: '12px', padding: '8px 0' }}>
                    <Loader size={13} color="#d97706" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                    Analyzing fit...
                  </div>
                )}

                {/* Error */}
                {analysisResult === 'error' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#666', fontSize: '12px' }}>
                    <AlertCircle size={12} color="#f87171" />
                    Analysis failed.{' '}
                    <button onClick={() => refreshAnalysis(detailJob.id)} style={{ background: 'none', border: 'none', color: '#d97706', cursor: 'pointer', fontSize: '12px', padding: 0, textDecoration: 'underline' }}>
                      Retry
                    </button>
                  </div>
                )}

                {/* Result */}
                {analysisResult && analysisResult !== 'loading' && analysisResult !== 'error' && (() => {
                  const r = analysisResult as AnalysisResult;
                  return (
                    <>
                      {/* Total */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px', backgroundColor: '#181818', borderRadius: '8px', padding: '12px 14px' }}>
                        <div style={{ fontSize: '36px', fontWeight: 800, color: scoreColor(r.total), lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                          {r.total}
                        </div>
                        <div>
                          <div style={{ color: '#555', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em' }}>/ 100</div>
                          <div style={{ color: '#888', fontSize: '11px', marginTop: '3px', lineHeight: 1.4 }}>{r.summary}</div>
                        </div>
                      </div>

                      {/* Category bars */}
                      {r.categories.map((cat, i) => (
                        <div key={cat.name} style={{ marginBottom: i < r.categories.length - 1 ? '14px' : 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '5px' }}>
                            <span style={{ color: '#c0c0c0', fontSize: '12px', fontWeight: 500 }}>{cat.name}</span>
                            <span style={{ color: scoreColor(cat.score), fontSize: '13px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{cat.score}</span>
                          </div>
                          <div style={{ backgroundColor: '#2a2a2a', borderRadius: '3px', height: '3px', overflow: 'hidden', marginBottom: '5px' }}>
                            <div style={{
                              width: `${cat.score}%`, height: '100%', borderRadius: '3px',
                              backgroundColor: scoreColor(cat.score),
                              transition: 'width 0.7s cubic-bezier(0.4,0,0.2,1)',
                            }} />
                          </div>
                          <div style={{ color: '#4a4a4a', fontSize: '11px', lineHeight: 1.45 }}>{cat.rationale}</div>
                        </div>
                      ))}
                    </>
                  );
                })()}
              </div>

              <div style={{ borderTop: '1px solid #222', paddingTop: '16px' }}>
                {detailJob.location && (
                  <DetailField icon={<MapPin size={13} />} label="Location">{detailJob.location}</DetailField>
                )}
                {detailJob.deadline && (
                  <DetailField icon={<Calendar size={13} />} label="Deadline">
                    <span>{detailJob.deadline}</span>
                    <span style={{ marginLeft: '8px' }}>(<DeadlineDisplay deadline={detailJob.deadline} />)</span>
                  </DetailField>
                )}
                {detailJob.posting_date && (
                  <DetailField icon={<Calendar size={13} />} label="Posted">{detailJob.posting_date}</DetailField>
                )}
                {detailJob.salary_range && (
                  <DetailField icon={<DollarSign size={13} />} label="Salary">{detailJob.salary_range}</DetailField>
                )}
                {detailJob.source && (
                  <DetailField icon={<Tag size={13} />} label="Source">{detailJob.source}</DetailField>
                )}
                {detailJob.url && (
                  <DetailField icon={<Link2 size={13} />} label="Application Link">
                    <a href={detailJob.url} target="_blank" rel="noopener noreferrer"
                      style={{ color: '#d97706', textDecoration: 'none', wordBreak: 'break-all', fontSize: '12px' }}
                      onMouseEnter={e => ((e.currentTarget as HTMLAnchorElement).style.textDecoration = 'underline')}
                      onMouseLeave={e => ((e.currentTarget as HTMLAnchorElement).style.textDecoration = 'none')}>
                      {detailJob.url}
                    </a>
                  </DetailField>
                )}
                {detailJob.notes && (
                  <DetailField icon={<StickyNote size={13} />} label="Notes">{detailJob.notes}</DetailField>
                )}
                {detailJob.description && (
                  <DetailField icon={<AlignLeft size={13} />} label="Description">
                    <span style={{ color: '#888', fontSize: '12px' }}>{detailJob.description}</span>
                  </DetailField>
                )}
                {!detailJob.location && !detailJob.deadline && !detailJob.url && !detailJob.notes && !detailJob.description && (
                  <div style={{ color: '#444', fontSize: '12px', textAlign: 'center', padding: '24px 0' }}>
                    No additional details. Click Edit to add more info.
                  </div>
                )}
              </div>
            </div>

            {/* Panel footer actions */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid #222', display: 'flex', gap: '8px' }}>
              <button
                onClick={() => { openEdit(detailJob); setDetailJob(null); }}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  backgroundColor: '#242424', color: '#d0d0d0', border: '1px solid #333',
                  borderRadius: '6px', padding: '9px', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
                }}
                onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.borderColor = '#555')}
                onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.borderColor = '#333')}
              >
                <Edit2 size={13} /> Edit
              </button>
              <button
                onClick={() => openCoverLetter(detailJob.company, detailJob.title)}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  backgroundColor: '#d97706', color: '#fff', border: 'none',
                  borderRadius: '6px', padding: '9px', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
                }}
                onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = '#b45309')}
                onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = '#d97706')}
              >
                <FileText size={13} /> Cover Letter
              </button>
              <button
                onClick={() => handleDelete(detailJob.id)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  backgroundColor: '#2a1a1a', color: '#f87171', border: '1px solid #3a2020',
                  borderRadius: '6px', padding: '9px 12px', fontSize: '13px', cursor: 'pointer',
                }}
                onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = '#3a1a1a')}
                onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = '#2a1a1a')}
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        </>
      )}

      {/* Import from URL Modal */}
      {importStep && (
        <div
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, backdropFilter: 'blur(2px)' }}
          onClick={e => { if (e.target === e.currentTarget) closeImport(); }}
        >
          <div style={{
            backgroundColor: '#1e1e1e', border: '1px solid #2e2e2e',
            borderRadius: '12px', padding: '28px', width: '560px',
            maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
          }}>
            {/* Step: input */}
            {importStep === 'input' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <h2 style={{ color: '#e8e8e8', fontSize: '15px', fontWeight: 600, margin: 0 }}>Import from URL</h2>
                  <button onClick={closeImport} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}>×</button>
                </div>
                <p style={{ color: '#555', fontSize: '12px', margin: '0 0 16px' }}>
                  Paste a job posting link — we&apos;ll extract what we can. Add context below if the page doesn&apos;t load or you have more info.
                </p>

                {/* Primary URL */}
                <input
                  type="url"
                  value={importUrl}
                  onChange={e => setImportUrl(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) fetchImport(); }}
                  placeholder="https://jobs.company.com/..."
                  autoFocus
                  style={{
                    width: '100%', backgroundColor: '#1a1a1a', border: '1px solid #333',
                    borderRadius: '8px', padding: '11px 14px', color: '#e8e8e8', fontSize: '13px',
                    outline: 'none', boxSizing: 'border-box',
                  }}
                  onFocus={e => (e.target.style.borderColor = '#d97706')}
                  onBlur={e => (e.target.style.borderColor = '#333')}
                />

                {/* Additional context section */}
                <div style={{ marginTop: '16px', borderTop: '1px solid #242424', paddingTop: '14px' }}>
                  <div style={{ color: '#444', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '10px' }}>
                    Additional context <span style={{ color: '#333', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— optional</span>
                  </div>

                  {/* Extra text paste */}
                  <textarea
                    value={importExtraText}
                    onChange={e => setImportExtraText(e.target.value)}
                    placeholder="Paste the job description, a recruiter message, or any extra details you want included..."
                    rows={3}
                    style={{
                      width: '100%', backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a',
                      borderRadius: '7px', padding: '10px 12px', color: '#c0c0c0', fontSize: '12px',
                      outline: 'none', boxSizing: 'border-box', resize: 'vertical',
                      fontFamily: 'inherit', lineHeight: 1.5, marginBottom: '8px',
                    }}
                    onFocus={e => (e.target.style.borderColor = '#3a3a3a')}
                    onBlur={e => (e.target.style.borderColor = '#2a2a2a')}
                  />

                  {/* Extra link */}
                  <input
                    type="url"
                    value={importExtraLink}
                    onChange={e => setImportExtraLink(e.target.value)}
                    placeholder="Additional link (LinkedIn post, company page...)"
                    style={{
                      width: '100%', backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a',
                      borderRadius: '7px', padding: '9px 12px', color: '#c0c0c0', fontSize: '12px',
                      outline: 'none', boxSizing: 'border-box', marginBottom: '8px',
                    }}
                    onFocus={e => (e.target.style.borderColor = '#3a3a3a')}
                    onBlur={e => (e.target.style.borderColor = '#2a2a2a')}
                  />

                  {/* Screenshot upload */}
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    style={{ display: 'none' }}
                    onChange={handleImageUpload}
                  />
                  {!importImage ? (
                    <button
                      onClick={() => imageInputRef.current?.click()}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        backgroundColor: 'transparent', color: '#555', border: '1px dashed #2e2e2e',
                        borderRadius: '7px', padding: '8px 14px', fontSize: '12px',
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#444'; (e.currentTarget as HTMLButtonElement).style.color = '#888'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#2e2e2e'; (e.currentTarget as HTMLButtonElement).style.color = '#555'; }}
                    >
                      <ImageIcon size={12} /> Upload screenshot
                    </button>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '7px', padding: '8px 10px' }}>
                      <img src={importImage.previewUrl} alt="screenshot" style={{ width: '44px', height: '44px', objectFit: 'cover', borderRadius: '4px', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: '#c0c0c0', fontSize: '12px', fontWeight: 500 }}>Screenshot attached</div>
                        <div style={{ color: '#555', fontSize: '11px' }}>Claude will read this image</div>
                      </div>
                      <button onClick={removeImage} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: '18px', lineHeight: 1, padding: '2px 4px' }}
                        onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = '#f87171')}
                        onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = '#555')}>×</button>
                    </div>
                  )}
                </div>

                {importFetchError && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#f87171', fontSize: '12px', marginTop: '12px' }}>
                    <AlertCircle size={13} /> {importFetchError}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '18px' }}>
                  <button onClick={closeImport} style={{ backgroundColor: '#2a2a2a', color: '#777', border: '1px solid #333', borderRadius: '6px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer' }}>
                    Cancel
                  </button>
                  <button onClick={fetchImport} disabled={!importUrl.trim()} style={{
                    backgroundColor: !importUrl.trim() ? '#333' : '#d97706',
                    color: !importUrl.trim() ? '#555' : '#fff',
                    border: 'none', borderRadius: '6px', padding: '8px 20px',
                    fontSize: '13px', fontWeight: 600, cursor: !importUrl.trim() ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: '6px',
                  }}>
                    <LinkIcon size={13} /> Fetch & Parse
                  </button>
                </div>
              </>
            )}

            {/* Step: loading */}
            {importStep === 'loading' && (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <Loader size={28} color="#d97706" style={{ animation: 'spin 1s linear infinite', marginBottom: '16px' }} />
                <div style={{ color: '#888', fontSize: '13px' }}>Fetching and parsing job details...</div>
                <div style={{ color: '#444', fontSize: '11px', marginTop: '6px' }}>This takes a few seconds</div>
              </div>
            )}

            {/* Step: review */}
            {importStep === 'review' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <h2 style={{ color: '#e8e8e8', fontSize: '15px', fontWeight: 600, margin: 0 }}>Review & Add to Tracker</h2>
                  <button onClick={closeImport} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}>×</button>
                </div>
                {importWarning && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '7px', backgroundColor: '#2a2010', border: '1px solid #4a3010', borderRadius: '6px', padding: '10px 12px', marginBottom: '16px' }}>
                    <AlertCircle size={13} color="#d97706" style={{ flexShrink: 0, marginTop: '1px' }} />
                    <span style={{ color: '#d97706', fontSize: '12px', lineHeight: 1.5 }}>{importWarning}</span>
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <InputField label="Company *" field="company" form={importForm} setForm={setImportForm} />
                  <InputField label="Job Title *" field="title" form={importForm} setForm={setImportForm} />
                  <InputField label="Location" field="location" form={importForm} setForm={setImportForm} />
                  <InputField label="Salary / Compensation" field="salary_range" form={importForm} setForm={setImportForm} />
                  <InputField label="Deadline" field="deadline" form={importForm} setForm={setImportForm} type="date" />
                  <InputField label="Match Score (1–10)" field="match_score" form={importForm} setForm={setImportForm} type="number" />
                  <div>
                    <label style={{ display: 'block', color: '#666', fontSize: '11px', fontWeight: 500, marginBottom: '5px', letterSpacing: '0.03em' }}>Type *</label>
                    <select value={importForm.type} onChange={e => setImportForm(p => ({ ...p, type: e.target.value }))} style={inputStyle}>
                      {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', color: '#666', fontSize: '11px', fontWeight: 500, marginBottom: '5px', letterSpacing: '0.03em' }}>Source</label>
                    <input value={importForm.source} onChange={e => setImportForm(p => ({ ...p, source: e.target.value }))} style={inputStyle} />
                  </div>
                </div>
                <div style={{ marginTop: '12px' }}>
                  <label style={{ display: 'block', color: '#666', fontSize: '11px', fontWeight: 500, marginBottom: '5px', letterSpacing: '0.03em' }}>URL</label>
                  <input value={importForm.url} onChange={e => setImportForm(p => ({ ...p, url: e.target.value }))} style={inputStyle} />
                </div>
                <div style={{ marginTop: '12px' }}>
                  <label style={{ display: 'block', color: '#666', fontSize: '11px', fontWeight: 500, marginBottom: '5px', letterSpacing: '0.03em' }}>Notes</label>
                  <textarea value={importForm.notes} onChange={e => setImportForm(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
                </div>
                <div style={{ marginTop: '12px' }}>
                  <label style={{ display: 'block', color: '#666', fontSize: '11px', fontWeight: 500, marginBottom: '5px', letterSpacing: '0.03em' }}>Description</label>
                  <textarea value={importForm.description} onChange={e => setImportForm(p => ({ ...p, description: e.target.value }))} rows={3} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
                </div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
                  <button onClick={() => setImportStep('input')} style={{ display: 'flex', alignItems: 'center', gap: '5px', backgroundColor: '#2a2a2a', color: '#777', border: '1px solid #333', borderRadius: '6px', padding: '8px 14px', fontSize: '13px', cursor: 'pointer' }}>
                    <ArrowLeft size={12} /> Back
                  </button>
                  <button onClick={closeImport} style={{ backgroundColor: '#2a2a2a', color: '#777', border: '1px solid #333', borderRadius: '6px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer' }}>
                    Cancel
                  </button>
                  <button onClick={handleImportSave} disabled={saving || !importForm.company || !importForm.title} style={{
                    backgroundColor: !importForm.company || !importForm.title ? '#3a3a3a' : '#d97706',
                    color: !importForm.company || !importForm.title ? '#555' : '#fff',
                    border: 'none', borderRadius: '6px', padding: '8px 20px',
                    fontSize: '13px', fontWeight: 600,
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
        <div
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, backdropFilter: 'blur(2px)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div style={{
            backgroundColor: '#1e1e1e', border: '1px solid #2e2e2e',
            borderRadius: '10px', padding: '24px', width: '580px',
            maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ color: '#e8e8e8', fontSize: '15px', fontWeight: 600, margin: 0 }}>
                {editingJob ? 'Edit Job' : 'Add Job'}
              </h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}>×</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <InputField label="Company *" field="company" form={form} setForm={setForm} />
              <InputField label="Job Title *" field="title" form={form} setForm={setForm} />
              <InputField label="Location" field="location" form={form} setForm={setForm} />
              <InputField label="Salary Range" field="salary_range" form={form} setForm={setForm} />
              <InputField label="Posting Date" field="posting_date" form={form} setForm={setForm} type="date" />
              <InputField label="Deadline" field="deadline" form={form} setForm={setForm} type="date" />
              <InputField label="Match Score (1–10)" field="match_score" form={form} setForm={setForm} type="number" />
              <InputField label="Source" field="source" form={form} setForm={setForm} />
              <div>
                <label style={{ display: 'block', color: '#666', fontSize: '11px', fontWeight: 500, marginBottom: '5px', letterSpacing: '0.03em' }}>Type *</label>
                <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} style={inputStyle}>
                  {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', color: '#666', fontSize: '11px', fontWeight: 500, marginBottom: '5px', letterSpacing: '0.03em' }}>Status</label>
                <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} style={inputStyle}>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginTop: '12px' }}>
              <InputField label="URL" field="url" form={form} setForm={setForm} />
            </div>
            <div style={{ marginTop: '12px' }}>
              <label style={{ display: 'block', color: '#666', fontSize: '11px', fontWeight: 500, marginBottom: '5px', letterSpacing: '0.03em' }}>Notes</label>
              <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
            </div>
            <div style={{ marginTop: '12px' }}>
              <label style={{ display: 'block', color: '#666', fontSize: '11px', fontWeight: 500, marginBottom: '5px', letterSpacing: '0.03em' }}>Description</label>
              <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={3} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button onClick={() => setShowModal(false)} style={{ backgroundColor: '#2a2a2a', color: '#777', border: '1px solid #333', borderRadius: '6px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving || !form.company || !form.title} style={{
                backgroundColor: !form.company || !form.title ? '#3a3a3a' : '#d97706',
                color: !form.company || !form.title ? '#555' : '#fff',
                border: 'none', borderRadius: '6px', padding: '8px 20px',
                fontSize: '13px', fontWeight: 500,
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
