'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/apiFetch';
import { Star, Trash2, ExternalLink, ChevronDown, ChevronRight, Plus, LinkIcon, Loader, AlertCircle, ArrowLeft, ImageIcon, Edit2, RotateCcw, X, Check } from 'lucide-react';
import { useUser } from '@/app/hooks/useUser';
import { useOverlays } from '@/app/OverlayContext';
import { type Job, type AnalysisResult, type AnalysisState, type GapsResult, type GapsState, type BulletsResult, type BulletsState, type CoverLetterResult, type CoverLetterState, type Priority, LEVEL_CFG, TYPE_OPTIONS, TYPE_COLORS, STATUS_OPTIONS, scoreColor, greeting, getPriorities, typeLabel, PostedDisplay, DeadlineDisplay } from '@/app/lib/jobUtils';
import { StatusBadge } from '@/app/components/StatusBadge';
import { ConnStatusRow } from '@/app/components/ConnStatusRow';
import { type Connection, CONN_STATUS, CONN_CYCLE } from '@/app/components/ConnectionsPanel';

// ─── Form helpers ─────────────────────────────────────────────────────────────
const EMPTY_FORM = {
  company: '', title: '', type: 'fall-internship', status: 'saved',
  match_score: '', location: '', source: '', posting_date: '',
  deadline: '', url: '', salary_range: '', notes: '', description: '',
  type_year: '',
};
type FormData = typeof EMPTY_FORM;

const formInput: React.CSSProperties = {
  width: '100%', background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 'var(--r-lg)', padding: '8px 10px', color: 'var(--text)', fontSize: '13px',
  outline: 'none', boxSizing: 'border-box',
};

