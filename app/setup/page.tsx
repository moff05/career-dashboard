'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveUser } from '@/app/hooks/useUser';

const STEPS = ['identity', 'background', 'resume', 'apikey'] as const;
type Step = typeof STEPS[number];

const STEP_META: Record<Step, { label: string; hint: string }> = {
  identity:   { label: 'Who are you?',      hint: 'Basic info so the AI knows your name and context.' },
  background: { label: 'Career context',    hint: 'Where you are and where you\'re headed.' },
  resume:     { label: 'Paste your resume', hint: 'Plain text works best. The AI uses this for tailored advice.' },
  apikey:     { label: 'Your API key',      hint: 'Stored in your browser only — never sent to our servers.' },
};

function generateUserId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 11);
}

const INPUT: React.CSSProperties = {
  width: '100%', background: 'rgba(125,220,255,0.06)', backdropFilter: 'blur(12px)',
  border: '1px solid rgba(125,220,255,0.18)', borderRadius: '10px',
  padding: '11px 14px', color: 'rgba(232,244,255,0.95)', fontSize: '14px',
  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  transition: 'border-color 0.15s',
};

const LABEL: React.CSSProperties = {
  display: 'block', color: 'rgba(158,202,242,0.75)', fontSize: '11px',
  fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '6px',
};

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('identity');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '', email: '', linkedin: '',
    university: '', degree: '', graduation_date: '',
    target_roles: '', target_cities: '', notes: '',
    resume_text: '',
    api_key: '',
  });

  const stepIdx = STEPS.indexOf(step);
  const isLast = step === 'apikey';

  function set(field: keyof typeof form, value: string) {
    setForm(p => ({ ...p, [field]: value }));
    setError('');
  }

  function validate(): string {
    if (step === 'identity' && !form.name.trim()) return 'Name is required.';
    if (step === 'apikey') {
      if (!form.api_key.trim()) return 'API key is required.';
      if (!form.api_key.startsWith('sk-ant-')) return 'That doesn\'t look like an Anthropic API key (should start with sk-ant-).';
    }
    return '';
  }

  async function advance() {
    const err = validate();
    if (err) { setError(err); return; }

    if (!isLast) {
      setStep(STEPS[stepIdx + 1]);
      return;
    }

    // Final step: save and bootstrap
    setSaving(true);
    try {
      const userId = generateUserId();
      saveUser(userId, form.api_key.trim());
      localStorage.setItem('cid_display_name', form.name.trim());

      // Create profile in DB
      await fetch('/api/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
          'x-api-key': form.api_key.trim(),
        },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          linkedin: form.linkedin.trim(),
          university: form.university.trim(),
          degree: form.degree.trim(),
          graduation_date: form.graduation_date.trim(),
          target_roles: form.target_roles.trim(),
          target_cities: form.target_cities.trim(),
          notes: form.notes.trim(),
          resume_text: form.resume_text.trim() || null,
        }),
      });

      // Save resume separately if provided
      if (form.resume_text.trim()) {
        await fetch('/api/profile/resume', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': userId,
            'x-api-key': form.api_key.trim(),
          },
          body: JSON.stringify({ raw_text: form.resume_text.trim() }),
        });
      }

      router.replace('/');
    } catch {
      setError('Something went wrong saving your profile. Check your API key and try again.');
      setSaving(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px', boxSizing: 'border-box',
    }}>
      <div style={{ width: '100%', maxWidth: '520px' }}>

        {/* Logo / brand */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{
            width: '52px', height: '52px', borderRadius: '14px', margin: '0 auto 16px',
            background: 'linear-gradient(135deg, #4A9EF8, #7DF4FC)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '20px', fontWeight: 800, color: '#03091A',
            boxShadow: '0 0 0 1px rgba(125,244,252,0.3), 0 0 30px rgba(125,244,252,0.25)',
          }}>CD</div>
          <h1 style={{ color: 'rgba(232,244,255,0.95)', fontSize: '22px', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
            Career Dashboard
          </h1>
          <p style={{ color: 'rgba(158,202,242,0.65)', fontSize: '13px', margin: '6px 0 0' }}>
            Your AI-powered job search command center
          </p>
        </div>

        {/* Progress bar */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '32px' }}>
          {STEPS.map((s, i) => (
            <div key={s} style={{
              flex: 1, height: '3px', borderRadius: '2px',
              background: i <= stepIdx ? '#7DF4FC' : 'rgba(125,220,255,0.15)',
              transition: 'background 0.3s ease',
              boxShadow: i <= stepIdx ? '0 0 8px rgba(125,244,252,0.5)' : 'none',
            }} />
          ))}
        </div>

        {/* Card */}
        <div style={{
          background: 'rgba(125,220,255,0.055)', backdropFilter: 'blur(24px)',
          border: '1px solid rgba(125,220,255,0.14)', borderRadius: '18px',
          padding: '32px 28px',
        }}>
          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ color: 'rgba(232,244,255,0.95)', fontSize: '17px', fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.01em' }}>
              {STEP_META[step].label}
            </h2>
            <p style={{ color: 'rgba(158,202,242,0.65)', fontSize: '12px', margin: 0 }}>
              {STEP_META[step].hint}
            </p>
          </div>

          {/* ── Step: identity ── */}
          {step === 'identity' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={LABEL}>Full name *</label>
                <input value={form.name} onChange={e => set('name', e.target.value)}
                  placeholder="Alex Johnson" style={INPUT} autoFocus
                  onFocus={e => (e.target.style.borderColor = 'rgba(125,244,252,0.45)')}
                  onBlur={e => (e.target.style.borderColor = 'rgba(125,220,255,0.18)')} />
              </div>
              <div>
                <label style={LABEL}>Email</label>
                <input value={form.email} onChange={e => set('email', e.target.value)}
                  placeholder="alex@example.com" type="email" style={INPUT}
                  onFocus={e => (e.target.style.borderColor = 'rgba(125,244,252,0.45)')}
                  onBlur={e => (e.target.style.borderColor = 'rgba(125,220,255,0.18)')} />
              </div>
              <div>
                <label style={LABEL}>LinkedIn URL</label>
                <input value={form.linkedin} onChange={e => set('linkedin', e.target.value)}
                  placeholder="linkedin.com/in/yourname" style={INPUT}
                  onFocus={e => (e.target.style.borderColor = 'rgba(125,244,252,0.45)')}
                  onBlur={e => (e.target.style.borderColor = 'rgba(125,220,255,0.18)')} />
              </div>
            </div>
          )}

          {/* ── Step: background ── */}
          {step === 'background' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={LABEL}>School / University</label>
                  <input value={form.university} onChange={e => set('university', e.target.value)}
                    placeholder="University of Miami" style={INPUT}
                    onFocus={e => (e.target.style.borderColor = 'rgba(125,244,252,0.45)')}
                    onBlur={e => (e.target.style.borderColor = 'rgba(125,220,255,0.18)')} />
                </div>
                <div>
                  <label style={LABEL}>Graduation date</label>
                  <input value={form.graduation_date} onChange={e => set('graduation_date', e.target.value)}
                    placeholder="May 2027" style={INPUT}
                    onFocus={e => (e.target.style.borderColor = 'rgba(125,244,252,0.45)')}
                    onBlur={e => (e.target.style.borderColor = 'rgba(125,220,255,0.18)')} />
                </div>
              </div>
              <div>
                <label style={LABEL}>Degree / Major</label>
                <input value={form.degree} onChange={e => set('degree', e.target.value)}
                  placeholder="BS Computer Science" style={INPUT}
                  onFocus={e => (e.target.style.borderColor = 'rgba(125,244,252,0.45)')}
                  onBlur={e => (e.target.style.borderColor = 'rgba(125,220,255,0.18)')} />
              </div>
              <div>
                <label style={LABEL}>Target roles</label>
                <input value={form.target_roles} onChange={e => set('target_roles', e.target.value)}
                  placeholder="Software Engineer, PM, Data Analyst" style={INPUT}
                  onFocus={e => (e.target.style.borderColor = 'rgba(125,244,252,0.45)')}
                  onBlur={e => (e.target.style.borderColor = 'rgba(125,220,255,0.18)')} />
              </div>
              <div>
                <label style={LABEL}>Target cities / locations</label>
                <input value={form.target_cities} onChange={e => set('target_cities', e.target.value)}
                  placeholder="New York, San Francisco, Remote" style={INPUT}
                  onFocus={e => (e.target.style.borderColor = 'rgba(125,244,252,0.45)')}
                  onBlur={e => (e.target.style.borderColor = 'rgba(125,220,255,0.18)')} />
              </div>
              <div>
                <label style={LABEL}>Anything else the AI should know</label>
                <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
                  placeholder="e.g. 'Remote only for internships, open to relocation full-time. Strong interest in fintech.'"
                  rows={3} style={{ ...INPUT, resize: 'vertical' }}
                  onFocus={e => (e.target.style.borderColor = 'rgba(125,244,252,0.45)')}
                  onBlur={e => (e.target.style.borderColor = 'rgba(125,220,255,0.18)')} />
              </div>
            </div>
          )}

          {/* ── Step: resume ── */}
          {step === 'resume' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <textarea value={form.resume_text} onChange={e => set('resume_text', e.target.value)}
                placeholder={`Paste your resume as plain text here...\n\nEXAMPLE:\n\nAlex Johnson\nalexj@email.com | linkedin.com/in/alexj\n\nEDUCATION\nUniversity of Miami — BS Computer Science, May 2027\nGPA: 3.8/4.0\n\nEXPERIENCE\nSoftware Engineering Intern — Acme Corp (Summer 2024)\n- Built REST APIs serving 10k+ daily users\n- Reduced query latency by 40% via index optimization\n\nSKILLS\nPython, TypeScript, React, PostgreSQL, AWS`}
                rows={16} style={{ ...INPUT, resize: 'vertical', fontSize: '12px', lineHeight: 1.6 }}
                onFocus={e => (e.target.style.borderColor = 'rgba(125,244,252,0.45)')}
                onBlur={e => (e.target.style.borderColor = 'rgba(125,220,255,0.18)')} />
              <p style={{ color: 'rgba(158,202,242,0.50)', fontSize: '11px', margin: 0 }}>
                Optional but strongly recommended — enables tailored cover letters, gap analysis, and personalized coaching.
              </p>
            </div>
          )}

          {/* ── Step: API key ── */}
          {step === 'apikey' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={LABEL}>Anthropic API key *</label>
                <input value={form.api_key} onChange={e => set('api_key', e.target.value)}
                  placeholder="sk-ant-api03-..." type="password" style={INPUT} autoFocus
                  onFocus={e => (e.target.style.borderColor = 'rgba(125,244,252,0.45)')}
                  onBlur={e => (e.target.style.borderColor = 'rgba(125,220,255,0.18)')} />
              </div>

              <div style={{
                background: 'rgba(125,220,255,0.04)', border: '1px solid rgba(125,220,255,0.10)',
                borderRadius: '10px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '8px',
              }}>
                <div style={{ color: 'rgba(158,202,242,0.80)', fontSize: '12px', fontWeight: 600 }}>Where to get one:</div>
                <div style={{ color: 'rgba(158,202,242,0.60)', fontSize: '12px', lineHeight: 1.5 }}>
                  1. Go to <span style={{ color: '#7DF4FC' }}>console.anthropic.com</span><br />
                  2. Sign up / log in → API Keys → Create Key<br />
                  3. Paste it above
                </div>
                <div style={{ color: 'rgba(158,202,242,0.45)', fontSize: '11px', marginTop: '2px' }}>
                  Typical cost: ~$0.05–0.20/day for normal use. Your key is stored in your browser only.
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{
              marginTop: '16px', padding: '10px 14px', borderRadius: '8px',
              background: 'rgba(248,100,100,0.10)', border: '1px solid rgba(248,100,100,0.22)',
              color: 'rgba(252,150,150,0.90)', fontSize: '12px',
            }}>{error}</div>
          )}

          {/* Navigation */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '28px' }}>
            <button
              onClick={() => stepIdx > 0 && setStep(STEPS[stepIdx - 1])}
              disabled={stepIdx === 0}
              style={{
                background: 'transparent', border: 'none', color: stepIdx === 0 ? 'rgba(125,220,255,0.20)' : 'rgba(158,202,242,0.60)',
                fontSize: '13px', cursor: stepIdx === 0 ? 'default' : 'pointer', padding: '8px 0', fontFamily: 'inherit',
              }}>
              ← Back
            </button>

            <button onClick={advance} disabled={saving} style={{
              background: saving ? 'rgba(125,220,255,0.08)' : 'linear-gradient(135deg, rgba(74,158,248,0.3), rgba(125,244,252,0.22))',
              color: saving ? 'rgba(125,220,255,0.40)' : '#7DF4FC',
              border: '1px solid rgba(125,244,252,0.32)', borderRadius: '10px',
              padding: '10px 24px', fontSize: '13px', fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              letterSpacing: '0.02em', transition: 'all 0.15s',
              boxShadow: saving ? 'none' : '0 0 20px -6px rgba(125,244,252,0.3)',
            }}>
              {saving ? 'Setting up…' : isLast ? 'Launch →' : `Next →`}
            </button>
          </div>
        </div>

        {/* Footer note */}
        <p style={{ textAlign: 'center', color: 'rgba(125,175,230,0.35)', fontSize: '11px', marginTop: '20px' }}>
          Open source · Your data stays with you · No account required
        </p>
      </div>
    </div>
  );
}
