'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/apiFetch';
import { extractResumeText, type ParsedProfile } from '@/lib/resumeExtract';
import { Edit2, ExternalLink, Loader, FileText, Check, Download, Upload, Plus, Activity, X, Trash2, Brain, Smartphone } from 'lucide-react';
import { useOverlays } from '@/app/OverlayContext';
import { BookOpen } from 'lucide-react';
import { useRef } from 'react';

interface ProfileData {
  id?: number; name?: string; email?: string; phone?: string; linkedin?: string;
  university?: string; degree?: string; graduation_date?: string; gpa?: string;
  honors?: string; minors?: string; target_roles?: string; target_cities?: string; notes?: string;
}
interface Resume { id: number; name: string; raw_text: string | null; parsed_at: string | null; is_default: number; }
interface UsageByRoute { route: string; calls: number; input_tokens: number; output_tokens: number; web_search_requests: number; cost_usd: number; }
interface Usage {
  total_calls: number; total_input_tokens: number; total_output_tokens: number;
  total_web_search_requests: number; total_cost_usd: number; since: string | null;
  by_route: UsageByRoute[];
}
function fmtTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}
const ROUTE_LABELS: Record<string, string> = {
  coach_chat: 'Coach Chat', memory_extraction: 'Memory Extraction',
  fit_scorecard: 'Fit Scorecard', resume_bullets: 'Resume Bullets', cover_letter: 'Cover Letter',
  job_details: 'Job Details', fit_gaps: 'Fit Gaps', job_import: 'Job Import',
  resume_extract: 'Resume Parsing',
  profile_summary: 'Profile Summary',
};
const ROUTE_DESCRIPTIONS: Record<string, string> = {
  coach_chat: 'Personalized job search coaching',
  fit_scorecard: 'Match score breakdown by category',
  fit_gaps: 'Skill gaps vs. job requirements',
  resume_bullets: 'Resume bullets tailored to each role',
  cover_letter: 'Cover letter drafts',
  memory_extraction: 'Saves insights from Coach chats',
  job_import: 'AI extraction from pasted job postings',
  resume_extract: 'Parses your uploaded resume',
  profile_summary: 'AI summary of your profile',
};
interface Memory { id: number; content: string; category: string; source: string; created_at: string; }
const MEMORY_CATEGORIES = ['preference', 'goal', 'insight', 'company', 'role', 'location', 'skill', 'story_bank', 'other'];

const TABS = [
  { id: 'resume', label: 'Profile' },
  { id: 'usage', label: 'Usage' },
  { id: 'memory', label: 'Memory' },
];

