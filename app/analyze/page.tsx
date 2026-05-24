'use client';

import { useState } from 'react';
import { FileText, Zap, Check, X, Loader, AlertCircle } from 'lucide-react';

type Tab = 'jd' | 'brief';

interface JDAnalysis {
  fit_score: number;
  verdict: 'Strong Match' | 'Good Fit' | 'Stretch' | 'Not a Match';
  what_you_have: string[];
  what_you_lack: string[];
  how_to_position: string;
  should_apply: boolean;
  role_type: string;
  top_keywords: string[];
}

interface BriefAction {
  action: string;
  urgency: 'today' | 'this-week' | 'soon';
  reason: string;
}

interface BriefRole {
  title: string;
  why: string;
  example_companies: string[];
}

interface WeeklyBrief {
  headline: string;
  priority_actions: BriefAction[];
  recommended_roles: BriefRole[];
  this_week_focus: string;
  honest_assessment: string;
  generated_at: string;
}

function scoreColor(score: number) {
  if (score >= 8) return '#059669';
  if (score >= 6) return '#d97706';
  if (score >= 4) return '#ea580c';
  return '#dc2626';
}

function verdictColor(v: string) {
  if (v === 'Strong Match') return '#059669';
  if (v === 'Good Fit') return '#d97706';
  if (v === 'Stretch') return '#ea580c';
  return '#dc2626';
}

function urgencyColor(u: string) {
  if (u === 'today') return '#dc2626';
  if (u === 'this-week') return '#d97706';
  return '#059669';
}

function urgencyLabel(u: string) {
  if (u === 'today') return 'Today';
  if (u === 'this-week') return 'This week';
  return 'Soon';
}