function Field({ label, field, form, setForm, type = 'text' }: {
  label: string; field: keyof FormData;
  form: FormData; setForm: React.Dispatch<React.SetStateAction<FormData>>; type?: string;
}) {
  return (
    <div>
      <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '11px', fontWeight: 500, marginBottom: '5px' }}>{label}</label>
      <input type={type} value={form[field]}
        onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
        style={formInput}
        onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
        onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { displayName } = useUser();
  const { openCoach, openProfile, openConnections, openTutorial, connectionsOpen, connectionsPrefillCompany } = useOverlays();
  const firstName = displayName.split(' ')[0];
  // greeting()/today both read the local clock — computing them during the
  // initial render lets the server's clock (often a different timezone, or
  // just a different instant) disagree with the browser's, which is a
  // hydration mismatch (React error #418). Deferring to after mount means
  // the very first client render matches the server's placeholder exactly,
  // and the real value lands a tick later as an ordinary state update.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const params = new URLSearchParams(window.location.search);
    const importParam = params.get('import');
    if (importParam) {
      window.history.replaceState({}, '', window.location.pathname);
      openImport();
      setImportUrl(importParam);
    } else if (!localStorage.getItem('cid_tutorial_done')) {
      openTutorial();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    setIsMobile(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const today = mounted ? new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : '';
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [loadError, setLoadError] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

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

  // Analysis cache: per job id, persists for session
  const analysisCacheRef = useRef<Record<number, AnalysisState>>({});
  const [analysisResults, setAnalysisResults] = useState<Record<number, AnalysisState>>({});
  const [showDescription, setShowDescription] = useState<Record<number, boolean>>({});

  const gapsCacheRef = useRef<Record<number, GapsState>>({});
  const [gapsResults, setGapsResults] = useState<Record<number, GapsState>>({});

  const bulletsCacheRef = useRef<Record<number, BulletsState>>({});
  const [bulletsResults, setBulletsResults] = useState<Record<number, BulletsState>>({});

  const coverLetterCacheRef = useRef<Record<number, CoverLetterState>>({});
  const [coverLetterResults, setCoverLetterResults] = useState<Record<number, CoverLetterState>>({});
  const [coverLetterTones, setCoverLetterTones] = useState<Record<number, string>>({});
  const [coverLetterAngles, setCoverLetterAngles] = useState<Record<number, string>>({});
  const [copiedJobId, setCopiedJobId] = useState<number | null>(null);

  const connectionsCacheRef = useRef<Record<string, Connection[]>>({});
  const [connectionsMap, setConnectionsMap] = useState<Record<string, Connection[]>>({});

  const runAnalysis = useCallback((id: number) => {
    if (!localStorage.getItem('cid_api_key')) {
      analysisCacheRef.current[id] = 'no-key';
      setAnalysisResults(prev => ({ ...prev, [id]: 'no-key' }));
      return;
    }
    analysisCacheRef.current[id] = 'loading';
    setAnalysisResults(prev => ({ ...prev, [id]: 'loading' }));
    apiFetch(`/api/jobs/${id}/analyze`, { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        const result: AnalysisState = data.error ? 'error' : data;
        analysisCacheRef.current[id] = result;
        setAnalysisResults(prev => ({ ...prev, [id]: result }));
        if (!data.error && typeof data.total === 'number') {
          const score = Math.round(data.total);
          const scoreData = JSON.stringify({ categories: data.categories, total: data.total, summary: data.summary });
          setJobs(prev => prev.map(j => j.id === id ? { ...j, match_score: score, score_data: scoreData } : j));
        }
      })
      .catch(() => {
        analysisCacheRef.current[id] = 'error';
        setAnalysisResults(prev => ({ ...prev, [id]: 'error' }));
      });
  }, []);

  const runGaps = useCallback((id: number) => {
    gapsCacheRef.current[id] = 'loading';
    setGapsResults(prev => ({ ...prev, [id]: 'loading' }));
    apiFetch(`/api/jobs/${id}/gaps`, { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        const result: GapsState = data.error ? 'error' : data;
        gapsCacheRef.current[id] = result;
        setGapsResults(prev => ({ ...prev, [id]: result }));
        if (!data.error) setJobs(prev => prev.map(j => j.id === id ? { ...j, gaps_data: JSON.stringify(data) } : j));
      })
      .catch(() => { gapsCacheRef.current[id] = 'error'; setGapsResults(prev => ({ ...prev, [id]: 'error' })); });
  }, []);

  const runBullets = useCallback((id: number) => {
    bulletsCacheRef.current[id] = 'loading';
    setBulletsResults(prev => ({ ...prev, [id]: 'loading' }));
    apiFetch(`/api/jobs/${id}/bullets`, { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        const result: BulletsState = data.error ? 'error' : data;
        bulletsCacheRef.current[id] = result;
        setBulletsResults(prev => ({ ...prev, [id]: result }));
        if (!data.error) setJobs(prev => prev.map(j => j.id === id ? { ...j, bullets_data: JSON.stringify(data) } : j));
      })
      .catch(() => { bulletsCacheRef.current[id] = 'error'; setBulletsResults(prev => ({ ...prev, [id]: 'error' })); });
  }, []);

  const refreshAnalysis = useCallback((id: number) => {
    delete analysisCacheRef.current[id];
    delete gapsCacheRef.current[id];
    delete bulletsCacheRef.current[id];
    runAnalysis(id);
    if (localStorage.getItem('cid_api_key')) {
      runGaps(id);
      runBullets(id);
    }
  }, [runAnalysis, runGaps, runBullets]);

  const runCoverLetter = useCallback((id: number, tone: string, angle: string) => {
    coverLetterCacheRef.current[id] = 'loading';
    setCoverLetterResults(prev => ({ ...prev, [id]: 'loading' }));
    apiFetch(`/api/jobs/${id}/cover-letter`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tone, angle }) })
      .then(r => r.json())
      .then(data => {
        const result: CoverLetterState = data.error ? 'error' : data;
        coverLetterCacheRef.current[id] = result;
        setCoverLetterResults(prev => ({ ...prev, [id]: result }));
        if (!data.error) setJobs(prev => prev.map(j => j.id === id ? { ...j, cover_letter_data: JSON.stringify(data) } : j));
      })
      .catch(() => { coverLetterCacheRef.current[id] = 'error'; setCoverLetterResults(prev => ({ ...prev, [id]: 'error' })); });
  }, []);

  const fetchConnections = useCallback(async (company: string) => {
    if (!company || connectionsCacheRef.current[company] !== undefined) return;
    connectionsCacheRef.current[company] = [];
    try {
      const data = await apiFetch(`/api/connections?company=${encodeURIComponent(company)}`).then(r => r.json());
      connectionsCacheRef.current[company] = data;
      setConnectionsMap(prev => ({ ...prev, [company]: data }));
    } catch {
      delete connectionsCacheRef.current[company];
    }
  }, []);

  // Adding/editing a connection always happens in the standalone Connections
  // overlay now, which keeps its own state — so when it closes, force a
  // re-fetch of whatever company was in context here, otherwise a contact
  // added mid-session wouldn't show up in an already-expanded job's Network
  // tab until a full page reload.
  const wasConnectionsOpen = useRef(false);
  useEffect(() => {
    if (wasConnectionsOpen.current && !connectionsOpen && connectionsPrefillCompany) {
      delete connectionsCacheRef.current[connectionsPrefillCompany];
      fetchConnections(connectionsPrefillCompany);
    }
    wasConnectionsOpen.current = connectionsOpen;
  }, [connectionsOpen, connectionsPrefillCompany, fetchConnections]);

  const cycleConnStatus = async (company: string, connId: number, current: string) => {
    const next = CONN_CYCLE[(CONN_CYCLE.indexOf(current) + 1) % CONN_CYCLE.length];
    await apiFetch(`/api/connections/${connId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next }) });
    const updated = (connectionsMap[company] || []).map(c => c.id === connId ? { ...c, status: next } : c);
    connectionsCacheRef.current[company] = updated;
    setConnectionsMap(prev => ({ ...prev, [company]: updated }));
  };
  const setConnStatus = async (company: string, connId: number, status: string) => {
    await apiFetch(`/api/connections/${connId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    const updated = (connectionsMap[company] || []).map(c => c.id === connId ? { ...c, status } : c);
    connectionsCacheRef.current[company] = updated;
    setConnectionsMap(prev => ({ ...prev, [company]: updated }));
  };

  const deleteConnection = async (company: string, connId: number) => {
    await apiFetch(`/api/connections/${connId}`, { method: 'DELETE' });
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
  const skipToManual = () => { setImportWarning(''); setImportForm({ ...EMPTY_FORM, source: 'Manual' }); setImportStep('review'); };

  const fetchImport = async () => {
    const trimmedUrl = importUrl.trim();
    const trimmedText = importExtraText.trim();
    if (!trimmedUrl && !trimmedText) return;
    if (!localStorage.getItem('cid_api_key')) {
      setImportFetchError('Add your API key in Profile to auto-fill from a link or description.');
      return;
    }
    setImportFetchError(''); setImportStep('loading');
    try {
      const res = await apiFetch('/api/jobs/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmedUrl || undefined, extraText: trimmedText || undefined, imageBase64: importImage?.base64, imageMediaType: importImage?.mediaType, extraLink: importExtraLink.trim() || undefined }),
      });
      const data = await res.json();
      if (data.error) { setImportFetchError(data.error); setImportStep('input'); return; }
      setImportWarning(data.warning || '');
      setImportForm({ company: data.company||'', title: data.title||'', type: data.type||'fall-internship', status: 'saved', match_score: '', location: data.location||'', source: data.source||'Pasted', posting_date: data.posting_date||'', deadline: data.deadline||'', url: data.url||trimmedUrl, salary_range: data.salary_range||'', notes: '', description: data.description||'', type_year: '' });
      setImportStep('review');
    } catch { setImportFetchError('Request failed.'); setImportStep('input'); }
  };

  const handleImportSave = async () => {
    setSaving(true);
    setImportFetchError('');
    try {
      await apiFetch('/api/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...importForm, match_score: importForm.match_score ? parseInt(importForm.match_score) : null, type_year: importForm.type_year ? parseInt(importForm.type_year) : null }) });
      closeImport(); fetchJobs();
    } catch {
      setImportFetchError('Save failed — check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await apiFetch('/api/jobs').then(r => r.json());
      setJobs(data);
      setExpandedCompanies(new Set([...new Set(data.map((j: Job) => j.company))] as string[]));
    } catch {
      setJobs([]);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    const payload = { ...form, match_score: form.match_score ? parseInt(form.match_score) : null, type_year: form.type_year ? parseInt(form.type_year) : null };
    try {
      if (editingJob) {
        await apiFetch(`/api/jobs/${editingJob.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      } else {
        await apiFetch('/api/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      }
      setShowModal(false); fetchJobs();
    } catch {
      setSaveError('Save failed — check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    setPendingDeleteId(null);
    try {
      await apiFetch(`/api/jobs/${id}`, { method: 'DELETE' });
      setExpandedJobs(prev => { const n = new Set(prev); n.delete(id); return n; });
      fetchJobs();
    } catch { /* leave the job in place — user can retry */ }
  };

  const handleStatusChange = async (id: number, status: string) => {
    const prev = jobs.find(j => j.id === id)?.status;
    setJobs(jobs => jobs.map(j => j.id === id ? { ...j, status } : j));
    try {
      await apiFetch(`/api/jobs/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    } catch {
      if (prev) setJobs(jobs => jobs.map(j => j.id === id ? { ...j, status: prev } : j));
    }
  };

  const handleStarToggle = async (id: number, current: number) => {
    const starred = current ? 0 : 1;
    await apiFetch(`/api/jobs/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ starred }) });
    setJobs(prev => prev.map(j => j.id === id ? { ...j, starred } : j));
  };

  const toggleJob = useCallback((id: number) => {
    setExpandedJobs(prev => {
      const n = new Set(prev);
      if (n.has(id)) { n.delete(id); }
      else {
        n.add(id);
        const thisJob = jobs.find(j => j.id === id);
        const hasKey = !!localStorage.getItem('cid_api_key');
        // Hydrate all three from DB on first expand this session
        if (thisJob?.score_data && !analysisCacheRef.current[id]) {
          try {
            const parsed = JSON.parse(thisJob.score_data) as AnalysisResult;
            analysisCacheRef.current[id] = parsed;
            setAnalysisResults(prev => ({ ...prev, [id]: parsed }));
          } catch { /* ignore corrupt data */ }
        }
        if (thisJob?.gaps_data && !gapsCacheRef.current[id]) {
          try {
            const parsed = JSON.parse(thisJob.gaps_data) as GapsResult;
            gapsCacheRef.current[id] = parsed;
            setGapsResults(prev => ({ ...prev, [id]: parsed }));
          } catch { /* ignore corrupt data */ }
        }
        if (thisJob?.bullets_data && !bulletsCacheRef.current[id]) {
          try {
            const parsed = JSON.parse(thisJob.bullets_data) as BulletsResult;
            bulletsCacheRef.current[id] = parsed;
            setBulletsResults(prev => ({ ...prev, [id]: parsed }));
          } catch { /* ignore corrupt data */ }
        }
        if (thisJob?.cover_letter_data && !coverLetterCacheRef.current[id]) {
          try {
            const parsed = JSON.parse(thisJob.cover_letter_data) as CoverLetterResult;
            coverLetterCacheRef.current[id] = parsed;
            setCoverLetterResults(prev => ({ ...prev, [id]: parsed }));
            if (parsed.tone) setCoverLetterTones(prev => ({ ...prev, [id]: parsed.tone }));
          } catch { /* ignore corrupt data */ }
        }
        const neverRun = !analysisCacheRef.current[id] && !thisJob?.match_score;
        if (neverRun) {
          // First time — fire all three simultaneously
          runAnalysis(id);
          if (hasKey) {
            if (!gapsCacheRef.current[id]) runGaps(id);
            if (!bulletsCacheRef.current[id]) runBullets(id);
          }
        } else if (hasKey) {
          // Previously scored — backfill gaps/bullets if not persisted yet
          if (!gapsCacheRef.current[id]) runGaps(id);
          if (!bulletsCacheRef.current[id]) runBullets(id);
        }
        fetchConnections(thisJob?.company || '');
      }
      return n;
    });
    setJobTabs(prev => prev[id] ? prev : { ...prev, [id]: 'overview' });
  }, [runAnalysis, runGaps, runBullets, fetchConnections, jobs]);

  const setTab = (id: number, tab: string) => {
    setJobTabs(prev => ({ ...prev, [id]: tab }));
  };

  const openEdit = (job: Job) => {
    setEditingJob(job);
    setForm({ company: job.company, title: job.title, type: job.type, status: job.status, match_score: job.match_score?.toString()||'', location: job.location||'', source: job.source||'', posting_date: job.posting_date||'', deadline: job.deadline||'', url: job.url||'', salary_range: job.salary_range||'', notes: job.notes||'', description: job.description||'', type_year: job.type_year?.toString()||'' });
    setSaveError('');
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

  const priorities = getPriorities(jobs);

  // Priorities live on this same page now — clicking one expands and
  // scrolls to the matching row instead of navigating anywhere.
  const jumpToJob = (jobId: number) => {
    const job = jobs.find(j => j.id === jobId);
    if (!job) return;
    setExpandedCompanies(prev => new Set(prev).add(job.company));
    setExpandedJobs(prev => new Set(prev).add(jobId));
    setJobTabs(prev => prev[jobId] ? prev : { ...prev, [jobId]: 'overview' });
    const hasKey = !!localStorage.getItem('cid_api_key');
    if (job.score_data && !analysisCacheRef.current[jobId]) {
      try { const p = JSON.parse(job.score_data) as AnalysisResult; analysisCacheRef.current[jobId] = p; setAnalysisResults(prev => ({ ...prev, [jobId]: p })); } catch { /* ignore */ }
    }
    if (job.gaps_data && !gapsCacheRef.current[jobId]) {
      try { const p = JSON.parse(job.gaps_data) as GapsResult; gapsCacheRef.current[jobId] = p; setGapsResults(prev => ({ ...prev, [jobId]: p })); } catch { /* ignore */ }
    }
    if (job.bullets_data && !bulletsCacheRef.current[jobId]) {
      try { const p = JSON.parse(job.bullets_data) as BulletsResult; bulletsCacheRef.current[jobId] = p; setBulletsResults(prev => ({ ...prev, [jobId]: p })); } catch { /* ignore */ }
    }
    if (job.cover_letter_data && !coverLetterCacheRef.current[jobId]) {
      try { const p = JSON.parse(job.cover_letter_data) as CoverLetterResult; coverLetterCacheRef.current[jobId] = p; setCoverLetterResults(prev => ({ ...prev, [jobId]: p })); if (p.tone) setCoverLetterTones(prev => ({ ...prev, [jobId]: p.tone })); } catch { /* ignore */ }
    }
    const neverRun = !analysisCacheRef.current[jobId] && !job.match_score;
    if (neverRun) {
      runAnalysis(jobId);
      if (hasKey) {
        if (!gapsCacheRef.current[jobId]) runGaps(jobId);
        if (!bulletsCacheRef.current[jobId]) runBullets(jobId);
      }
    } else if (hasKey) {
      if (!gapsCacheRef.current[jobId]) runGaps(jobId);
      if (!bulletsCacheRef.current[jobId]) runBullets(jobId);
    }
    fetchConnections(job.company);
    setTimeout(() => document.getElementById(`job-row-${jobId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
  };

  const SortIcon = ({ col }: { col: string }) => sortBy !== col ? null : <span style={{ marginLeft: '3px', fontSize: '9px' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>;
  const colHdr = (col: string): React.CSSProperties => ({ cursor: 'pointer', userSelect: 'none', color: sortBy === col ? 'var(--accent-hi)' : 'var(--text-muted)', display: 'flex', alignItems: 'center' });

  const GRID = '28px 1fr 90px 95px 68px 90px 90px 72px';
  const GAP = '0 8px';

  const isStale = (job: Job) => job.status === 'applied' && !!job.status_updated_at && (Date.now() - new Date(job.status_updated_at).getTime()) / 86400000 >= 14;

  return (
    <div className="px-4 py-5 sm:px-8 sm:py-7" style={{ minHeight: '100vh', background: 'transparent', width: '100%' }}>

      {/* Greeting + priorities — this is the whole app now, the table below
          is the main event so this stays compact. */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ color: 'var(--text)', fontSize: '17px', fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>
            {mounted ? greeting() : 'Welcome'}{firstName ? `, ${firstName}` : ''}
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '11px', margin: '4px 0 0' }}>{today}</p>
        </div>
        {jobs.length > 0 && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button data-tutorial="add-job" onClick={openImport} className="btn-primary"><Plus size={13} /> Add a Job</button>
          </div>
        )}
      </div>

      {priorities.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '20px' }}>
          {priorities.slice(0, 3).map((p, i) => {
            const c = LEVEL_CFG[p.level];
            return (
              <button key={i} onClick={() => p.level === 'interview' ? openCoach(`I have an upcoming interview for ${p.sub} at the company behind: "${p.label}". Help me prepare with likely questions and strong answers based on my background.`) : jumpToJob(p.jobId)} style={{
                display: 'flex', alignItems: 'center', gap: '10px', width: '100%', textAlign: 'left',
                backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)',
                padding: '9px 14px', cursor: 'pointer', fontFamily: 'inherit',
              }}>
                <div style={{ flexShrink: 0 }}>{c.icon}</div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ color: 'var(--text)', fontSize: '12px', fontWeight: 600 }}>{p.label}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '11px', marginLeft: '8px' }}>{p.sub}</span>
                </div>
                {p.score != null && <span style={{ fontSize: '11px', fontWeight: 700, color: scoreColor(p.score), flexShrink: 0 }}>{p.score}/100</span>}
                <span style={{ fontSize: '9px', fontWeight: 700, color: c.color, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{c.tag}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '18px', flexWrap: 'wrap' }}>
        {[
          { label: 'tracked', value: stats.total, color: 'var(--text)', always: true },
          { label: 'applied', value: stats.applied, color: 'var(--text-muted)', always: false },
          { label: 'interviewing', value: stats.interviewing, color: 'var(--accent)', always: false },
          { label: stats.offers === 1 ? 'offer' : 'offers', value: stats.offers, color: 'var(--success)', always: false },
          { label: 'starred', value: stats.starred, color: 'var(--accent)', always: false },
        ].filter(s => s.always || s.value > 0).map(({ label, value, color }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
            <span style={{ color, fontWeight: 700, fontSize: '14px', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {/* Row 1: search + status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <input
            type="text" placeholder="Search..."
            value={searchText} onChange={e => setSearchText(e.target.value)}
            style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '6px 12px', color: 'var(--text)', fontSize: '12px', outline: 'none', width: '160px', flexShrink: 0 }}
          />
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {['all','saved','applied','interviewing','offer','rejected'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)} style={{
                backgroundColor: statusFilter === s ? 'var(--accent-bg)' : 'var(--surface)',
                color: statusFilter === s ? 'var(--accent-hi)' : 'var(--text-muted)',
                border: `1px solid ${statusFilter === s ? 'var(--accent-dim)' : 'var(--border)'}`,
                borderRadius: '20px', padding: '4px 10px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize', transition: 'all 0.1s',
              }}>{s === 'all' ? 'All' : s}</button>
            ))}
          </div>
        </div>
        {/* Row 2: type + starred */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
          {['all', ...TYPE_OPTIONS.map(t => t.value)].map(v => {
            const label = v === 'all' ? 'All Types' : TYPE_OPTIONS.find(t => t.value === v)?.label || v;
            return (
              <button key={v} onClick={() => setTypeFilter(v)} style={{
                backgroundColor: typeFilter === v ? 'var(--border)' : 'var(--surface)',
                color: typeFilter === v ? 'var(--accent)' : 'var(--text-muted)',
                border: `1px solid ${typeFilter === v ? 'var(--border-hi)' : 'var(--border)'}`,
                borderRadius: '20px', padding: '4px 10px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.1s',
              }}>{label}</button>
            );
          })}
          <div style={{ width: '1px', height: '16px', backgroundColor: 'var(--border)', margin: '0 4px' }} />
          <button onClick={() => setStarFilter(p => !p)} style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            backgroundColor: starFilter ? 'var(--accent-bg)' : 'var(--surface)',
            color: starFilter ? 'var(--accent-hi)' : 'var(--text-muted)',
            border: `1px solid ${starFilter ? 'var(--accent-dim)' : 'var(--border)'}`,
            borderRadius: '20px', padding: '4px 10px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.1s',
          }}>
            <Star size={11} fill={starFilter ? 'var(--accent)' : 'none'} /> Starred
          </button>
        </div>
        {isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600, flexShrink: 0 }}>Sort</span>
            <select
              value={sortBy ? `${sortBy}-${sortDir}` : ''}
              onChange={e => {
                const v = e.target.value;
                if (!v) { setSortBy(null); setSortDir('asc'); }
                else { const [col, dir] = v.split('-'); setSortBy(col); setSortDir(dir as 'asc' | 'desc'); }
              }}
              style={{ backgroundColor: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '4px 8px', color: 'var(--text)', fontSize: '12px', outline: 'none', fontFamily: 'inherit' }}
            >
              <option value="">Default (starred first)</option>
              <option value="title-asc">Title A–Z</option>
              <option value="title-desc">Title Z–A</option>
              <option value="match_score-desc">Score: High first</option>
              <option value="match_score-asc">Score: Low first</option>
              <option value="deadline-asc">Deadline: Soonest</option>
              <option value="deadline-desc">Deadline: Latest</option>
              <option value="status-asc">Status A–Z</option>
            </select>
          </div>
        )}
      </div>
      {(searchText || statusFilter !== 'all' || typeFilter !== 'all' || starFilter) && (
        <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginBottom: '10px' }}>
          {sortedJobs.length} result{sortedJobs.length !== 1 ? 's' : ''}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '80px', fontSize: '13px' }}>Loading...</div>
      ) : loadError ? (
        <div style={{ textAlign: 'center', padding: '80px 32px' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '12px' }}>Failed to load jobs.</div>
          <button onClick={fetchJobs} className="btn-ghost" style={{ fontSize: '12px', padding: '6px 14px' }}>Retry</button>
        </div>
      ) : jobs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 32px' }}>
          <div style={{ color: 'var(--text)', fontSize: '14px', marginBottom: '6px' }}>No jobs tracked yet</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '24px' }}>Paste a link, paste the description, or just type it in yourself</div>
          <button data-tutorial="add-job" onClick={openImport} className="btn-primary" style={{ margin: '0 auto' }}>
            <Plus size={13} /> Add a Job
          </button>
        </div>
      ) : (
        <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflowX: 'auto', overflowY: 'hidden' }}>
          {/* Column headers — the stacked mobile row layout below doesn't have
              fixed columns to label, so this is desktop-only. Sorting still
              works on mobile via the filter pills above the table. */}
          {!isMobile && (
            <div style={{
              display: 'grid', gridTemplateColumns: GRID, gap: GAP, minWidth: '720px',
              padding: '9px 16px', borderBottom: '1px solid var(--border)',
              fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em',
            }}>
              <div />
              <div style={colHdr('title')} onClick={() => handleSort('title')}>Title <SortIcon col="title" /></div>
              <div style={colHdr('type')} onClick={() => handleSort('type')}>Type <SortIcon col="type" /></div>
              <div style={colHdr('status')} onClick={() => handleSort('status')}>Status <SortIcon col="status" /></div>
              <div style={colHdr('match_score')} onClick={() => handleSort('match_score')}>Score <SortIcon col="match_score" /></div>
              <div style={colHdr('deadline')} onClick={() => handleSort('deadline')}>Deadline <SortIcon col="deadline" /></div>
              <div style={colHdr('posting_date')} onClick={() => handleSort('posting_date')}>Posted <SortIcon col="posting_date" /></div>
              <div style={{ color: 'var(--text-muted)' }}>Actions</div>
            </div>
          )}

          {Object.entries(grouped).map(([company, companyJobs], groupIdx) => {
            const isExpanded = expandedCompanies.has(company);
            const isLast = groupIdx === Object.entries(grouped).length - 1;
            return (
              <div key={company}>
                {/* Company header */}
                <div onClick={() => setExpandedCompanies(prev => { const n = new Set(prev); n.has(company) ? n.delete(company) : n.add(company); return n; })}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px', minWidth: isMobile ? undefined : '720px',
                    padding: '11px 16px', backgroundColor: 'var(--surface)',
                    borderTop: groupIdx > 0 ? '1px solid var(--border)' : undefined,
                    borderBottom: isExpanded ? '1px solid var(--border)' : (!isLast ? '1px solid var(--border)' : undefined),
                    cursor: 'pointer', userSelect: 'none',
                  }}>
                  {isExpanded ? <ChevronDown size={11} color="var(--text-muted)" /> : <ChevronRight size={11} color="var(--text-muted)" />}
                  <span style={{ color: 'var(--text)', fontWeight: 700, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{company}</span>
                  <span style={{ backgroundColor: 'var(--border-dim)', color: 'var(--text-muted)', borderRadius: '20px', padding: '1px 7px', fontSize: '11px', fontWeight: 500, flexShrink: 0 }}>
                    {companyJobs.length} {companyJobs.length === 1 ? 'role' : 'roles'}
                  </span>
                  {companyJobs.some(j => j.starred) && <Star size={11} color="var(--accent)" fill="var(--accent)" style={{ flexShrink: 0 }} />}
                </div>

                {isExpanded && companyJobs.map((job, idx) => {
                  const isJobExpanded = expandedJobs.has(job.id);
                  const activeTab = jobTabs[job.id] || 'overview';
                  const analysis = analysisResults[job.id];
                  const isLastInGroup = idx === companyJobs.length - 1;
                  return (
                    <div key={job.id}>
                      {/* Job row — a stacked flex layout under 768px, the
                          fixed-column grid (GRID) above it. Different enough
                          (1 row vs 2, columns vs wrap) that branching here
                          beats contorting one grid to do both. */}
                      {isMobile ? (
                        <div
                          id={`job-row-${job.id}`}
                          onClick={() => toggleJob(job.id)}
                          style={{
                            padding: '12px 16px',
                            borderBottom: (isJobExpanded || !isLastInGroup) ? '1px solid var(--border)' : undefined,
                            cursor: 'pointer', transition: 'background 0.1s',
                            backgroundColor: isJobExpanded ? 'var(--surface)' : 'transparent',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                            <div onClick={e => { e.stopPropagation(); handleStarToggle(job.id, job.starred); }} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', paddingTop: '2px', flexShrink: 0 }}>
                              <Star size={13} color={job.starred ? 'var(--accent-hi)' : 'var(--text-dim)'} fill={job.starred ? 'var(--accent)' : 'none'} />
                            </div>

                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ color: 'var(--text)', fontWeight: 600, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {job.title}
                              </div>
                              {isStale(job) && (
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', marginTop: '3px', backgroundColor: 'rgba(168,85,247,0.08)', borderRadius: '20px', padding: '1px 6px' }}>
                                  <div style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#a855f7' }} />
                                  <span style={{ color: '#a855f7', fontSize: '11px', fontWeight: 600 }}>Follow up</span>
                                </div>
                              )}
                            </div>

                            <div style={{ display: 'flex', gap: '2px', alignItems: 'center', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                              <button onClick={() => openEdit(job)} title="Edit" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: '5px', borderRadius: '20px', display: 'flex' }}>
                                <Edit2 size={11} />
                              </button>
                              {pendingDeleteId === job.id ? (
                                <>
                                  <button onClick={() => handleDelete(job.id)} title="Confirm delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '4px 6px', borderRadius: 'var(--r-sm)', display: 'flex', alignItems: 'center', gap: '2px', fontSize: '11px', fontWeight: 700, fontFamily: 'inherit' }}>
                                    <Check size={10} /> Del
                                  </button>
                                  <button onClick={() => setPendingDeleteId(null)} title="Cancel" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', borderRadius: '20px', display: 'flex' }}>
                                    <X size={10} />
                                  </button>
                                </>
                              ) : (
                                <button onClick={() => setPendingDeleteId(job.id)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: '5px', borderRadius: '20px', display: 'flex' }}>
                                  <Trash2 size={11} />
                                </button>
                              )}
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginTop: '8px', paddingLeft: '21px' }}>
                            <span style={{ color: TYPE_COLORS[job.type] || 'var(--text-muted)', fontSize: '11px', fontWeight: 700, letterSpacing: '0.02em' }}>
                              {typeLabel(job.type, job.type_year)}
                            </span>
                            <div onClick={e => e.stopPropagation()}>
                              <StatusBadge job={job} onStatusChange={handleStatusChange} />
                            </div>
                            {job.match_score != null && (() => {
                              let gap: string | null = null;
                              if (job.score_data) {
                                try {
                                  const d = JSON.parse(job.score_data) as AnalysisResult;
                                  if (d.categories?.length) {
                                    const w = d.categories.reduce((a, b) => (a.score / a.max) <= (b.score / b.max) ? a : b);
                                    gap = w.name;
                                  }
                                } catch { /* ignore */ }
                              }
                              return (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                  <span style={{ color: scoreColor(job.match_score), fontWeight: 800, fontSize: '12px', fontVariantNumeric: 'tabular-nums' }}>
                                    {job.match_score}/100
                                  </span>
                                  {gap && <span style={{ color: 'var(--text-dim)', fontSize: '10px' }}>↓ {gap}</span>}
                                </div>
                              );
                            })()}
                            {job.deadline && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{ color: 'var(--text-dim)', fontSize: '11px' }}>Due</span>
                                <DeadlineDisplay deadline={job.deadline} />
                              </span>
                            )}
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ color: 'var(--text-dim)', fontSize: '11px' }}>Posted</span>
                              <PostedDisplay date={job.posting_date} />
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div
                          id={`job-row-${job.id}`}
                          onClick={() => toggleJob(job.id)}
                          style={{
                            display: 'grid', gridTemplateColumns: GRID, gap: GAP, alignItems: 'center', minWidth: '720px',
                            padding: '12px 16px',
                            borderBottom: (isJobExpanded || !isLastInGroup) ? '1px solid var(--border)' : undefined,
                            cursor: 'pointer', transition: 'background 0.1s',
                            backgroundColor: isJobExpanded ? 'var(--surface)' : 'transparent',
                          }}
                          onMouseEnter={e => !isJobExpanded && (e.currentTarget.style.backgroundColor = 'var(--surface)')}
                          onMouseLeave={e => !isJobExpanded && (e.currentTarget.style.backgroundColor = 'transparent')}
                        >
                          {/* Star */}
                          <div onClick={e => { e.stopPropagation(); handleStarToggle(job.id, job.starred); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                            <Star size={13} color={job.starred ? 'var(--accent-hi)' : 'var(--text-dim)'} fill={job.starred ? 'var(--accent)' : 'none'}
                              style={{ transition: 'all 0.15s' }} />
                          </div>

                          {/* Title */}
                          <div>
                            <div style={{ color: 'var(--text)', fontWeight: 600, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {job.title}
                            </div>
                            {isStale(job) && (
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', marginTop: '3px', backgroundColor: 'rgba(168,85,247,0.08)', borderRadius: '20px', padding: '1px 6px' }}>
                                <div style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#a855f7' }} />
                                <span style={{ color: '#a855f7', fontSize: '11px', fontWeight: 600 }}>Follow up</span>
                              </div>
                            )}
                          </div>

                          {/* Type */}
                          <div>
                            <span style={{ color: TYPE_COLORS[job.type] || 'var(--text-muted)', fontSize: '11px', fontWeight: 700, letterSpacing: '0.02em' }}>
                              {typeLabel(job.type, job.type_year)}
                            </span>
                          </div>

                          {/* Status */}
                          <div onClick={e => e.stopPropagation()}>
                            <StatusBadge job={job} onStatusChange={handleStatusChange} />
                          </div>

                          {/* Score */}
                          <div>
                            {job.match_score ? (() => {
                              let gap: string | null = null;
                              if (job.score_data) {
                                try {
                                  const d = JSON.parse(job.score_data) as AnalysisResult;
                                  if (d.categories?.length) {
                                    const w = d.categories.reduce((a, b) => (a.score / a.max) <= (b.score / b.max) ? a : b);
                                    gap = w.name;
                                  }
                                } catch { /* ignore */ }
                              }
                              return (
                                <span
                                  title={gap ? `Gap: ${gap}` : undefined}
                                  style={{ color: scoreColor(job.match_score), fontWeight: 800, fontSize: '12px', fontVariantNumeric: 'tabular-nums', cursor: gap ? 'help' : 'default' }}
                                >
                                  {job.match_score}/100
                                </span>
                              );
                            })() : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                          </div>

                          {/* Deadline */}
                          <div><DeadlineDisplay deadline={job.deadline} /></div>

                          {/* Posted date */}
                          <div><PostedDisplay date={job.posting_date} /></div>

                          {/* Actions */}
                          <div style={{ display: 'flex', gap: '2px', alignItems: 'center', justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                            <button onClick={() => openEdit(job)} title="Edit" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: '5px', borderRadius: '20px', display: 'flex' }}
                              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-muted)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-dim)')}>
                              <Edit2 size={11} />
                            </button>
                            {pendingDeleteId === job.id ? (
                              <>
                                <button onClick={() => handleDelete(job.id)} title="Confirm delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '4px 6px', borderRadius: 'var(--r-sm)', display: 'flex', alignItems: 'center', gap: '2px', fontSize: '11px', fontWeight: 700, fontFamily: 'inherit' }}>
                                  <Check size={10} /> Del
                                </button>
                                <button onClick={() => setPendingDeleteId(null)} title="Cancel" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', borderRadius: '20px', display: 'flex' }}>
                                  <X size={10} />
                                </button>
                              </>
                            ) : (
                              <button onClick={() => setPendingDeleteId(job.id)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: '5px', borderRadius: '20px', display: 'flex' }}
                                onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-dim)')}>
                                <Trash2 size={11} />
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Expanded panel */}
                      {isJobExpanded && (
                        <div style={{ backgroundColor: 'var(--bg)', borderBottom: '1px solid var(--border)', padding: '0 16px 24px' }}>
                          {/* Tabs */}
                          <div className="hide-scrollbar" style={{ display: 'flex', gap: '0px', borderBottom: '1px solid var(--border)', marginBottom: '20px', paddingTop: '14px', flexWrap: 'nowrap', overflowX: 'auto' }}>
                            {[
                              { id: 'overview',        label: 'Overview' },
                              { id: 'analysis',        label: 'Analysis' },
                              { id: 'resume-bullets',  label: 'Resume Bullets' },
                              { id: 'cover-letter',    label: 'Cover Letter' },
                            ].map(tab => (
                              <button key={tab.id} onClick={() => setTab(job.id, tab.id)} style={{
                                backgroundColor: 'transparent',
                                color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-muted)',
                                border: 'none', borderBottom: activeTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
                                padding: '6px 14px', fontSize: '11px', fontWeight: activeTab === tab.id ? 700 : 400,
                                cursor: 'pointer', fontFamily: 'inherit', marginBottom: '-1px', transition: 'color 0.1s',
                                whiteSpace: 'nowrap',
                              }}
                                onMouseEnter={e => { if (activeTab !== tab.id) e.currentTarget.style.color = 'var(--text-muted)'; }}
                                onMouseLeave={e => { if (activeTab !== tab.id) e.currentTarget.style.color = 'var(--text-muted)'; }}
                              >{tab.label}</button>
                            ))}
                          </div>

                          {/* Overview tab */}
                          {activeTab === 'overview' && (
                            <div>
                              {/* Score summary card — shown if analysis is available */}
                              {(() => {
                                const r = analysis && analysis !== 'loading' && analysis !== 'error' && analysis !== 'no-key' ? analysis as AnalysisResult : null;
                                const score = r?.total ?? job.match_score;
                                if (!score) return null;
                                return (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', backgroundColor: 'var(--surface)', borderRadius: 'var(--r-lg)', padding: '14px 16px', marginBottom: '16px', cursor: 'pointer' }}
                                    onClick={() => setTab(job.id, 'analysis')}>
                                    <div style={{ width: '56px', height: '56px', borderRadius: '50%', flexShrink: 0, border: `2px solid ${scoreColor(score)}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                      <span style={{ fontSize: '20px', fontWeight: 800, color: scoreColor(score), lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{score}</span>
                                      <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>/100</span>
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      {r ? (
                                        <div style={{ color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.5 }}>{r.summary}</div>
                                      ) : (
                                        <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Score from last analysis — click to view breakdown</div>
                                      )}
                                    </div>
                                    <ChevronRight size={13} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                                  </div>
                                );
                              })()}
                              {job.url && (
                                <a href={job.url} target="_blank" rel="noopener noreferrer" style={{
                                  display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '18px',
                                  backgroundColor: 'var(--accent)', color: '#0A0A0A', borderRadius: 'var(--r)',
                                  padding: '8px 18px', fontSize: '13px', fontWeight: 700, textDecoration: 'none',
                                }}>
                                  <ExternalLink size={13} /> Open Job Posting
                                </a>
                              )}
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px 20px', marginBottom: '14px' }}>
                                {[
                                  { label: 'Location', value: job.location },
                                  { label: 'Deadline', value: job.deadline ? <><span style={{ color: 'var(--text-muted)' }}>{job.deadline}</span> <DeadlineDisplay deadline={job.deadline} /></> : null },
                                  { label: 'Salary', value: job.salary_range },
                                  { label: 'Type', value: job.type ? <span style={{ color: TYPE_COLORS[job.type] || 'var(--text-muted)', fontWeight: 700 }}>{typeLabel(job.type, job.type_year)}</span> : null },
                                  { label: 'Source', value: job.source },
                                  { label: 'Posted', value: job.posting_date },
                                ].map(({ label, value }) => (
                                  value ? (
                                    <div key={label}>
                                      <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>{label}</div>
                                      <div style={{ color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.4 }}>{value}</div>
                                    </div>
                                  ) : null
                                ))}
                              </div>
                              {job.description && (
                                <div style={{ backgroundColor: 'var(--surface)', borderRadius: 'var(--r-lg)', padding: '12px 14px', marginBottom: '14px' }}>
                                  <button onClick={() => setShowDescription(p => ({ ...p, [job.id]: !p[job.id] }))} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Full description</span>
                                    {showDescription[job.id] ? <ChevronDown size={12} color="var(--text-muted)" /> : <ChevronRight size={12} color="var(--text-muted)" />}
                                  </button>
                                  {showDescription[job.id] && (
                                    <pre style={{ color: 'var(--text-muted)', fontSize: '11px', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '10px 0 0', fontFamily: 'inherit', maxHeight: '280px', overflowY: 'auto' }}>
                                      {job.description}
                                    </pre>
                                  )}
                                </div>
                              )}
                              {job.notes && (
                                <div style={{ backgroundColor: 'var(--surface)', borderRadius: 'var(--r-lg)', padding: '12px 14px' }}>
                                  <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Notes</div>
                                  <div style={{ color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.6 }}>{job.notes}</div>
                                </div>
                              )}

                              {/* Network / Connections — view + status-cycle + delete in context;
                                  adding/editing always goes through the standalone Connections
                                  overlay now, so there's one add form in the whole app, not two. */}
                              {(() => {
                                const conns = connectionsMap[job.company] || [];
                                return (
                                  <div style={{ backgroundColor: 'var(--surface)', borderRadius: 'var(--r-lg)', padding: '12px 14px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: conns.length > 0 ? '10px' : 0 }}>
                                      <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        Network
                                        {conns.length > 0 && <span style={{ backgroundColor: 'transparent', color: 'var(--text-muted)', borderRadius: '20px', padding: '0 5px', fontSize: '9px', fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>{conns.length}</span>}
                                      </div>
                                      <button onClick={() => openConnections(job.company)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '11px', fontWeight: 600, padding: '1px 4px', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '3px', borderRadius: 'var(--r-sm)' }}>
                                        <Plus size={11} /> Add
                                      </button>
                                    </div>

                                    {conns.length === 0 && (
                                      <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontStyle: 'italic' }}>No connections at {job.company} yet.</div>
                                    )}

                                    {conns.length > 0 && (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                        {conns.map(conn => {
                                          const cs = CONN_STATUS[conn.status] || CONN_STATUS.not_reached_out;
                                          return (
                                            <ConnStatusRow
                                              key={conn.id}
                                              conn={conn}
                                              cs={cs}
                                              onSet={(status) => setConnStatus(job.company, conn.id, status)}
                                              onDelete={() => deleteConnection(job.company, conn.id)}
                                            />
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          )}

                          {/* Analysis tab — score breakdown + fit gaps */}
                          {activeTab === 'analysis' && (
                            <div>
                              {analysis === 'loading' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '12px', padding: '20px 0' }}>
                                  <Loader size={14} color="var(--accent)" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                                  Analyzing fit against your profile...
                                </div>
                              )}
                              {!analysis && job.match_score && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '20px', padding: '8px 0' }}>
                                  <div style={{
                                    width: '82px', height: '82px', borderRadius: '50%', flexShrink: 0,
                                    border: `3px solid ${scoreColor(job.match_score)}`,
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                  }}>
                                    <span style={{ fontSize: '28px', fontWeight: 800, color: scoreColor(job.match_score), lineHeight: 1 }}>{job.match_score}</span>
                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>/100</span>
                                  </div>
                                  <div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '8px' }}>Score from last analysis.</div>
                                    <button onClick={() => refreshAnalysis(job.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', backgroundColor: 'var(--surface)', color: 'var(--accent)', border: '1px solid var(--accent-dim)', borderRadius: 'var(--r-lg)', padding: '6px 14px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                                      Refresh all →
                                    </button>
                                  </div>
                                </div>
                              )}
                              {analysis === 'error' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '12px', padding: '12px 0' }}>
                                  <AlertCircle size={13} color="var(--danger)" />
                                  Analysis failed.{' '}
                                  <button onClick={() => refreshAnalysis(job.id)} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '12px', padding: 0, fontFamily: 'inherit' }}>Retry</button>
                                </div>
                              )}
                              {analysis === 'no-key' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-muted)', fontSize: '12px', padding: '12px 0', flexWrap: 'wrap' }}>
                                  <AlertCircle size={13} color="var(--accent)" />
                                  Add your API key to get an AI fit score for this job.
                                  <button onClick={() => openProfile('resume')} className="btn-ghost" style={{ padding: '4px 12px', fontSize: '11px' }}>Add key</button>
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
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                      }}>
                                        <span style={{ fontSize: '28px', fontWeight: 800, color: scoreColor(r.total), lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{r.total}</span>
                                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>/100</span>
                                      </div>
                                      <div style={{ flex: 1 }}>
                                        <div style={{ color: 'var(--text)', fontSize: '13px', lineHeight: 1.6 }}>{r.summary}</div>
                                        <button onClick={() => refreshAnalysis(job.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '8px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '11px', padding: 0, fontFamily: 'inherit' }}
                                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-muted)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
                                          <RotateCcw size={10} /> Refresh all
                                        </button>
                                      </div>
                                    </div>
                                    {/* Category bars — each category has its own max (25/20/20/20/15,
                                        not a uniform 0-100), so color/width are driven by percent-of-max,
                                        not the raw score. */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '18px' }}>
                                      {r.categories.map(cat => {
                                        const pct = cat.max > 0 ? (cat.score / cat.max) * 100 : 0;
                                        return (
                                          <div key={cat.name}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '5px' }}>
                                              <span style={{ color: 'var(--text)', fontSize: '12px', fontWeight: 600 }}>{cat.name}</span>
                                              <span style={{ color: scoreColor(pct), fontSize: '13px', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{cat.score}/{cat.max}</span>
                                            </div>
                                            <div style={{ backgroundColor: 'var(--surface)', borderRadius: '20px', height: '4px', overflow: 'hidden', marginBottom: '4px' }}>
                                              <div style={{
                                                width: '100%', height: '100%', borderRadius: '20px',
                                                backgroundColor: scoreColor(pct),
                                                transform: `scaleX(${pct / 100})`, transformOrigin: 'left',
                                                transition: 'transform 0.8s cubic-bezier(0.4,0,0.2,1)',
                                              }} />
                                            </div>
                                            <div style={{ color: 'var(--text-muted)', fontSize: '11px', lineHeight: 1.5 }}>{cat.rationale}</div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })()}

                              {/* Gaps section — rendered inline below score breakdown */}
                              {(() => {
                                const gaps = gapsResults[job.id];
                                if (!gaps) return null;
                                if (gaps === 'loading') return (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '12px', padding: '20px 0', borderTop: '1px solid var(--border)', marginTop: '8px' }}>
                                    <Loader size={14} color="var(--accent)" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                                    Analyzing fit gaps...
                                  </div>
                                );
                                if (gaps === 'error') return (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '12px', padding: '12px 0', borderTop: '1px solid var(--border)', marginTop: '8px' }}>
                                    <AlertCircle size={13} color="var(--danger)" /> Fit gaps failed.{' '}
                                    <button onClick={() => { delete gapsCacheRef.current[job.id]; runGaps(job.id); }} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '12px', padding: 0, fontFamily: 'inherit' }}>Retry</button>
                                  </div>
                                );
                                const g = gaps as GapsResult;
                                return (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderTop: '1px solid var(--border)', marginTop: '8px', paddingTop: '20px' }}>
                                    <div style={{ backgroundColor: 'var(--success-bg)', border: '1px solid var(--success-bg)', borderRadius: 'var(--r-lg)', padding: '14px 16px' }}>
                                      <div style={{ color: 'var(--success)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>Your Positioning</div>
                                      <p style={{ color: 'var(--success)', fontSize: '12px', lineHeight: 1.65, margin: 0 }}>{g.positioning}</p>
                                    </div>
                                    <div>
                                      <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '10px' }}>Gaps to Address</div>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {g.gaps.map((gap, i) => (
                                          <div key={i} style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '12px 14px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                                              <span style={{ color: gap.severity === 'major' ? 'var(--danger)' : 'var(--accent)', fontSize: '11px', fontWeight: 700 }}>{gap.skill}</span>
                                              <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: gap.severity === 'major' ? 'var(--danger)' : 'var(--accent-hi)', backgroundColor: gap.severity === 'major' ? 'var(--danger-bg)' : 'var(--accent-bg)', border: `1px solid ${gap.severity === 'major' ? 'var(--danger-bg)' : 'var(--accent-dim)'}`, borderRadius: 'var(--r-sm)', padding: '1px 5px' }}>{gap.severity}</span>
                                            </div>
                                            <p style={{ color: 'var(--text-muted)', fontSize: '11px', margin: 0, lineHeight: 1.55 }}>{gap.how_to_address}</p>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', backgroundColor: g.should_apply ? 'var(--success-bg)' : 'var(--danger-bg)', border: `1px solid ${g.should_apply ? 'var(--success-bg)' : 'var(--danger-bg)'}`, borderRadius: 'var(--r-lg)', padding: '12px 16px' }}>
                                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: g.should_apply ? 'var(--success)' : 'var(--danger)', fontSize: '14px', fontWeight: 800, flexShrink: 0 }}>
                                        {g.should_apply ? <><Check size={13} /> Apply</> : <><X size={13} /> Skip</>}
                                      </span>
                                      <span style={{ color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.5 }}>{g.apply_reasoning}</span>
                                    </div>
                                    <div>
                                      <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>Quick Wins</div>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        {g.quick_wins.map((w, i) => (
                                          <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                            <span style={{ color: 'var(--success)', fontSize: '11px', flexShrink: 0, marginTop: '2px' }}>→</span>
                                            <span style={{ color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.55 }}>{w}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
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
                            const angle = coverLetterAngles[job.id] || '';
                            return (
                              <div>
                                {/* Optional angle input */}
                                <div style={{ marginBottom: '12px' }}>
                                  <textarea
                                    value={angle}
                                    onChange={e => setCoverLetterAngles(p => ({ ...p, [job.id]: e.target.value.slice(0, 300) }))}
                                    placeholder="Optional — why this role specifically? (e.g. a connection to the company's mission, a specific project that excites you)"
                                    rows={2}
                                    style={{
                                      width: '100%', resize: 'vertical', backgroundColor: 'var(--bg)',
                                      border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '10px 12px',
                                      color: 'var(--text)', fontSize: '12px', fontFamily: 'inherit', lineHeight: 1.5,
                                    }}
                                  />
                                  <div style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: '11px', marginTop: '3px' }}>{angle.length}/300</div>
                                </div>

                                {/* Tone selector + generate */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                                  <span style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600, flexShrink: 0 }}>Tone:</span>
                                  {(['professional', 'confident', 'concise'] as const).map(t => (
                                    <button key={t} onClick={() => setCoverLetterTones(p => ({ ...p, [job.id]: t }))} style={{
                                      backgroundColor: tone === t ? 'var(--accent-bg)' : 'var(--surface)',
                                      color: tone === t ? 'var(--accent)' : 'var(--text-muted)',
                                      border: `1px solid ${tone === t ? 'var(--accent-dim)' : 'var(--border)'}`,
                                      borderRadius: '20px', padding: '4px 12px', fontSize: '11px', fontWeight: 600,
                                      cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize',
                                    }}>{t}</button>
                                  ))}
                                  <button onClick={() => runCoverLetter(job.id, tone, angle)} disabled={isLoading} className="btn-primary" style={{ marginLeft: 'auto', padding: '6px 16px', fontSize: '12px', cursor: isLoading ? 'wait' : 'pointer' }}>
                                    {isLoading ? <><Loader size={11} style={{ animation: 'spin 1s linear infinite' }} /> Generating…</> : result ? 'Regenerate' : 'Generate'}
                                  </button>
                                </div>

                                {isError && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '12px', padding: '12px 0' }}>
                                    <AlertCircle size={13} color="var(--danger)" /> Failed.{' '}
                                    <button onClick={() => runCoverLetter(job.id, tone, angle)} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '12px', padding: 0, fontFamily: 'inherit' }}>Retry</button>
                                  </div>
                                )}

                                {!cl && !isLoading && (
                                  <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '32px 20px', textAlign: 'center' }}>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Select a tone and click Generate</div>
                                  </div>
                                )}

                                {result && (
                                  <div>
                                    <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '20px', marginBottom: '12px', maxHeight: '360px', overflowY: 'auto', animation: 'fadeIn 0.25s ease' }}>
                                      <pre style={{ color: 'var(--text)', fontSize: '12px', lineHeight: 1.75, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, fontFamily: 'inherit' }}>
                                        {result.letter}
                                      </pre>
                                    </div>
                                    {result.keywords && result.keywords.length > 0 && (
                                      <div style={{ marginBottom: '12px' }}>
                                        <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: '6px' }}>
                                          ATS keywords mirrored in this letter
                                        </div>
                                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                          {result.keywords.map((kw, i) => (
                                            <span key={i} style={{ background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '2px 7px', fontSize: '11px' }}>{kw}</span>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    <button
                                      onClick={() => {
                                        navigator.clipboard.writeText(result.letter);
                                        setCopiedJobId(job.id);
                                        setTimeout(() => setCopiedJobId(null), 2000);
                                      }}
                                      style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                                        backgroundColor: copiedJobId === job.id ? 'var(--success)' : 'var(--surface)',
                                        color: copiedJobId === job.id ? '#86efac' : 'var(--text-muted)',
                                        border: `1px solid ${copiedJobId === job.id ? '#16a34a' : 'var(--border)'}`,
                                        borderRadius: 'var(--r-lg)', padding: '6px 14px', fontSize: '12px', fontWeight: 600,
                                        cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                                      }}>
                                      {copiedJobId === job.id ? <><Check size={12} /> Copied!</> : 'Copy to Clipboard'}
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          {/* Resume Bullets tab */}
                          {activeTab === 'resume-bullets' && (() => {
                            const bl = bulletsResults[job.id];
                            return (
                              <div>
                                {!bl && (
                                  <div style={{ padding: '20px 0' }}>
                                    <button onClick={() => runBullets(job.id)} className="btn-primary" style={{ fontSize: '12px', padding: '7px 16px' }}>
                                      Generate Resume Bullets
                                    </button>
                                  </div>
                                )}
                                {bl === 'loading' && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '12px', padding: '20px 0' }}>
                                    <Loader size={14} color="var(--accent)" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                                    Tailoring resume bullets...
                                  </div>
                                )}
                                {bl === 'error' && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '12px', padding: '12px 0' }}>
                                    <AlertCircle size={13} color="var(--danger)" /> Failed.{' '}
                                    <button onClick={() => { delete bulletsCacheRef.current[job.id]; runBullets(job.id); }} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '12px', padding: 0, fontFamily: 'inherit' }}>Retry</button>
                                  </div>
                                )}
                                {bl && bl !== 'loading' && bl !== 'error' && (() => {
                                  const b = bl as BulletsResult;
                                  return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', animation: 'fadeIn 0.25s ease' }}>

                                      {/* Lead With */}
                                      <div>
                                        <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>Lead With These</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                          {b.lead_with.map((item, i) => (
                                            <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', backgroundColor: 'var(--surface)', borderRadius: 'var(--r-lg)', padding: '10px 13px' }}>
                                              <span style={{ color: 'var(--accent)', fontWeight: 800, fontSize: '12px', flexShrink: 0, marginTop: '1px' }}>{i + 1}</span>
                                              <div>
                                                <div style={{ color: 'var(--text)', fontSize: '12px', fontWeight: 600, marginBottom: '2px' }}>{item.experience}</div>
                                                <div style={{ color: 'var(--text-muted)', fontSize: '11px', lineHeight: 1.5 }}>{item.why}</div>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>

                                      {/* Tailored bullets */}
                                      <div>
                                        <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>Tailored Bullets</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                          {b.tailored_bullets.map((item, i) => (
                                            <div key={i} style={{ backgroundColor: 'var(--surface)', borderRadius: 'var(--r-lg)', padding: '12px 14px' }}>
                                              <div style={{ display: 'flex', gap: '6px', marginBottom: '6px', alignItems: 'flex-start' }}>
                                                <span style={{ color: 'var(--text-muted)', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0, marginTop: '2px', lineHeight: 1.6 }}>Before</span>
                                                <span style={{ color: 'var(--text-muted)', fontSize: '11px', lineHeight: 1.55, textDecoration: 'line-through' }}>{item.original}</span>
                                              </div>
                                              <div style={{ display: 'flex', gap: '6px', marginBottom: '6px', alignItems: 'flex-start' }}>
                                                <span style={{ color: 'var(--success)', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0, marginTop: '2px', lineHeight: 1.6 }}>After</span>
                                                <span style={{ color: 'var(--text)', fontSize: '11px', lineHeight: 1.55, fontWeight: 500 }}>{item.tailored}</span>
                                              </div>
                                              <div style={{ color: 'var(--text-muted)', fontSize: '11px', lineHeight: 1.5, borderTop: '1px solid var(--border)', paddingTop: '6px', marginTop: '4px' }}>{item.why}</div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>

                                      {/* Keywords + Deprioritize */}
                                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                        <div>
                                          <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>Add These Keywords</div>
                                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                                            {b.keywords_to_add.map((k, i) => (
                                              <span key={i} style={{ backgroundColor: 'var(--surface)', color: '#818cf8', border: '1px solid rgba(129,140,248,0.2)', borderRadius: '20px', padding: '3px 8px', fontSize: '11px', fontWeight: 500 }}>{k}</span>
                                            ))}
                                          </div>
                                        </div>
                                        {b.deprioritize.length > 0 && (
                                          <div>
                                            <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>Deprioritize</div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                              {b.deprioritize.map((item, i) => (
                                                <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                                                  <span style={{ color: 'var(--danger)', fontSize: '11px', flexShrink: 0 }}>↓</span>
                                                  <span style={{ color: 'var(--text-muted)', fontSize: '11px', lineHeight: 1.5 }}>{item}</span>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                      </div>

                                      <button onClick={() => { delete bulletsCacheRef.current[job.id]; runBullets(job.id); }} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '11px', padding: 0, fontFamily: 'inherit', alignSelf: 'flex-start' }}
                                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-muted)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
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
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}
          onClick={e => { if (e.target === e.currentTarget) closeImport(); }}>
          <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '28px', width: '560px', maxHeight: '88vh', overflowY: 'auto' }}>
            {importStep === 'input' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <h2 style={{ color: 'var(--text)', fontSize: '15px', fontWeight: 700, margin: 0 }}>Add a job</h2>
                  <button onClick={closeImport} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}>×</button>
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: '0 0 16px' }}>Paste a link or the job description and we&apos;ll fill in the details for you to confirm — or <button onClick={skipToManual} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '12px', padding: 0, fontFamily: 'inherit', textDecoration: 'underline' }}>skip straight to typing it in yourself</button>.</p>
                <input type="url" value={importUrl} onChange={e => setImportUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') fetchImport(); }}
                  placeholder="https://jobs.company.com/..." autoFocus
                  style={{ width: '100%', backgroundColor: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '11px 14px', color: 'var(--text)', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                  onFocus={e => (e.target.style.borderColor = 'var(--accent)')} onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
                <div style={{ marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>Job description <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>— required if no link above</span></div>
                  <textarea value={importExtraText} onChange={e => setImportExtraText(e.target.value)} placeholder="Paste the job description, a recruiter email, or any extra details..." rows={3}
                    style={{ width: '100%', backgroundColor: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '10px 12px', color: 'var(--text-muted)', fontSize: '12px', outline: 'none', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, marginBottom: '8px' }} />
                  <input type="url" value={importExtraLink} onChange={e => setImportExtraLink(e.target.value)} placeholder="Additional link (LinkedIn, company page...)"
                    style={{ width: '100%', backgroundColor: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '9px 12px', color: 'var(--text-muted)', fontSize: '12px', outline: 'none', boxSizing: 'border-box', marginBottom: '8px' }} />
                  <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: 'none' }} onChange={handleImageUpload} />
                  {!importImage ? (
                    <button onClick={() => imageInputRef.current?.click()}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: 'transparent', color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: 'var(--r-lg)', padding: '8px 14px', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}>
                      <ImageIcon size={12} /> Upload screenshot
                    </button>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '8px 10px' }}>
                      <img src={importImage.previewUrl} alt="screenshot" style={{ width: '44px', height: '44px', objectFit: 'cover', borderRadius: '20px', flexShrink: 0 }} />
                      <div style={{ flex: 1 }}><div style={{ color: 'var(--text)', fontSize: '12px', fontWeight: 500 }}>Screenshot attached</div><div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Claude will read this image</div></div>
                      <button onClick={removeImage} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}>×</button>
                    </div>
                  )}
                </div>
                {importFetchError && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--danger)', fontSize: '12px', marginTop: '12px', flexWrap: 'wrap' }}>
                    <AlertCircle size={13} style={{ flexShrink: 0 }} /> {importFetchError}
                    {importFetchError.includes('API key') && (
                      <button onClick={() => { closeImport(); openProfile('resume'); }} className="btn-ghost" style={{ padding: '3px 10px', fontSize: '11px' }}>Add key</button>
                    )}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '18px' }}>
                  <button onClick={closeImport} style={{ backgroundColor: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '8px 16px', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
                  <button onClick={fetchImport} disabled={!importUrl.trim() && !importExtraText.trim()} className="btn-primary">
                    <LinkIcon size={13} /> Parse Job
                  </button>
                </div>
              </>
            )}
            {importStep === 'loading' && (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <Loader size={28} color="var(--accent)" style={{ animation: 'spin 1s linear infinite', marginBottom: '16px' }} />
                <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Parsing job details...</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '6px' }}>Takes a few seconds</div>
              </div>
            )}
            {importStep === 'review' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <h2 style={{ color: 'var(--text)', fontSize: '15px', fontWeight: 700, margin: 0 }}>{importForm.source === 'Manual' ? 'Enter the details' : 'Review & confirm'}</h2>
                  <button onClick={closeImport} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}>×</button>
                </div>
                {importWarning && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '7px', backgroundColor: 'var(--accent-bg)', border: '1px solid var(--accent-dim)', borderRadius: 'var(--r-lg)', padding: '10px 12px', marginBottom: '16px' }}>
                    <AlertCircle size={13} color="var(--accent)" style={{ flexShrink: 0, marginTop: '1px' }} />
                    <span style={{ color: 'var(--accent)', fontSize: '12px', lineHeight: 1.5 }}>{importWarning}</span>
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <Field label="Company *" field="company" form={importForm} setForm={setImportForm} />
                  <Field label="Job Title *" field="title" form={importForm} setForm={setImportForm} />
                  <Field label="Location" field="location" form={importForm} setForm={setImportForm} />
                  <Field label="Salary" field="salary_range" form={importForm} setForm={setImportForm} />
                  <Field label="Date Posted" field="posting_date" form={importForm} setForm={setImportForm} type="date" />
                  <Field label="Deadline" field="deadline" form={importForm} setForm={setImportForm} type="date" />
                  <Field label="Match Score (1–10)" field="match_score" form={importForm} setForm={setImportForm} type="number" />
                  <div>
                    <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '11px', fontWeight: 500, marginBottom: '5px' }}>Type</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <select value={importForm.type} onChange={e => setImportForm(p => ({ ...p, type: e.target.value }))} style={{ ...formInput, flex: 2 }}>
                        {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                      {(importForm.type === 'fall-internship' || importForm.type === 'spring-internship') && (
                        <input type="number" value={importForm.type_year} onChange={e => setImportForm(p => ({ ...p, type_year: e.target.value }))} placeholder="Year" min="2024" max="2035" style={{ ...formInput, flex: 1, minWidth: 0 }} />
                      )}
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '11px', fontWeight: 500, marginBottom: '5px' }}>Source</label>
                    <input value={importForm.source} onChange={e => setImportForm(p => ({ ...p, source: e.target.value }))} style={formInput} />
                  </div>
                </div>
                <div style={{ marginTop: '12px' }}>
                  <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '11px', fontWeight: 500, marginBottom: '5px' }}>URL</label>
                  <input value={importForm.url} onChange={e => setImportForm(p => ({ ...p, url: e.target.value }))} style={formInput} />
                </div>
                <div style={{ marginTop: '12px' }}>
                  <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '11px', fontWeight: 500, marginBottom: '5px' }}>Notes</label>
                  <textarea value={importForm.notes} onChange={e => setImportForm(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ ...formInput, resize: 'vertical', fontFamily: 'inherit' }} />
                </div>
                <div style={{ marginTop: '12px' }}>
                  <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '11px', fontWeight: 500, marginBottom: '5px' }}>Description</label>
                  <textarea value={importForm.description} onChange={e => setImportForm(p => ({ ...p, description: e.target.value }))} rows={3} style={{ ...formInput, resize: 'vertical', fontFamily: 'inherit' }} />
                </div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
                  <button onClick={() => setImportStep('input')} style={{ display: 'flex', alignItems: 'center', gap: '5px', backgroundColor: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '8px 14px', fontSize: '13px', cursor: 'pointer' }}>
                    <ArrowLeft size={12} /> Back
                  </button>
                  <button onClick={closeImport} style={{ backgroundColor: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '8px 16px', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
                  <button onClick={handleImportSave} disabled={saving || !importForm.company || !importForm.title} className="btn-primary">
                    {saving ? 'Adding...' : 'Add to Tracker'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Edit Modal — only reachable via the row's edit icon now; adding a new
          job always goes through the unified Add-a-Job flow above. */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '24px', width: '580px', maxHeight: '88vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ color: 'var(--text)', fontSize: '15px', fontWeight: 700, margin: 0 }}>Edit Job</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}><X size={16} /></button>
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
                <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '11px', fontWeight: 500, marginBottom: '5px' }}>Type</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} style={{ ...formInput, flex: 2 }}>
                    {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  {(form.type === 'fall-internship' || form.type === 'spring-internship') && (
                    <input type="number" value={form.type_year} onChange={e => setForm(p => ({ ...p, type_year: e.target.value }))} placeholder="Year" min="2024" max="2035" style={{ ...formInput, flex: 1, minWidth: 0 }} />
                  )}
                </div>
              </div>
              <div>
                <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '11px', fontWeight: 500, marginBottom: '5px' }}>Status</label>
                <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} style={formInput}>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginTop: '12px' }}><Field label="URL" field="url" form={form} setForm={setForm} /></div>
            <div style={{ marginTop: '12px' }}>
              <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '11px', fontWeight: 500, marginBottom: '5px' }}>Notes</label>
              <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ ...formInput, resize: 'vertical', fontFamily: 'inherit' }} />
            </div>
            <div style={{ marginTop: '12px' }}>
              <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '11px', fontWeight: 500, marginBottom: '5px' }}>Description</label>
              <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={3} style={{ ...formInput, resize: 'vertical', fontFamily: 'inherit' }} />
            </div>
            {saveError && <div style={{ color: 'var(--danger)', fontSize: '11px', textAlign: 'right', marginTop: '12px' }}>{saveError}</div>}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px' }}>
              <button onClick={() => setShowModal(false)} style={{ backgroundColor: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '8px 16px', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.company || !form.title} className="btn-primary">
                {saving ? 'Saving...' : 'Save Job'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
