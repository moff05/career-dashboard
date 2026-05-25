'use client';

import { useState, useEffect } from 'react';
import { Edit2, ExternalLink, RefreshCw, Loader } from 'lucide-react';

interface Profile {
  id?: number; name?: string; email?: string; phone?: string; linkedin?: string;
  university?: string; degree?: string; graduation_date?: string; gpa?: string;
  honors?: string; minors?: string; target_roles?: string; target_cities?: string; notes?: string;
}

interface Summary { strengths: string[]; gaps: string[]; readiness_score: number; summary: string; }

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile>({});
  const [editField, setEditField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/profile').then(r => r.json()).then(data => setProfile(data));
  }, []);

  const startEdit = (field: string, value: string) => { setEditField(field); setEditValue(value || ''); };

  const saveField = async () => {
    if (!editField) return;
    setSaving(true);
    const updated = { ...profile, [editField]: editValue };
    const res = await fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) });
    const data = await res.json();
    setProfile(data);
    setEditField(null);
    setSaving(false);
  };

  const generateSummary = async () => {
    setLoadingSummary(true);
    try {
      const res = await fetch('/api/profile/summary', { method: 'POST' });
      setSummary(await res.json());
    } catch { setSummary(null); }
    setLoadingSummary(false);
  };

  const inputStyle = {
    width: '100%', backgroundColor: '#0d1117', border: '1px solid rgba(245,158,11,0.4)',
    borderRadius: '10px', padding: '8px 12px', color: '#e2e8f4',
    fontSize: '13px', outline: 'none', fontFamily: 'inherit',
  };

  const EditableField = ({ field, label, value, multiline = false }: { field: string; label: string; value: string | undefined; multiline?: boolean; }) => {
    const isEditing = editField === field;
    return (
      <div style={{ marginBottom: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <span style={{ color: '#4a5d75', fontSize: '10px', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{label}</span>
          {!isEditing && (
            <button onClick={() => startEdit(field, value || '')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2d3f58', padding: '0 2px' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#7a8fa8')}
              onMouseLeave={e => (e.currentTarget.style.color = '#2d3f58')}>
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
                background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#000', border: 'none',
                borderRadius: '8px', padding: '5px 14px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
              }}>{saving ? 'Saving…' : 'Save'}</button>
              <button onClick={() => setEditField(null)} style={{
                backgroundColor: '#151e2e', color: '#7a8fa8', border: '1px solid #1e2839',
                borderRadius: '8px', padding: '5px 12px', fontSize: '12px', cursor: 'pointer',
              }}>Cancel</button>
            </div>
          </div>
        ) : (
          <div style={{ color: '#c8d5e8', fontSize: '13px', lineHeight: '1.5' }}>
            {field === 'linkedin' && value
              ? <a href={value.startsWith('http') ? value : `https://${value}`} target="_blank" rel="noopener noreferrer" style={{ color: '#f59e0b', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>{value} <ExternalLink size={11} /></a>
              : value || <span style={{ color: '#2d3f58', fontStyle: 'italic' }}>Not set</span>
            }
          </div>
        )}
      </div>
    );
  };

  const readinessColor = (s: number) => s >= 8 ? '#34d399' : s >= 6 ? '#f59e0b' : '#f87171';

  const cardStyle = { backgroundColor: '#111827', border: '1px solid #1e2839', borderRadius: '16px', padding: '20px' };

  return (
    <div style={{ padding: '32px 36px', minHeight: '100vh', backgroundColor: '#0d1117' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ color: '#e2e8f4', fontSize: '20px', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>My Profile</h1>
        <p style={{ color: '#3d5068', fontSize: '12px', margin: '4px 0 0' }}>Resume info and candidate positioning</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {[
            { title: 'Personal', fields: [{ field: 'name', label: 'Full Name' }, { field: 'email', label: 'Email' }, { field: 'phone', label: 'Phone' }, { field: 'linkedin', label: 'LinkedIn' }] },
            { title: 'Education', fields: [{ field: 'university', label: 'University' }, { field: 'degree', label: 'Degree' }, { field: 'graduation_date', label: 'Graduation' }, { field: 'gpa', label: 'GPA' }, { field: 'minors', label: 'Minors' }, { field: 'honors', label: 'Honors', multiline: true }] },
            { title: 'Targets', fields: [{ field: 'target_roles', label: 'Target Roles', multiline: true }, { field: 'target_cities', label: 'Target Cities', multiline: true }, { field: 'notes', label: 'Notes', multiline: true }] },
          ].map(section => (
            <div key={section.title} style={cardStyle}>
              <h3 style={{ color: '#4a5d75', fontSize: '10px', fontWeight: 700, margin: '0 0 16px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{section.title}</h3>
              {section.fields.map(f => <EditableField key={f.field} field={f.field} label={f.label} value={(profile as Record<string, string | undefined>)[f.field]} multiline={f.multiline} />)}
            </div>
          ))}
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ color: '#e2e8f4', fontSize: '14px', fontWeight: 700, margin: 0 }}>Candidate Strength</h3>
            <button onClick={generateSummary} disabled={loadingSummary} style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              backgroundColor: '#151e2e', border: '1px solid #1e2839', borderRadius: '10px',
              padding: '6px 14px', color: '#7a8fa8', fontSize: '12px',
              cursor: loadingSummary ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            }}>
              {loadingSummary ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={12} />}
              {loadingSummary ? 'Generating…' : 'Generate'}
            </button>
          </div>

          {!summary && !loadingSummary && (
            <div style={{ textAlign: 'center', padding: '48px 24px' }}>
              <p style={{ color: '#3d5068', fontSize: '13px', margin: '0 0 8px' }}>Click &quot;Generate&quot; for an AI assessment of your candidacy.</p>
              <p style={{ color: '#2d3f58', fontSize: '12px', margin: 0 }}>Analyzes your resume, experiences, and saved context.</p>
            </div>
          )}

          {loadingSummary && (
            <div style={{ textAlign: 'center', padding: '48px' }}>
              <Loader size={24} color="#f59e0b" style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px', display: 'block' }} />
              <p style={{ color: '#4a5d75', fontSize: '13px', margin: 0 }}>Analyzing your background…</p>
            </div>
          )}

          {summary && !loadingSummary && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px', padding: '14px 16px', backgroundColor: '#0d1117', borderRadius: '12px' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '32px', fontWeight: 800, color: readinessColor(summary.readiness_score), lineHeight: 1 }}>{summary.readiness_score}</div>
                  <div style={{ color: '#3d5068', fontSize: '10px', marginTop: '3px' }}>/10</div>
                </div>
                <div>
                  <div style={{ color: '#e2e8f4', fontWeight: 700, fontSize: '13px' }}>Readiness Score</div>
                  <div style={{ color: '#4a5d75', fontSize: '12px', marginTop: '3px' }}>For competitive tech/CRE roles</div>
                </div>
              </div>
              <p style={{ color: '#c8d5e8', fontSize: '13px', lineHeight: '1.65', margin: '0 0 16px' }}>{summary.summary}</p>
              <div style={{ marginBottom: '14px' }}>
                <h4 style={{ color: '#34d399', fontSize: '11px', fontWeight: 700, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Strengths</h4>
                <ul style={{ margin: 0, paddingLeft: '16px' }}>
                  {summary.strengths.map((s, i) => <li key={i} style={{ color: '#c8d5e8', fontSize: '13px', marginBottom: '5px' }}>{s}</li>)}
                </ul>
              </div>
              <div>
                <h4 style={{ color: '#f97316', fontSize: '11px', fontWeight: 700, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Areas to Develop</h4>
                <ul style={{ margin: 0, paddingLeft: '16px' }}>
                  {summary.gaps.map((g, i) => <li key={i} style={{ color: '#c8d5e8', fontSize: '13px', marginBottom: '5px' }}>{g}</li>)}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
