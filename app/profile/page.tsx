'use client';

import { useState, useEffect } from 'react';
import { Edit2, ExternalLink, RefreshCw, Loader } from 'lucide-react';

interface Profile {
  id?: number;
  name?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  university?: string;
  degree?: string;
  graduation_date?: string;
  gpa?: string;
  honors?: string;
  minors?: string;
  target_roles?: string;
  target_cities?: string;
  notes?: string;
}

interface Summary {
  strengths: string[];
  gaps: string[];
  readiness_score: number;
  summary: string;
}

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

  const startEdit = (field: string, value: string) => {
    setEditField(field);
    setEditValue(value || '');
  };

  const saveField = async () => {
    if (!editField) return;
    setSaving(true);
    const updated = { ...profile, [editField]: editValue };
    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    const data = await res.json();
    setProfile(data);
    setEditField(null);
    setSaving(false);
  };

  const generateSummary = async () => {
    setLoadingSummary(true);
    try {
      const res = await fetch('/api/profile/summary', { method: 'POST' });
      const data = await res.json();
      setSummary(data);
    } catch {
      setSummary(null);
    }
    setLoadingSummary(false);
  };

  const EditableField = ({ field, label, value, multiline = false }: {
    field: string;
    label: string;
    value: string | undefined;
    multiline?: boolean;
  }) => {
    const isEditing = editField === field;
    return (
      <div style={{ marginBottom: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <span style={{ color: '#888', fontSize: '11px', display: 'block', marginBottom: '4px' }}>{label}</span>
          {!isEditing && (
            <button
              onClick={() => startEdit(field, value || '')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555', padding: '0 2px' }}
            >
              <Edit2 size={12} />
            </button>
          )}
        </div>
        {isEditing ? (
          <div>
            {multiline ? (
              <textarea
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                rows={3}
                autoFocus
                style={{
                  width: '100%',
                  backgroundColor: '#1a1a1a',
                  border: '1px solid #d97706',
                  borderRadius: '6px',
                  padding: '8px 10px',
                  color: '#e8e8e8',
                  fontSize: '13px',
                  outline: 'none',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                }}
              />
            ) : (
              <input
                type="text"
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveField(); if (e.key === 'Escape') setEditField(null); }}
                autoFocus
                style={{
                  width: '100%',
                  backgroundColor: '#1a1a1a',
                  border: '1px solid #d97706',
                  borderRadius: '6px',
                  padding: '8px 10px',
                  color: '#e8e8e8',
                  fontSize: '13px',
                  outline: 'none',
                }}
              />
            )}
            <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
              <button
                onClick={saveField}
                disabled={saving}
                style={{
                  backgroundColor: '#d97706',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '4px 12px',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => setEditField(null)}
                style={{
                  backgroundColor: '#333',
                  color: '#888',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '4px 12px',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div style={{ color: '#e8e8e8', fontSize: '13px', lineHeight: '1.5' }}>
            {field === 'linkedin' && value ? (
              <a
                href={value.startsWith('http') ? value : `https://${value}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#d97706', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                {value} <ExternalLink size={11} />
              </a>
            ) : (
              value || <span style={{ color: '#555', fontStyle: 'italic' }}>Not set</span>
            )}
          </div>
        )}
      </div>
    );
  };

  const readinessColor = (score: number) => {
    if (score >= 8) return '#22c55e';
    if (score >= 6) return '#d97706';
    return '#ef4444';
  };

  return (
    <div style={{ padding: '32px', minHeight: '100vh', backgroundColor: '#1a1a1a' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ color: '#e8e8e8', fontSize: '20px', fontWeight: 600, margin: 0 }}>My Profile</h1>
        <p style={{ color: '#888', fontSize: '13px', margin: '4px 0 0' }}>Resume info and candidate positioning</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'start' }}>
        {/* Left: Resume Info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Personal */}
          <div style={{
            backgroundColor: '#242424',
            border: '1px solid #333',
            borderRadius: '8px',
            padding: '20px',
          }}>
            <h3 style={{ color: '#888', fontSize: '11px', fontWeight: 600, margin: '0 0 16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Personal
            </h3>
            <EditableField field="name" label="Full Name" value={profile.name} />
            <EditableField field="email" label="Email" value={profile.email} />
            <EditableField field="phone" label="Phone" value={profile.phone} />
            <EditableField field="linkedin" label="LinkedIn" value={profile.linkedin} />
          </div>

          {/* Education */}
          <div style={{
            backgroundColor: '#242424',
            border: '1px solid #333',
            borderRadius: '8px',
            padding: '20px',
          }}>
            <h3 style={{ color: '#888', fontSize: '11px', fontWeight: 600, margin: '0 0 16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Education
            </h3>
            <EditableField field="university" label="University" value={profile.university} />
            <EditableField field="degree" label="Degree" value={profile.degree} />
            <EditableField field="graduation_date" label="Graduation" value={profile.graduation_date} />
            <EditableField field="gpa" label="GPA" value={profile.gpa} />
            <EditableField field="minors" label="Minors" value={profile.minors} />
            <EditableField field="honors" label="Honors" value={profile.honors} multiline />
          </div>

          {/* Targets */}
          <div style={{
            backgroundColor: '#242424',
            border: '1px solid #333',
            borderRadius: '8px',
            padding: '20px',
          }}>
            <h3 style={{ color: '#888', fontSize: '11px', fontWeight: 600, margin: '0 0 16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Targets
            </h3>
            <EditableField field="target_roles" label="Target Roles" value={profile.target_roles} multiline />
            <EditableField field="target_cities" label="Target Cities" value={profile.target_cities} multiline />
            <EditableField field="notes" label="Notes" value={profile.notes} multiline />
          </div>
        </div>

        {/* Right: AI Summary */}
        <div>
          <div style={{
            backgroundColor: '#242424',
            border: '1px solid #333',
            borderRadius: '8px',
            padding: '20px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ color: '#e8e8e8', fontSize: '14px', fontWeight: 600, margin: 0 }}>
                Candidate Strength Summary
              </h3>
              <button
                onClick={generateSummary}
                disabled={loadingSummary}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: '#2a2a2a',
                  border: '1px solid #333',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  color: '#888',
                  fontSize: '12px',
                  cursor: loadingSummary ? 'not-allowed' : 'pointer',
                }}
              >
                {loadingSummary ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={12} />}
                {loadingSummary ? 'Generating...' : 'Generate'}
              </button>
            </div>

            {!summary && !loadingSummary && (
              <div style={{ textAlign: 'center', padding: '48px 24px' }}>
                <p style={{ color: '#555', fontSize: '13px', margin: '0 0 12px' }}>
                  Click &quot;Generate&quot; to get an AI-powered assessment of your candidacy.
                </p>
                <p style={{ color: '#444', fontSize: '12px', margin: 0 }}>
                  Analyzes your resume, experiences, and saved context.
                </p>
              </div>
            )}

            {loadingSummary && (
              <div style={{ textAlign: 'center', padding: '48px' }}>
                <Loader size={24} color="#d97706" style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
                <p style={{ color: '#888', fontSize: '13px', margin: 0 }}>Analyzing your background...</p>
              </div>
            )}

            {summary && !loadingSummary && (
              <div>
                {/* Readiness score */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  marginBottom: '20px',
                  padding: '14px 16px',
                  backgroundColor: '#2a2a2a',
                  borderRadius: '8px',
                }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{
                      fontSize: '32px',
                      fontWeight: 700,
                      color: readinessColor(summary.readiness_score),
                      lineHeight: 1,
                    }}>
                      {summary.readiness_score}
                    </div>
                    <div style={{ color: '#888', fontSize: '10px', marginTop: '4px' }}>/10</div>
                  </div>
                  <div>
                    <div style={{ color: '#e8e8e8', fontWeight: 600, fontSize: '13px' }}>Readiness Score</div>
                    <div style={{ color: '#888', fontSize: '12px', marginTop: '4px' }}>For competitive tech/CRE roles</div>
                  </div>
                </div>

                <p style={{ color: '#e8e8e8', fontSize: '13px', lineHeight: '1.6', margin: '0 0 16px' }}>
                  {summary.summary}
                </p>

                <div style={{ marginBottom: '16px' }}>
                  <h4 style={{ color: '#22c55e', fontSize: '12px', fontWeight: 600, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Strengths
                  </h4>
                  <ul style={{ margin: 0, paddingLeft: '16px' }}>
                    {summary.strengths.map((s, i) => (
                      <li key={i} style={{ color: '#e8e8e8', fontSize: '13px', marginBottom: '4px' }}>{s}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h4 style={{ color: '#f97316', fontSize: '12px', fontWeight: 600, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Areas to Develop
                  </h4>
                  <ul style={{ margin: 0, paddingLeft: '16px' }}>
                    {summary.gaps.map((g, i) => (
                      <li key={i} style={{ color: '#e8e8e8', fontSize: '13px', marginBottom: '4px' }}>{g}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