function timeAgo(ts: string) {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const fieldLabelStyle: React.CSSProperties = { color: 'var(--text-muted)', fontSize: '10px', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 };

export function ProfilePanel() {
  const { profileOpen, closeProfile, profileTab, openTutorial } = useOverlays();
  const [tab, setTab] = useState('resume');
  useEffect(() => { if (profileOpen) setTab(profileTab || 'resume'); }, [profileOpen, profileTab]);

  const [profile, setProfile] = useState<ProfileData>({});
  const [editField, setEditField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveFieldError, setSaveFieldError] = useState('');

  const [resumes, setResumes] = useState<Resume[]>([]);
  const [activeResumeId, setActiveResumeId] = useState<number | null>(null);
  const [resumeEditing, setResumeEditing] = useState(false);
  const [resumeDraft, setResumeDraft] = useState('');
  const [nameDraft, setNameDraft] = useState('');
  const [resumeSaving, setResumeSaving] = useState(false);
  const [resumeParsing, setResumeParsing] = useState(false);
  const [resumeFileName, setResumeFileName] = useState('');
  const [resumeError, setResumeError] = useState('');
  const [pendingProfileFields, setPendingProfileFields] = useState<ParsedProfile | null>(null);
  const [prefilledFields, setPrefilledFields] = useState<string[]>([]);
  const activeResume = resumes.find(r => r.id === activeResumeId) || null;

  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [backupMsg, setBackupMsg] = useState('');
  const [backupErr, setBackupErr] = useState('');

  const [deviceCode, setDeviceCode] = useState('');
  const [deviceCodeExpiry, setDeviceCodeExpiry] = useState<Date | null>(null);
  const [deviceCodeLoading, setDeviceCodeLoading] = useState(false);
  const [deviceCodeSecondsLeft, setDeviceCodeSecondsLeft] = useState(0);
  const deviceCodeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [deviceCodeMode, setDeviceCodeMode] = useState<'generate' | 'redeem'>('generate');
  const [redeemCode, setRedeemCode] = useState('');
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [redeemError, setRedeemError] = useState('');

  const [usage, setUsage] = useState<Usage | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(true);

  const [memories, setMemories] = useState<Memory[]>([]);
  const [memLoading, setMemLoading] = useState(true);
  const [memFilter, setMemFilter] = useState('all');

  async function loadResumes(selectId?: number) {
    try {
      const data = await apiFetch('/api/resumes').then(r => r.json()) as Resume[];
      setResumes(data);
      const fallback = data.find(r => r.is_default) || data[0];
      setActiveResumeId(selectId ?? fallback?.id ?? null);
    } catch { /* panel shows empty resume state */ }
  }
  async function fetchMemories() {
    const data = await apiFetch('/api/memories').then(r => r.json()).catch(() => []);
    setMemories(Array.isArray(data) ? data : []);
    setMemLoading(false);
  }

  const loaded = useState(() => ({ done: false }))[0];
  useEffect(() => {
    if (!profileOpen || loaded.done) return;
    loaded.done = true;
    apiFetch('/api/profile').then(r => r.json()).then(data => setProfile(data)).catch(() => {});
    loadResumes();
    apiFetch('/api/usage').then(r => r.json()).then(data => setUsage(data)).finally(() => setLoadingUsage(false));
    fetchMemories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileOpen]);

  useEffect(() => {
    if (!profileOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeProfile(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [profileOpen, closeProfile]);

  async function generateDeviceCode() {
    setDeviceCodeLoading(true);
    try {
      const res = await apiFetch('/api/device-code', { method: 'POST' });
      const data = await res.json();
      if (data.error) return;
      setDeviceCode(data.code);
      const expiry = new Date(data.expires_at);
      setDeviceCodeExpiry(expiry);
      const tick = () => {
        const left = Math.max(0, Math.round((expiry.getTime() - Date.now()) / 1000));
        setDeviceCodeSecondsLeft(left);
        if (left === 0) { setDeviceCode(''); setDeviceCodeExpiry(null); }
      };
      tick();
      if (deviceCodeTimerRef.current) clearInterval(deviceCodeTimerRef.current);
      deviceCodeTimerRef.current = setInterval(tick, 1000);
    } finally {
      setDeviceCodeLoading(false);
    }
  }

  async function handleRedeemCode() {
    setRedeemError('');
    const clean = redeemCode.replace(/\D/g, '');
    if (clean.length !== 6) { setRedeemError('Enter the full 6-digit code.'); return; }
    setRedeemLoading(true);
    try {
      const res = await fetch('/api/device-code/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: clean }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Code not found.');
      localStorage.setItem('cid_user_id', data.user_id);
      if (data.display_name) localStorage.setItem('cid_display_name', data.display_name);
      window.location.reload();
    } catch (err) {
      setRedeemError(err instanceof Error ? err.message : 'Could not redeem code.');
    }
    setRedeemLoading(false);
  }

  async function handleExport() {
    setExporting(true); setBackupErr('');
    try {
      const res = await apiFetch('/api/export');
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `career-dashboard-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setBackupMsg('Downloaded.');
    } catch { setBackupErr('Export failed. Try again.'); }
    setExporting(false);
  }

  async function handleImportFile(file: File | undefined) {
    if (!file) return;
    setImporting(true); setBackupErr(''); setBackupMsg('');
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = await apiFetch('/api/import', { method: 'POST', body: JSON.stringify(parsed) });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Import failed');
      setBackupMsg(`Restored ${data.imported} record${data.imported === 1 ? '' : 's'}.`);
      setProfile(await apiFetch('/api/profile').then(r => r.json()));
      await loadResumes();
    } catch (err) {
      setBackupErr(err instanceof Error ? err.message : 'That file could not be read.');
    }
    setImporting(false);
  }

  function startResumeEdit() {
    if (!activeResume) return;
    setResumeDraft(activeResume.raw_text || '');
    setNameDraft(activeResume.name);
    setResumeError(''); setResumeEditing(true); setPendingProfileFields(null); setPrefilledFields([]);
  }
  async function addResume() {
    try {
      const created = await apiFetch('/api/resumes', { method: 'POST', body: JSON.stringify({ name: `Resume ${resumes.length + 1}`, raw_text: '' }) }).then(r => r.json()) as Resume;
      setResumes(prev => [...prev, created]);
      setActiveResumeId(created.id); setResumeDraft(''); setNameDraft(created.name);
      setResumeError(''); setPendingProfileFields(null); setPrefilledFields([]); setResumeEditing(true);
    } catch { setResumeError('Could not create resume. Try again.'); }
  }
  async function deleteResume(id: number) {
    try {
      await apiFetch(`/api/resumes/${id}`, { method: 'DELETE' });
      await loadResumes(); setResumeEditing(false);
    } catch { setResumeError('Failed to delete resume. Try again.'); }
  }
  async function setDefaultResume(id: number) {
    try {
      await apiFetch(`/api/resumes/${id}`, { method: 'PUT', body: JSON.stringify({ set_default: true }) });
      await loadResumes(id);
    } catch { setResumeError('Failed to update default. Try again.'); }
  }
  async function saveResume() {
    if (!activeResume) return;
    setResumeSaving(true); setResumeError('');
    try {
      const updated = await apiFetch(`/api/resumes/${activeResume.id}`, { method: 'PUT', body: JSON.stringify({ name: nameDraft.trim() || activeResume.name, raw_text: resumeDraft }) }).then(r => r.json()) as Resume;
      setResumes(prev => prev.map(r => r.id === updated.id ? updated : r));
      if (pendingProfileFields) {
        const merged = { ...profile } as Record<string, string | undefined>;
        let changed = false;
        for (const [key, value] of Object.entries(pendingProfileFields)) {
          if (value?.trim() && !merged[key]?.trim()) { merged[key] = value.trim(); changed = true; }
        }
        if (changed) { const res = await apiFetch('/api/profile', { method: 'PUT', body: JSON.stringify(merged) }); setProfile(await res.json()); }
      }
      setResumeEditing(false); setPendingProfileFields(null); setPrefilledFields([]);
    } catch { setResumeError('Failed to save resume. Try again.'); }
    setResumeSaving(false);
  }
  async function handleResumeFile(file: File | undefined) {
    if (!file) return;
    setResumeError(''); setResumeParsing(true); setResumeFileName(file.name);
    try {
      const { text, profile: parsed } = await extractResumeText(file);
      setResumeDraft(text);
      if (parsed) {
        const labels: Record<keyof ParsedProfile, string> = {
          name: 'Name', email: 'Email', phone: 'Phone', linkedin: 'LinkedIn',
          university: 'University', degree: 'Degree', graduation_date: 'Graduation',
          gpa: 'GPA', honors: 'Honors', minors: 'Minors', target_roles: 'Target roles',
        };
        const filled = Object.entries(parsed)
          .filter(([key, value]) => value?.trim() && !profile[key as keyof ParsedProfile]?.trim())
          .map(([key]) => labels[key as keyof ParsedProfile]);
        setPendingProfileFields(parsed); setPrefilledFields(filled);
      }
    } catch (err) {
      setResumeError(err instanceof Error ? err.message : 'Could not read that file.');
    }
    setResumeParsing(false);
  }

  const startEdit = (field: string, value: string) => { setEditField(field); setEditValue(value || ''); setSaveFieldError(''); };
  const saveField = async () => {
    if (!editField) return;
    setSaving(true); setSaveFieldError('');
    try {
      const updated = { ...profile, [editField]: editValue };
      const res = await apiFetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) });
      setProfile(await res.json()); setEditField(null);
    } catch { setSaveFieldError('Failed to save. Try again.'); }
    setSaving(false);
  };

  async function deleteMemory(id: number) {
    try {
      await apiFetch(`/api/memories/${id}`, { method: 'DELETE' });
      setMemories(prev => prev.filter(m => m.id !== id));
    } catch { /* memory stays in list if delete fails */ }
  }

  const EditableField = ({ field, label, value, multiline = false }: { field: string; label: string; value: string | undefined; multiline?: boolean }) => {
    const isEditing = editField === field;
    return (
      <div style={{ marginBottom: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <span style={fieldLabelStyle}>{label}</span>
          {!isEditing && (
            <button onClick={() => startEdit(field, value || '')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: '0 2px' }}>
              <Edit2 size={12} />
            </button>
          )}
        </div>
        {isEditing ? (
          <div>
            {multiline
              ? <textarea value={editValue} onChange={e => setEditValue(e.target.value)} rows={3} autoFocus className="field-input" style={{ width: '100%', resize: 'vertical' }} />
              : <input type="text" value={editValue} onChange={e => setEditValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveField(); if (e.key === 'Escape') setEditField(null); }} autoFocus className="field-input" style={{ width: '100%' }} />}
            <div style={{ display: 'flex', gap: '8px', marginTop: '7px' }}>
              <button onClick={saveField} disabled={saving} className="btn-primary" style={{ padding: '5px 14px', fontSize: '12px' }}>{saving ? 'Saving…' : 'Save'}</button>
              <button onClick={() => { setEditField(null); setSaveFieldError(''); }} className="btn-ghost" style={{ padding: '5px 12px', fontSize: '12px' }}>Cancel</button>
            </div>
            {saveFieldError && <div style={{ color: 'var(--danger)', fontSize: '11px', marginTop: '5px' }}>{saveFieldError}</div>}
          </div>
        ) : (
          <div style={{ color: 'var(--text)', fontSize: '13px', lineHeight: '1.5' }}>
            {field === 'linkedin' && value
              ? <a href={value.startsWith('http') ? value : `https://${value}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>{value} <ExternalLink size={11} /></a>
              : value || <span style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>Not set</span>}
          </div>
        )}
      </div>
    );
  };

  const card: React.CSSProperties ={ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '18px' };

  if (!profileOpen) return null;

  return (
    <>
      <div className="overlay-backdrop" onClick={closeProfile} />
      <div className="overlay-panel center-modal" style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 'min(760px, 94vw)', maxHeight: '88vh', borderRadius: 'var(--r-lg)', display: 'flex', flexDirection: 'column' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <h1 style={{ color: 'var(--text)', fontSize: '15px', fontWeight: 700, margin: 0 }}>Profile</h1>
          <button onClick={closeProfile} aria-label="Close" style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--r)', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={14} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: '4px', padding: '12px 20px 0', flexShrink: 0 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`nav-item${tab === t.id ? ' active' : ''}`} style={{ fontSize: '12px' }}>{t.label}</button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px 24px' }}>

          {tab === 'resume' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {[
                { title: 'Personal', fields: [{ field: 'name', label: 'Full Name' }, { field: 'email', label: 'Email (optional — used to sign cover letters)' }, { field: 'phone', label: 'Phone (optional)' }, { field: 'linkedin', label: 'LinkedIn (optional — used to sign cover letters)' }] },
                { title: 'Education', fields: [{ field: 'university', label: 'University' }, { field: 'degree', label: 'Degree' }, { field: 'graduation_date', label: 'Graduation' }, { field: 'gpa', label: 'GPA' }, { field: 'minors', label: 'Minors' }, { field: 'honors', label: 'Honors', multiline: true }] },
                { title: 'Targets', fields: [{ field: 'target_roles', label: 'Target Roles', multiline: true }, { field: 'target_cities', label: 'Target Cities', multiline: true }, { field: 'notes', label: 'Notes', multiline: true }] },
              ].map(section => (
                <div key={section.title} style={card}>
                  <h3 className="section-label" style={{ margin: '0 0 14px' }}>{section.title}</h3>
                  {section.fields.map(f => <EditableField key={f.field} field={f.field} label={f.label} value={(profile as Record<string, string | undefined>)[f.field]} multiline={f.multiline} />)}
                </div>
              ))}

              <div style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 className="section-label" style={{ margin: 0 }}>Resumes</h3>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={addResume} title="Add a new resume" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', display: 'flex' }}><Plus size={13} /></button>
                    {!resumeEditing && activeResume && <button onClick={startResumeEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', display: 'flex' }}><Edit2 size={12} /></button>}
                  </div>
                </div>

                {resumes.length > 0 && (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
                    {resumes.map(r => (
                      <button key={r.id} onClick={() => { setActiveResumeId(r.id); setResumeEditing(false); }} className={`chip${r.id === activeResumeId ? ' active' : ''}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        {!!r.is_default && <Check size={10} />}{r.name}
                      </button>
                    ))}
                  </div>
                )}

                {activeResume && resumeEditing ? (
                  <div>
                    <input value={nameDraft} onChange={e => setNameDraft(e.target.value)} placeholder="Resume name" className="field-input" style={{ width: '100%', marginBottom: '8px', fontWeight: 700 }} />
                    <input id="profile-resume-file" type="file" accept=".pdf,.docx,.txt,.jpg,.jpeg,.png,.webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,image/*" style={{ display: 'none' }} onChange={e => handleResumeFile(e.target.files?.[0])} />
                    <label htmlFor="profile-resume-file" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', border: '1px dashed var(--border-hi)', borderRadius: 'var(--r)', padding: '10px', marginBottom: '10px', cursor: resumeParsing ? 'wait' : 'pointer', color: resumeParsing ? 'var(--text-dim)' : 'var(--accent)', fontSize: '12px', fontWeight: 600, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                      {resumeParsing ? `Reading ${resumeFileName}…` : <><FileText size={13} /> Upload resume/CV (PDF, Word, or photo) to replace</>}
                    </label>
                    {prefilledFields.length > 0 && (
                      <div style={{ background: 'var(--success-bg)', border: '1px solid var(--success)', borderRadius: 'var(--r)', padding: '8px 11px', marginBottom: '10px', color: 'var(--success)', fontSize: '11px', lineHeight: 1.5, display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                        <Check size={12} style={{ flexShrink: 0, marginTop: '1px' }} /><span>Will fill in on save: {prefilledFields.join(', ')}</span>
                      </div>
                    )}
                    {resumeError && <div style={{ color: 'var(--danger)', fontSize: '11px', marginBottom: '8px' }}>{resumeError}</div>}
                    <textarea value={resumeDraft} onChange={e => setResumeDraft(e.target.value)} rows={10} autoFocus className="field-input" style={{ width: '100%', resize: 'vertical', fontSize: '12px', lineHeight: 1.6 }} />
                    <div style={{ display: 'flex', gap: '8px', marginTop: '7px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <button onClick={saveResume} disabled={resumeSaving} className="btn-primary" style={{ padding: '5px 14px', fontSize: '12px' }}>{resumeSaving ? 'Saving…' : 'Save'}</button>
                      <button onClick={() => { setResumeEditing(false); setResumeError(''); setPendingProfileFields(null); setPrefilledFields([]); }} className="btn-ghost" style={{ padding: '5px 12px', fontSize: '12px' }}>Cancel</button>
                      {resumes.length > 1 && <button onClick={() => deleteResume(activeResume.id)} style={{ background: 'none', color: 'var(--danger)', border: 'none', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', marginLeft: 'auto' }}>Delete this resume</button>}
                    </div>
                  </div>
                ) : activeResume ? (
                  <div>
                    {!activeResume.is_default && (
                      <button onClick={() => setDefaultResume(activeResume.id)} className="btn-ghost" style={{ marginBottom: '10px', fontSize: '11px', padding: '5px 10px' }}><Check size={11} /> Use this as my default resume</button>
                    )}
                    <div style={{ color: 'var(--text)', fontSize: '12px', lineHeight: '1.65', whiteSpace: 'pre-wrap', maxHeight: '220px', overflowY: 'auto', paddingRight: '4px' }}>
                      {activeResume.raw_text ? activeResume.raw_text : <span style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>Not set — click the edit icon to add one.</span>}
                    </div>
                  </div>
                ) : <p style={{ color: 'var(--text-dim)', fontSize: '12px', fontStyle: 'italic', margin: 0 }}>No resumes yet — click + to add one.</p>}
              </div>

              <div style={card}>
                <h3 className="section-label" style={{ margin: '0 0 6px' }}>Backup &amp; Restore</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '11px', margin: '0 0 14px', lineHeight: 1.5 }}>
                  Your jobs and profile are stored on our server. This backup protects your session ID — the browser key that links you to your account. If you lose it, restore from here to reconnect.
                </p>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button onClick={handleExport} disabled={exporting} className="btn-ghost">
                    {exporting ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={12} />} Export my data
                  </button>
                  <input id="import-backup-file" type="file" accept="application/json" style={{ display: 'none' }} onChange={e => handleImportFile(e.target.files?.[0])} />
                  <label htmlFor="import-backup-file" className="btn-ghost" style={{ cursor: importing ? 'wait' : 'pointer' }}>
                    {importing ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={12} />} Restore from backup
                  </label>
                </div>
                {backupMsg && <div style={{ color: 'var(--success)', fontSize: '11px', marginTop: '10px' }}>{backupMsg}</div>}
                {backupErr && <div style={{ color: 'var(--danger)', fontSize: '11px', marginTop: '10px' }}>{backupErr}</div>}
              </div>

              <div style={card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <Smartphone size={12} color="var(--text-muted)" />
                  <h3 className="section-label" style={{ margin: 0 }}>Connect another device</h3>
                </div>

                <div style={{ display: 'flex', gap: '0', marginBottom: '14px', border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
                  {(['generate', 'redeem'] as const).map(mode => (
                    <button key={mode} onClick={() => { setDeviceCodeMode(mode); setRedeemError(''); setRedeemCode(''); }} style={{
                      flex: 1, padding: '6px', fontSize: '11px', fontWeight: 600, fontFamily: 'inherit',
                      border: 'none', cursor: 'pointer', transition: 'background 0.12s, color 0.12s',
                      background: deviceCodeMode === mode ? 'var(--border-hi)' : 'transparent',
                      color: deviceCodeMode === mode ? 'var(--text)' : 'var(--text-dim)',
                    }}>
                      {mode === 'generate' ? 'Get a code' : 'Enter a code'}
                    </button>
                  ))}
                </div>

                {deviceCodeMode === 'generate' ? (
                  <>
                    <p style={{ color: 'var(--text-muted)', fontSize: '11px', margin: '0 0 12px', lineHeight: 1.5 }}>
                      Generate a code on this device, then enter it on your other device. Your API key is temporarily stored server-side for up to 10 minutes to complete the transfer, then automatically deleted.
                    </p>
                    {deviceCode && deviceCodeSecondsLeft > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: 'var(--bg)', border: '1px solid var(--border-hi)',
                          borderRadius: 'var(--r)', padding: '14px',
                          fontSize: '28px', fontWeight: 700, letterSpacing: '0.18em', color: 'var(--accent)',
                        }}>
                          {deviceCode.slice(0, 3)}-{deviceCode.slice(3)}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: 'var(--text-dim)', fontSize: '11px' }}>
                            Expires in {Math.floor(deviceCodeSecondsLeft / 60)}:{String(deviceCodeSecondsLeft % 60).padStart(2, '0')}
                          </span>
                          <button onClick={generateDeviceCode} disabled={deviceCodeLoading} className="btn-ghost" style={{ fontSize: '11px', padding: '4px 10px' }}>
                            New code
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={generateDeviceCode} disabled={deviceCodeLoading} className="btn-ghost">
                        {deviceCodeLoading ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Smartphone size={12} />}
                        Get sync code
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <p style={{ color: 'var(--text-muted)', fontSize: '11px', margin: '0 0 12px', lineHeight: 1.5 }}>
                      Enter the code from your other device. This will switch this device to that account.
                    </p>
                    <input
                      value={redeemCode}
                      onChange={e => { setRedeemCode(e.target.value); setRedeemError(''); }}
                      placeholder="000-000"
                      maxLength={7}
                      style={{
                        width: '100%', background: 'var(--bg)', border: '1px solid var(--border)',
                        borderRadius: 'var(--r)', padding: '10px', color: 'var(--accent)',
                        fontSize: '22px', fontWeight: 700, letterSpacing: '0.12em', textAlign: 'center',
                        outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: '10px',
                      }}
                      onKeyDown={e => { if (e.key === 'Enter') handleRedeemCode(); }}
                    />
                    {redeemError && <div style={{ color: 'var(--danger)', fontSize: '11px', marginBottom: '10px' }}>{redeemError}</div>}
                    <button onClick={handleRedeemCode} disabled={redeemLoading} className="btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                      {redeemLoading ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                      {redeemLoading ? 'Connecting…' : 'Connect'}
                    </button>
                  </>
                )}
              </div>

              <button
                onClick={() => { closeProfile(); openTutorial(); }}
                className="btn-ghost"
                style={{ alignSelf: 'flex-start', fontSize: '12px', gap: '6px' }}
              >
                <BookOpen size={12} /> Replay tutorial
              </button>
            </div>
          )}

          {tab === 'usage' && (
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <Activity size={12} color="var(--text-muted)" />
                <h3 className="section-label" style={{ margin: 0 }}>AI Usage</h3>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '11px', margin: '0 0 14px', lineHeight: 1.5 }}>
                AI calls made for this account.
              </p>
              {loadingUsage ? (
                <div style={{ textAlign: 'center', padding: '20px' }}><Loader size={16} color="var(--accent)" style={{ animation: 'spin 1s linear infinite' }} /></div>
              ) : !usage || usage.total_calls === 0 ? (
                <p style={{ color: 'var(--text-dim)', fontSize: '12px', fontStyle: 'italic', margin: 0 }}>No AI calls logged yet.</p>
              ) : (
                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--text)', fontSize: '26px', fontWeight: 800 }}>{usage.total_calls}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                      call{usage.total_calls === 1 ? '' : 's'}
                      {usage.since ? ` since ${new Date(usage.since.replace(' ', 'T') + 'Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
                    </span>
                  </div>
                  <div style={{ color: 'var(--text-dim)', fontSize: '11px', marginBottom: '14px' }}>
                    {fmtTokens(usage.total_input_tokens + usage.total_output_tokens)} tokens
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', marginTop: '14px' }}>
                    {usage.by_route.slice(0, 8).map(r => {
                      const pct = usage.total_calls > 0 ? (r.calls / usage.total_calls) * 100 : 0;
                      return (
                        <div key={r.route}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                            <div>
                              <span style={{ color: 'var(--text)' }}>{ROUTE_LABELS[r.route] || r.route}</span>
                              {ROUTE_DESCRIPTIONS[r.route] && (
                                <div style={{ color: 'var(--text-dim)', fontSize: '10px', marginTop: '1px' }}>{ROUTE_DESCRIPTIONS[r.route]}</div>
                              )}
                            </div>
                            <span style={{ color: 'var(--text-muted)', flexShrink: 0, marginLeft: '8px' }}>{r.calls} call{r.calls === 1 ? '' : 's'}</span>
                          </div>
                          <div style={{ height: '4px', borderRadius: '2px', background: 'var(--surface-2)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.max(pct, 2)}%`, background: 'var(--accent)', borderRadius: '2px' }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'memory' && (
            <div>
              <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: '0 0 14px', maxWidth: '480px' }}>
                Facts the AI has picked up from Coach conversations — browse what it's learned and remove anything wrong or outdated.{memories.length > 0 && ` ${memories.length} saved.`}
              </p>

              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
                <button onClick={() => setMemFilter('all')} className={`chip${memFilter === 'all' ? ' active' : ''}`}>All {memories.length}</button>
                {MEMORY_CATEGORIES.filter(c => memories.some(m => m.category === c)).map(c => (
                  <button key={c} onClick={() => setMemFilter(c)} className={`chip${memFilter === c ? ' active' : ''}`} style={{ textTransform: 'capitalize' }}>
                    {c} {memories.filter(m => m.category === c).length}
                  </button>
                ))}
              </div>

              {memLoading ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '30px 0' }}>Loading…</div>
              ) : (memFilter === 'all' ? memories : memories.filter(m => m.category === memFilter)).length === 0 ? (
                <div style={{ ...card, padding: '40px 24px', textAlign: 'center' }}>
                  <Brain size={22} color="var(--border-hi)" style={{ margin: '0 auto 12px', display: 'block' }} />
                  <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '6px' }}>No memories yet.</div>
                  <div style={{ color: 'var(--text-dim)', fontSize: '12px' }}>Chat with the Coach — memories are extracted automatically.</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {(memFilter === 'all' ? memories : memories.filter(m => m.category === memFilter)).map(m => (
                    <div key={m.id} style={{ ...card, padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                      <span style={{ flexShrink: 0, fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: 'var(--r-sm)', textTransform: 'capitalize', marginTop: '1px', background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>{m.category}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: 'var(--text)', fontSize: '13px', lineHeight: 1.55 }}>{m.content}</div>
                        <div style={{ color: 'var(--text-dim)', fontSize: '11px', marginTop: '5px' }}>{m.source === 'manual' ? 'Added manually' : 'From Coach'} · {timeAgo(m.created_at)}</div>
                      </div>
                      <button onClick={() => deleteMemory(m.id)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '2px', flexShrink: 0, display: 'flex' }}><Trash2 size={13} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