export default function AnalyzePage() {
  const [tab, setTab] = useState<Tab>('jd');

  const [jdText, setJdText] = useState('');
  const [jdLoading, setJdLoading] = useState(false);
  const [jdResult, setJdResult] = useState<JDAnalysis | null>(null);
  const [jdError, setJdError] = useState('');

  const [briefLoading, setBriefLoading] = useState(false);
  const [brief, setBrief] = useState<WeeklyBrief | null>(null);
  const [briefError, setBriefError] = useState('');

  const analyzeJD = async () => {
    if (!jdText.trim() || jdLoading) return;
    setJdLoading(true);
    setJdResult(null);
    setJdError('');
    try {
      const res = await fetch('/api/analyze/jd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jd: jdText }),
      });
      const data = await res.json();
      if (data.error) setJdError(data.error);
      else setJdResult(data);
    } catch {
      setJdError('Analysis failed. Please try again.');
    }
    setJdLoading(false);
  };

  const generateBrief = async () => {
    if (briefLoading) return;
    setBriefLoading(true);
    setBrief(null);
    setBriefError('');
    try {
      const res = await fetch('/api/brief');
      const data = await res.json();
      if (data.error) setBriefError(data.error);
      else setBrief(data);
    } catch {
      setBriefError('Brief generation failed. Please try again.');
    }
    setBriefLoading(false);
  };

  const card: React.CSSProperties = {
    backgroundColor: '#1e1e1e',
    border: '1px solid #2a2a2a',
    borderRadius: '12px',
    padding: '20px',
  };

  const sectionLabel: React.CSSProperties = {
    color: '#d97706',
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: '12px',
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#1a1a1a' }}>

      {/* Header */}
      <div style={{
        padding: '24px 32px',
        borderBottom: '1px solid #2a2a2a',
        backgroundColor: '#1e1e1e',
        flexShrink: 0,
      }}>
        <h1 style={{ color: '#e8e8e8', fontSize: '16px', fontWeight: 600, margin: 0 }}>Career Tools</h1>
        <p style={{ color: '#888', fontSize: '12px', margin: '2px 0 0' }}>AI-powered fit analysis and weekly career guidance</p>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', marginTop: '16px' }}>
          {([['jd', 'JD Fit Analyzer'], ['brief', 'Weekly Brief']] as [Tab, string][]).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '6px 16px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: tab === t ? '#d97706' : 'transparent',
                color: tab === t ? '#fff' : '#666',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '32px', maxWidth: '860px' }}>

        {/* ── JD Analyzer ── */}
        {tab === 'jd' && (
          <div>
            <div style={{ marginBottom: '16px' }}>
              <h2 style={{ color: '#e8e8e8', fontSize: '14px', fontWeight: 600, margin: '0 0 4px' }}>Job Description Fit Analyzer</h2>
              <p style={{ color: '#666', fontSize: '12px', margin: 0 }}>Paste any job description and get an honest assessment of how well you match it.</p>
            </div>

            <textarea
              value={jdText}
              onChange={e => setJdText(e.target.value)}
              placeholder="Paste the full job description here..."
              style={{
                width: '100%',
                minHeight: '220px',
                backgroundColor: '#1e1e1e',
                border: '1px solid #2a2a2a',
                borderRadius: '10px',
                padding: '16px',
                color: '#e8e8e8',
                fontSize: '13px',
                lineHeight: '1.6',
                resize: 'vertical',
                outline: 'none',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />

            <button
              onClick={analyzeJD}
              disabled={!jdText.trim() || jdLoading}
              style={{
                marginTop: '12px',
                padding: '10px 24px',
                backgroundColor: !jdText.trim() || jdLoading ? '#333' : '#d97706',
                color: !jdText.trim() || jdLoading ? '#555' : '#fff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: !jdText.trim() || jdLoading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              {jdLoading
                ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
                : <FileText size={14} />}
              {jdLoading ? 'Analyzing...' : 'Analyze Fit'}
            </button>

            {jdError && (
              <div style={{ marginTop: '16px', color: '#dc2626', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <AlertCircle size={14} /> {jdError}
              </div>
            )}

            {jdResult && (
              <div style={{ marginTop: '28px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

                {/* Score + verdict */}
                <div style={{ ...card, display: 'flex', alignItems: 'center', gap: '28px' }}>
                  <div style={{ textAlign: 'center', flexShrink: 0 }}>
                    <div style={{ fontSize: '52px', fontWeight: 800, color: scoreColor(jdResult.fit_score), lineHeight: 1 }}>
                      {jdResult.fit_score}
                    </div>
                    <div style={{ color: '#555', fontSize: '11px', marginTop: '4px' }}>/ 10</div>
                  </div>
                  <div>
                    <div style={{
                      display: 'inline-block',
                      padding: '4px 12px',
                      borderRadius: '20px',
                      backgroundColor: verdictColor(jdResult.verdict) + '22',
                      color: verdictColor(jdResult.verdict),
                      fontSize: '12px',
                      fontWeight: 700,
                      marginBottom: '6px',
                    }}>
                      {jdResult.verdict}
                    </div>
                    {jdResult.role_type && (
                      <div style={{ color: '#888', fontSize: '12px', marginBottom: '8px' }}>{jdResult.role_type}</div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                      {jdResult.should_apply ? (
                        <><Check size={14} color="#059669" /><span style={{ color: '#059669', fontWeight: 600 }}>Apply for this role</span></>
                      ) : (
                        <><X size={14} color="#dc2626" /><span style={{ color: '#dc2626', fontWeight: 600 }}>Skip this one</span></>
                      )}
                    </div>
                  </div>
                </div>

                {/* Have / Lack */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div style={card}>
                    <div style={{ color: '#059669', fontSize: '12px', fontWeight: 600, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Check size={13} /> What you have
                    </div>
                    {jdResult.what_you_have.map((item, i) => (
                      <div key={i} style={{
                        color: '#d0d0d0', fontSize: '12px', lineHeight: '1.5', padding: '5px 0',
                        borderBottom: i < jdResult.what_you_have.length - 1 ? '1px solid #242424' : 'none',
                      }}>
                        {item}
                      </div>
                    ))}
                  </div>

                  <div style={card}>
                    <div style={{
                      color: jdResult.what_you_lack.length === 0 ? '#555' : '#dc2626',
                      fontSize: '12px', fontWeight: 600, marginBottom: '10px',
                      display: 'flex', alignItems: 'center', gap: '6px',
                    }}>
                      <X size={13} /> What you lack
                    </div>
                    {jdResult.what_you_lack.length === 0 ? (
                      <div style={{ color: '#555', fontSize: '12px' }}>No significant gaps</div>
                    ) : jdResult.what_you_lack.map((item, i) => (
                      <div key={i} style={{
                        color: '#d0d0d0', fontSize: '12px', lineHeight: '1.5', padding: '5px 0',
                        borderBottom: i < jdResult.what_you_lack.length - 1 ? '1px solid #242424' : 'none',
                      }}>
                        {item}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Positioning */}
                <div style={card}>
                  <div style={sectionLabel}>How to position yourself</div>
                  <p style={{ color: '#d0d0d0', fontSize: '13px', lineHeight: '1.6', margin: 0 }}>{jdResult.how_to_position}</p>
                </div>

                {/* Keywords */}
                {jdResult.top_keywords?.length > 0 && (
                  <div style={card}>
                    <div style={sectionLabel}>Mirror these keywords in your application</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {jdResult.top_keywords.map((kw, i) => (
                        <span key={i} style={{
                          backgroundColor: '#2a2a2a',
                          color: '#d0d0d0',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '12px',
                        }}>{kw}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Weekly Brief ── */}
        {tab === 'brief' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
              <div>
                <h2 style={{ color: '#e8e8e8', fontSize: '14px', fontWeight: 600, margin: '0 0 4px' }}>Weekly Career Brief</h2>
                <p style={{ color: '#666', fontSize: '12px', margin: 0 }}>
                  Personalized snapshot of where you stand and what to do this week — uses your resume, tracker, and saved memories.
                </p>
              </div>
              <button
                onClick={generateBrief}
                disabled={briefLoading}
                style={{
                  marginLeft: '24px',
                  padding: '10px 20px',
                  backgroundColor: briefLoading ? '#333' : '#d97706',
                  color: briefLoading ? '#555' : '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: briefLoading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  flexShrink: 0,
                }}
              >
                {briefLoading
                  ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
                  : <Zap size={14} />}
                {briefLoading ? 'Generating...' : brief ? 'Regenerate' : 'Generate Brief'}
              </button>
            </div>

            {briefError && (
              <div style={{ color: '#dc2626', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px' }}>
                <AlertCircle size={14} /> {briefError}
              </div>
            )}

            {!brief && !briefLoading && (
              <div style={{
                ...card,
                textAlign: 'center',
                padding: '56px',
                border: '1px dashed #2a2a2a',
              }}>
                <Zap size={28} color="#2a2a2a" style={{ marginBottom: '12px' }} />
                <div style={{ color: '#555', fontSize: '13px' }}>Click "Generate Brief" to get your weekly career snapshot.</div>
                <div style={{ color: '#3a3a3a', fontSize: '12px', marginTop: '6px' }}>Takes about 15 seconds.</div>
              </div>
            )}

            {briefLoading && (
              <div style={{ ...card, textAlign: 'center', padding: '56px' }}>
                <Loader size={28} color="#d97706" style={{ animation: 'spin 1s linear infinite', marginBottom: '12px' }} />
                <div style={{ color: '#666', fontSize: '13px' }}>Analyzing your profile, tracker, and memories...</div>
              </div>
            )}

            {brief && !briefLoading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                {/* Headline */}
                <div style={card}>
                  <div style={sectionLabel}>Where you stand</div>
                  <p style={{ color: '#e8e8e8', fontSize: '14px', lineHeight: '1.6', margin: 0, fontWeight: 500 }}>{brief.headline}</p>
                  {brief.generated_at && (
                    <div style={{ color: '#3a3a3a', fontSize: '11px', marginTop: '12px' }}>
                      Generated {new Date(brief.generated_at).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                </div>

                {/* Priority actions */}
                <div style={card}>
                  <div style={sectionLabel}>Priority Actions</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {brief.priority_actions?.map((a, i) => (
                      <div key={i} style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '12px',
                        padding: '10px 0',
                        borderBottom: i < brief.priority_actions.length - 1 ? '1px solid #242424' : 'none',
                      }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          backgroundColor: urgencyColor(a.urgency) + '22',
                          color: urgencyColor(a.urgency),
                          fontSize: '10px',
                          fontWeight: 700,
                          flexShrink: 0,
                          marginTop: '2px',
                        }}>
                          {urgencyLabel(a.urgency)}
                        </span>
                        <div>
                          <div style={{ color: '#e8e8e8', fontSize: '13px', fontWeight: 500 }}>{a.action}</div>
                          <div style={{ color: '#666', fontSize: '12px', marginTop: '3px' }}>{a.reason}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recommended roles */}
                <div style={card}>
                  <div style={sectionLabel}>Roles You Should Be Targeting</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {brief.recommended_roles?.map((role, i) => (
                      <div key={i} style={{
                        padding: '10px 0',
                        borderBottom: i < brief.recommended_roles.length - 1 ? '1px solid #242424' : 'none',
                      }}>
                        <div style={{ color: '#e8e8e8', fontSize: '13px', fontWeight: 600 }}>{role.title}</div>
                        <div style={{ color: '#888', fontSize: '12px', marginTop: '3px' }}>{role.why}</div>
                        <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                          {role.example_companies?.map((co, j) => (
                            <span key={j} style={{
                              backgroundColor: '#2a2a2a',
                              color: '#666',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                            }}>{co}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Focus + assessment */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div style={card}>
                    <div style={sectionLabel}>This Week&apos;s Focus</div>
                    <p style={{ color: '#d0d0d0', fontSize: '13px', lineHeight: '1.6', margin: 0 }}>{brief.this_week_focus}</p>
                  </div>
                  <div style={{ ...card, borderColor: '#333' }}>
                    <div style={{ ...sectionLabel, color: '#888' }}>Honest Assessment</div>
                    <p style={{ color: '#d0d0d0', fontSize: '13px', lineHeight: '1.6', margin: 0 }}>{brief.honest_assessment}</p>
                  </div>
                </div>

              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
