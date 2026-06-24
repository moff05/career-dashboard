'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/apiFetch';
import { extractResumeText, type ParsedProfile } from '@/lib/resumeExtract';
import { Edit2, ExternalLink, RefreshCw, Loader, FileText, Check, Download, Upload, Plus, DollarSign } from 'lucide-react';

interface Profile {
  id?: number; name?: string; email?: string; phone?: string; linkedin?: string;
  university?: string; degree?: string; graduation_date?: string; gpa?: string;
  honors?: string; minors?: string; target_roles?: string; target_cities?: string; notes?: string;
}

interface ScoreCategory { score: number; max: number; rationale: string; }
interface Summary {
  strengths: string[]; gaps: string[]; readiness_score: number; summary: string;
  score_breakdown: Record<string, ScoreCategory>;
}

const CATEGORY_LABELS: Record<string, string> = {
  relevant_experience: 'Relevant Experience', quantified_impact: 'Quantified Impact',
  technical_depth: 'Technical Depth', academic_credibility: 'Academic Credibility',
  differentiation: 'Differentiation',
};
interface Resume { id: number; name: string; raw_text: string | null; parsed_at: string | null; is_default: number; }
interface UsageByRoute { route: string; calls: number; input_tokens: number; output_tokens: number; web_search_requests: number; cost_usd: number; }
interface Usage {
  total_calls: number; total_input_tokens: number; total_output_tokens: number;
  total_web_search_requests: number; total_cost_usd: number; since: string | null;
  by_route: UsageByRoute[];
}

const ROUTE_LABELS: Record<string, string> = {
  coach_chat: 'Coach Chat', memory_extraction: 'Memory Extraction', weekly_brief: 'Weekly Brief',
  company_research: 'Company Research', hunt_agent: 'Job Hunt Agent', mock_interview: 'Mock Interview',
  fit_scorecard: 'Fit Scorecard', resume_bullets: 'Resume Bullets', cover_letter: 'Cover Letter',
  job_details: 'Job Details', fit_gaps: 'Fit Gaps', job_import: 'Job Import',
  resume_extract: 'Resume Parsing', profile_summary: 'Profile Summary', strategy_advisor: 'Strategy Advisor',
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile>({});
  const [editField, setEditField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [saving, setSaving] = useState(false);

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

  async function loadResumes(selectId?: number) {
    const data = await apiFetch('/api/resumes').then(r => r.json()) as Resume[];
    setResumes(data);
    const fallback = data.find(r => r.is_default) || data[0];
    setActiveResumeId(selectId ?? fallback?.id ?? null);
  }

  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [backupMsg, setBackupMsg] = useState('');
  const [backupErr, setBackupErr] = useState('');

  const [usage, setUsage] = useState<Usage | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(true);

  useEffect(() => {
    apiFetch('/api/profile').then(r => r.json()).then(data => setProfile(data));
    loadResumes();
    apiFetch('/api/usage').then(r => r.json()).then(data => setUsage(data)).finally(() => setLoadingUsage(false));
  }, []);

  async function handleExport() {
    setExporting(true);
    setBackupErr('');
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
    } catch {
      setBackupErr('Export failed. Try again.');
    }
    setExporting(false);
  }

  async function handleImportFile(file: File | undefined) {
    if (!file) return;
    setImporting(true);
    setBackupErr('');
    setBackupMsg('');
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = await apiFetch('/api/import', { method: 'POST', body: JSON.stringify(parsed) });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Import failed');
      setBackupMsg(`Restored ${data.imported} record${data.imported === 1 ? '' : 's'}.`);
      const profileRes = await apiFetch('/api/profile').then(r => r.json());
      setProfile(profileRes);
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
    setResumeError('');
    setResumeEditing(true);
    setPendingProfileFields(null);
    setPrefilledFields([]);
  }

  async function addResume() {
    const created = await apiFetch('/api/resumes', {
      method: 'POST', body: JSON.stringify({ name: `Resume ${resumes.length + 1}`, raw_text: '' }),
    }).then(r => r.json()) as Resume;
    setResumes(prev => [...prev, created]);
    setActiveResumeId(created.id);
    setResumeDraft('');
    setNameDraft(created.name);
    setResumeError('');
    setPendingProfileFields(null);
    setPrefilledFields([]);
    setResumeEditing(true);
  }

  async function deleteResume(id: number) {
    await apiFetch(`/api/resumes/${id}`, { method: 'DELETE' });
    await loadResumes();
    setResumeEditing(false);
  }

  async function setDefaultResume(id: number) {
    await apiFetch(`/api/resumes/${id}`, { method: 'PUT', body: JSON.stringify({ set_default: true }) });
    await loadResumes(id);
  }

  async function saveResume() {
    if (!activeResume) return;
    setResumeSaving(true);
    const updated = await apiFetch(`/api/resumes/${activeResume.id}`, {
      method: 'PUT', body: JSON.stringify({ name: nameDraft.trim() || activeResume.name, raw_text: resumeDraft }),
    }).then(r => r.json()) as Resume;
    setResumes(prev => prev.map(r => r.id === updated.id ? updated : r));

    // Fill in any profile fields the resume parse found that are still empty —
    // existing values are left alone; edit them on the left if they're wrong.
    if (pendingProfileFields) {
      const merged = { ...profile } as Record<string, string | undefined>;
      let changed = false;
      for (const [key, value] of Object.entries(pendingProfileFields)) {
        if (value?.trim() && !merged[key]?.trim()) { merged[key] = value.trim(); changed = true; }
      }
      if (changed) {
        const res = await apiFetch('/api/profile', { method: 'PUT', body: JSON.stringify(merged) });
        setProfile(await res.json());
      }
    }

    setResumeEditing(false);
    setResumeSaving(false);
    setPendingProfileFields(null);
    setPrefilledFields([]);
  }

  async function handleResumeFile(file: File | undefined) {
    if (!file) return;
    setResumeError('');
    setResumeParsing(true);
    setResumeFileName(file.name);
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
        setPendingProfileFields(parsed);
        setPrefilledFields(filled);
      }
    } catch (err) {
      setResumeError(err instanceof Error ? err.message : 'Could not read that file.');
    }
    setResumeParsing(false);
  }

  const startEdit = (field: string, value: string) => { setEditField(field); setEditValue(value || ''); };

  const saveField = async () => {
    if (!editField) return;
    setSaving(true);
    const updated = { ...profile, [editField]: editValue };
    const res = await apiFetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) });
    const data = await res.json();
    setProfile(data);
    setEditField(null);
    setSaving(false);
  };

  const generateSummary = async () => {
    setLoadingSummary(true);
    try {
      const res = await apiFetch('/api/profile/summary', { method: 'POST' });
      setSummary(await res.json());
    } catch { setSummary(null); }
    setLoadingSummary(false);
  };

  const inputStyle = {
    width: '100%', background: 'rgba(125,220,255,0.025)', border: '1px solid rgba(59,130,246,0.3)',
    borderRadius: '10px', padding: '8px 12px', color: 'rgba(232,244,255,0.95)',
    fontSize: '13px', outline: 'none', fontFamily: 'inherit',
  };

  const EditableField = ({ field, label, value, multiline = false }: { field: string; label: string; value: string | undefined; multiline?: boolean; }) => {
    const isEditing = editField === field;
    return (
      <div style={{ marginBottom: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <span style={{ color: 'rgba(158,202,242,0.72)', fontSize: '10px', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{label}</span>
          {!isEditing && (
            <button onClick={() => startEdit(field, value || '')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(125,175,230,0.35)', padding: '0 2px' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#3b82f6')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(125,175,230,0.35)')}>
              <Edit2 size={12} />
            </button>
          )}
        </div>
        {isEditing ? (
          <div>
            {multiline
              ? <textarea value={editValue} onChange={e => setEditValue(e.target.value)} rows={3} autoFocus style={{ ...inputStyle, resize: 'vertical' }} />
              : <input type="text" value={editValue} onChange={e => setEditValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveField(); if (e.key === 'Escape') setEditField(null); }} autoFocus style={inputStyle} />
            }
            <div style={{ display: 'flex', gap: '8px', marginTop: '7px' }}>
              <button onClick={saveField} disabled={saving} style={{
                background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', color: '#fff', border: 'none',
                borderRadius: '8px', padding: '5px 14px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
              }}>{saving ? 'Saving…' : 'Save'}</button>
              <button onClick={() => setEditField(null)} style={{
                background: 'rgba(125,220,255,0.025)', color: 'rgba(158,202,242,0.72)', border: '1px solid rgba(125,220,255,0.13)',
                borderRadius: '8px', padding: '5px 12px', fontSize: '12px', cursor: 'pointer',
              }}>Cancel</button>
            </div>
          </div>
        ) : (
          <div style={{ color: 'rgba(200,228,255,0.85)', fontSize: '13px', lineHeight: '1.5' }}>
            {field === 'linkedin' && value
              ? <a href={value.startsWith('http') ? value : `https://${value}`} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>{value} <ExternalLink size={11} /></a>
              : value || <span style={{ color: 'rgba(125,175,230,0.35)', fontStyle: 'italic' }}>Not set</span>
            }
          </div>
        )}
      </div>
    );
  };

  const readinessColor = (s: number) => s >= 8 ? '#059669' : s >= 6 ? '#3b82f6' : '#dc2626';

  const cardStyle = { background: 'rgba(125,220,255,0.055)', backdropFilter: 'blur(20px)', border: '1px solid rgba(125,220,255,0.13)', borderRadius: '14px', padding: '20px' };

  return (
    <div style={{ padding: '32px 36px', minHeight: '100vh', background: 'transparent' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ color: 'rgba(232,244,255,0.95)', fontSize: '20px', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>My Profile</h1>
        <p style={{ color: 'rgba(135,185,230,0.65)', fontSize: '12px', margin: '4px 0 0' }}>Resume info and candidate positioning</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {[
            { title: 'Personal', fields: [{ field: 'name', label: 'Full Name' }, { field: 'email', label: 'Email' }, { field: 'phone', label: 'Phone' }, { field: 'linkedin', label: 'LinkedIn' }] },
            { title: 'Education', fields: [{ field: 'university', label: 'University' }, { field: 'degree', label: 'Degree' }, { field: 'graduation_date', label: 'Graduation' }, { field: 'gpa', label: 'GPA' }, { field: 'minors', label: 'Minors' }, { field: 'honors', label: 'Honors', multiline: true }] },
            { title: 'Targets', fields: [{ field: 'target_roles', label: 'Target Roles', multiline: true }, { field: 'target_cities', label: 'Target Cities', multiline: true }, { field: 'notes', label: 'Notes', multiline: true }] },
          ].map(section => (
            <div key={section.title} style={cardStyle}>
              <h3 style={{ color: 'rgba(158,202,242,0.72)', fontSize: '10px', fontWeight: 700, margin: '0 0 16px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{section.title}</h3>
              {section.fields.map(f => <EditableField key={f.field} field={f.field} label={f.label} value={(profile as Record<string, string | undefined>)[f.field]} multiline={f.multiline} />)}
            </div>
          ))}

          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ color: 'rgba(158,202,242,0.72)', fontSize: '10px', fontWeight: 700, margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Resumes</h3>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button onClick={addResume} title="Add a new resume" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(125,175,230,0.35)', padding: '0 2px', display: 'flex' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#3b82f6')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'rgba(125,175,230,0.35)')}>
                  <Plus size={13} />
                </button>
                {!resumeEditing && activeResume && (
                  <button onClick={startResumeEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(125,175,230,0.35)', padding: '0 2px', display: 'flex' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#3b82f6')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'rgba(125,175,230,0.35)')}>
                    <Edit2 size={12} />
                  </button>
                )}
              </div>
            </div>

            {resumes.length > 0 && (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
                {resumes.map(r => (
                  <button key={r.id} onClick={() => { setActiveResumeId(r.id); setResumeEditing(false); }} style={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                    background: r.id === activeResumeId ? 'rgba(59,130,246,0.12)' : 'rgba(125,220,255,0.025)',
                    color: r.id === activeResumeId ? '#3b82f6' : 'rgba(158,202,242,0.72)',
                    border: `1px solid ${r.id === activeResumeId ? 'rgba(59,130,246,0.3)' : 'rgba(125,220,255,0.13)'}`,
                    borderRadius: '20px', padding: '4px 10px', fontSize: '11px', fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    {!!r.is_default && <Check size={10} />}
                    {r.name}
                  </button>
                ))}
              </div>
            )}

            {activeResume && resumeEditing ? (
              <div>
                <input value={nameDraft} onChange={e => setNameDraft(e.target.value)}
                  placeholder="Resume name" style={{ ...inputStyle, marginBottom: '8px', fontWeight: 600 }} />
                <input id="profile-resume-file" type="file"
                  accept=".pdf,.docx,.txt,.jpg,.jpeg,.png,.webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,image/*"
                  style={{ display: 'none' }} onChange={e => handleResumeFile(e.target.files?.[0])} />
                <label htmlFor="profile-resume-file" style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  border: '1px dashed rgba(125,220,255,0.30)', borderRadius: '8px',
                  padding: '10px', marginBottom: '10px', cursor: resumeParsing ? 'wait' : 'pointer',
                  color: resumeParsing ? 'rgba(158,202,242,0.50)' : 'rgba(125,244,252,0.85)', fontSize: '12px', fontWeight: 600,
                  overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                }}>
                  {resumeParsing ? `Reading ${resumeFileName}…` : <><FileText size={13} /> Upload resume/CV (PDF, Word, or photo) to replace</>}
                </label>
                {prefilledFields.length > 0 && (
                  <div style={{
                    background: 'rgba(52,211,153,0.07)', border: '1px solid rgba(52,211,153,0.22)',
                    borderRadius: '8px', padding: '8px 11px', marginBottom: '10px',
                    color: 'rgba(167,243,208,0.90)', fontSize: '11px', lineHeight: 1.5,
                    display: 'flex', alignItems: 'flex-start', gap: '6px',
                  }}>
                    <Check size={12} style={{ flexShrink: 0, marginTop: '1px' }} />
                    <span>Will fill in on save: {prefilledFields.join(', ')}</span>
                  </div>
                )}
                {resumeError && <div style={{ color: 'rgba(252,150,150,0.90)', fontSize: '11px', marginBottom: '8px' }}>{resumeError}</div>}
                <textarea value={resumeDraft} onChange={e => setResumeDraft(e.target.value)} rows={10} autoFocus
                  style={{ ...inputStyle, resize: 'vertical', fontSize: '12px', lineHeight: 1.6 }} />
                <div style={{ display: 'flex', gap: '8px', marginTop: '7px', flexWrap: 'wrap' }}>
                  <button onClick={saveResume} disabled={resumeSaving} style={{
                    background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', color: '#fff', border: 'none',
                    borderRadius: '8px', padding: '5px 14px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                  }}>{resumeSaving ? 'Saving…' : 'Save'}</button>
                  <button onClick={() => { setResumeEditing(false); setResumeError(''); setPendingProfileFields(null); setPrefilledFields([]); }} style={{
                    background: 'rgba(125,220,255,0.025)', color: 'rgba(158,202,242,0.72)', border: '1px solid rgba(125,220,255,0.13)',
                    borderRadius: '8px', padding: '5px 12px', fontSize: '12px', cursor: 'pointer',
                  }}>Cancel</button>
                  {resumes.length > 1 && (
                    <button onClick={() => deleteResume(activeResume.id)} style={{
                      background: 'none', color: 'rgba(252,150,150,0.70)', border: 'none',
                      padding: '5px 8px', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', marginLeft: 'auto',
                    }}>Delete this resume</button>
                  )}
                </div>
              </div>
            ) : activeResume ? (
              <div>
                {!activeResume.is_default && (
                  <button onClick={() => setDefaultResume(activeResume.id)} style={{
                    display: 'inline-flex', alignItems: 'center', gap: '5px', marginBottom: '10px',
                    background: 'rgba(125,220,255,0.025)', color: 'rgba(158,202,242,0.72)', border: '1px solid rgba(125,220,255,0.13)',
                    borderRadius: '8px', padding: '5px 10px', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit',
                  }}><Check size={11} /> Use this as my default resume</button>
                )}
                <div style={{
                  color: 'rgba(210,234,255,0.90)', fontSize: '12px', lineHeight: '1.65', whiteSpace: 'pre-wrap',
                  maxHeight: '260px', overflowY: 'auto', paddingRight: '4px',
                }}>
                  {activeResume.raw_text
                    ? activeResume.raw_text
                    : <span style={{ color: 'rgba(135,185,230,0.55)', fontStyle: 'italic' }}>Not set — click the edit icon to add one.</span>}
                </div>
              </div>
            ) : (
              <p style={{ color: 'rgba(135,185,230,0.55)', fontSize: '12px', fontStyle: 'italic', margin: 0 }}>No resumes yet — click + to add one.</p>
            )}
          </div>

          <div style={cardStyle}>
            <h3 style={{ color: 'rgba(158,202,242,0.72)', fontSize: '10px', fontWeight: 700, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Backup &amp; Restore</h3>
            <p style={{ color: 'rgba(135,185,230,0.65)', fontSize: '11px', margin: '0 0 14px', lineHeight: 1.5 }}>
              There are no accounts here — your data lives only in this browser. If you clear your browser data or switch devices, it&apos;s gone unless you&apos;ve backed it up.
            </p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button onClick={handleExport} disabled={exporting} style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                background: 'rgba(125,220,255,0.025)', color: 'rgba(158,202,242,0.85)', border: '1px solid rgba(125,220,255,0.13)',
                borderRadius: '8px', padding: '7px 14px', fontSize: '12px', fontWeight: 600,
                cursor: exporting ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              }}>
                {exporting ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={12} />}
                Export my data
              </button>
              <input id="import-backup-file" type="file" accept="application/json"
                style={{ display: 'none' }} onChange={e => handleImportFile(e.target.files?.[0])} />
              <label htmlFor="import-backup-file" style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                background: 'rgba(125,220,255,0.025)', color: 'rgba(158,202,242,0.85)', border: '1px solid rgba(125,220,255,0.13)',
                borderRadius: '8px', padding: '7px 14px', fontSize: '12px', fontWeight: 600,
                cursor: importing ? 'wait' : 'pointer', fontFamily: 'inherit',
              }}>
                {importing ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={12} />}
                Restore from backup
              </label>
            </div>
            {backupMsg && <div style={{ color: 'rgba(167,243,208,0.90)', fontSize: '11px', marginTop: '10px' }}>{backupMsg}</div>}
            {backupErr && <div style={{ color: 'rgba(252,150,150,0.90)', fontSize: '11px', marginTop: '10px' }}>{backupErr}</div>}
          </div>

          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <DollarSign size={12} color="rgba(158,202,242,0.72)" />
              <h3 style={{ color: 'rgba(158,202,242,0.72)', fontSize: '10px', fontWeight: 700, margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Usage &amp; Cost</h3>
            </div>
            <p style={{ color: 'rgba(135,185,230,0.65)', fontSize: '11px', margin: '0 0 14px', lineHeight: 1.5 }}>
              What your Anthropic API key has spent on this dashboard. Estimated from token counts and current published pricing — your Anthropic invoice is authoritative.
            </p>
            {loadingUsage ? (
              <div style={{ textAlign: 'center', padding: '20px' }}>
                <Loader size={16} color="#3b82f6" style={{ animation: 'spin 1s linear infinite' }} />
              </div>
            ) : !usage || usage.total_calls === 0 ? (
              <p style={{ color: 'rgba(135,185,230,0.55)', fontSize: '12px', fontStyle: 'italic', margin: 0 }}>No AI calls logged yet.</p>
            ) : (
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ color: 'rgba(232,244,255,0.95)', fontSize: '26px', fontWeight: 800 }}>${usage.total_cost_usd.toFixed(2)}</span>
                  <span style={{ color: 'rgba(135,185,230,0.65)', fontSize: '11px' }}>
                    {usage.total_calls} call{usage.total_calls === 1 ? '' : 's'}
                    {usage.since ? ` since ${new Date(usage.since.replace(' ', 'T') + 'Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
                  </span>
                </div>
                {usage.total_web_search_requests > 0 && (
                  <div style={{ color: 'rgba(135,185,230,0.65)', fontSize: '11px', marginBottom: '14px' }}>
                    {usage.total_web_search_requests} web search{usage.total_web_search_requests === 1 ? '' : 'es'} included
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', marginTop: '14px' }}>
                  {usage.by_route.slice(0, 8).map(r => {
                    const pct = usage.total_cost_usd > 0 ? (r.cost_usd / usage.total_cost_usd) * 100 : 0;
                    return (
                      <div key={r.route}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                          <span style={{ color: 'rgba(200,228,255,0.85)' }}>{ROUTE_LABELS[r.route] || r.route}</span>
                          <span style={{ color: 'rgba(158,202,242,0.72)' }}>${r.cost_usd.toFixed(3)}</span>
                        </div>
                        <div style={{ height: '4px', borderRadius: '2px', background: 'rgba(125,220,255,0.08)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${Math.max(pct, 2)}%`, background: 'linear-gradient(90deg, #4A9EF8, #7DF4FC)', borderRadius: '2px' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ color: 'rgba(232,244,255,0.95)', fontSize: '14px', fontWeight: 700, margin: 0 }}>Candidate Strength</h3>
            <button onClick={generateSummary} disabled={loadingSummary} style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              background: 'rgba(125,220,255,0.025)', border: '1px solid rgba(125,220,255,0.13)', borderRadius: '10px',
              padding: '6px 14px', color: 'rgba(158,202,242,0.72)', fontSize: '12px',
              cursor: loadingSummary ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            }}>
              {loadingSummary ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={12} />}
              {loadingSummary ? 'Generating…' : 'Generate'}
            </button>
          </div>

          {!summary && !loadingSummary && (
            <div style={{ textAlign: 'center', padding: '48px 24px' }}>
              <p style={{ color: 'rgba(135,185,230,0.65)', fontSize: '13px', margin: '0 0 8px' }}>Click &quot;Generate&quot; for an AI assessment of your candidacy.</p>
              <p style={{ color: 'rgba(125,175,230,0.35)', fontSize: '12px', margin: 0 }}>Analyzes your resume, experiences, and saved context.</p>
            </div>
          )}

          {loadingSummary && (
            <div style={{ textAlign: 'center', padding: '48px' }}>
              <Loader size={24} color="#3b82f6" style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px', display: 'block' }} />
              <p style={{ color: 'rgba(158,202,242,0.72)', fontSize: '13px', margin: 0 }}>Analyzing your background…</p>
            </div>
          )}

          {summary && !loadingSummary && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px', padding: '14px 16px', background: 'rgba(125,220,255,0.025)', borderRadius: '12px', border: '1px solid rgba(125,220,255,0.06)' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '32px', fontWeight: 800, color: readinessColor(summary.readiness_score), lineHeight: 1 }}>{summary.readiness_score}</div>
                  <div style={{ color: 'rgba(135,185,230,0.65)', fontSize: '10px', marginTop: '3px' }}>/10</div>
                </div>
                <div>
                  <div style={{ color: 'rgba(232,244,255,0.95)', fontWeight: 700, fontSize: '13px' }}>Readiness Score</div>
                  <div style={{ color: 'rgba(158,202,242,0.72)', fontSize: '12px', marginTop: '3px' }}>For internship &amp; entry-level roles</div>
                </div>
              </div>
              <p style={{ color: 'rgba(200,228,255,0.85)', fontSize: '13px', lineHeight: '1.65', margin: '0 0 16px' }}>{summary.summary}</p>

              {summary.score_breakdown && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                  {Object.entries(summary.score_breakdown).map(([key, cat]) => {
                    const pct = cat.max > 0 ? (cat.score / cat.max) * 100 : 0;
                    return (
                      <div key={key}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                          <span style={{ color: 'rgba(200,228,255,0.85)', fontWeight: 600 }}>{CATEGORY_LABELS[key] || key}</span>
                          <span style={{ color: 'rgba(158,202,242,0.72)' }}>{cat.score}/{cat.max}</span>
                        </div>
                        <div style={{ height: '4px', borderRadius: '2px', background: 'rgba(125,220,255,0.08)', overflow: 'hidden', marginBottom: '4px' }}>
                          <div style={{ height: '100%', width: `${Math.max(pct, 2)}%`, background: 'linear-gradient(90deg, #4A9EF8, #7DF4FC)', borderRadius: '2px' }} />
                        </div>
                        {cat.rationale && <div style={{ color: 'rgba(158,202,242,0.60)', fontSize: '11px', lineHeight: 1.5 }}>{cat.rationale}</div>}
                      </div>
                    );
                  })}
                </div>
              )}

              <div style={{ marginBottom: '14px' }}>
                <h4 style={{ color: '#059669', fontSize: '11px', fontWeight: 700, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Strengths</h4>
                <ul style={{ margin: 0, paddingLeft: '16px' }}>
                  {summary.strengths.map((s, i) => <li key={i} style={{ color: 'rgba(200,228,255,0.85)', fontSize: '13px', marginBottom: '5px' }}>{s}</li>)}
                </ul>
              </div>
              <div>
                <h4 style={{ color: '#3b82f6', fontSize: '11px', fontWeight: 700, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Areas to Develop</h4>
                <ul style={{ margin: 0, paddingLeft: '16px' }}>
                  {summary.gaps.map((g, i) => <li key={i} style={{ color: 'rgba(200,228,255,0.85)', fontSize: '13px', marginBottom: '5px' }}>{g}</li>)}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
