'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Check, FileText } from 'lucide-react';
import { saveUser } from '@/app/hooks/useUser';
import { extractResumeText } from '@/lib/resumeExtract';

const STEPS = ['resume', 'identity', 'background'] as const;
type Step = typeof STEPS[number];

const STEP_META: Record<Step, { label: string; hint: string }> = {
  resume:     { label: 'Add your resume',   hint: 'Upload a PDF, Word doc, or photo of your resume/CV, or paste plain text. We\'ll pull your info from it in the next steps.' },
  identity:   { label: 'Who are you?',      hint: 'Basic info so the AI knows your name and context.' },
  background: { label: 'Career context',    hint: 'Where you are and where you\'re headed.' },
};

function generateUserId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 11);
}

const INPUT: React.CSSProperties = {
  width: '100%', background: 'var(--surface)',
  border: '1px solid var(--border)', borderRadius: 'var(--r-lg)',
  padding: '11px 14px', color: 'var(--text)', fontSize: '14px',
  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  transition: 'border-color 0.15s',
};

const LABEL: React.CSSProperties = {
  display: 'block', color: 'var(--text-muted)', fontSize: '11px',
  fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '6px',
};

export default function SetupPage() {
  const router = useRouter();
  useEffect(() => {
    if (localStorage.getItem('cid_user_id')) router.replace('/');
  }, [router]);
  const [step, setStep] = useState<Step>(STEPS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [parsingFile, setParsingFile] = useState(false);
  const [resumeFileName, setResumeFileName] = useState('');
  const [prefilledFields, setPrefilledFields] = useState<string[]>([]);
  const [form, setForm] = useState({
    name: '', email: '', linkedin: '', phone: '',
    university: '', degree: '', graduation_date: '', gpa: '', honors: '', minors: '',
    target_roles: '', target_cities: '', notes: '',
    resume_text: '',
  });

  const stepIdx = STEPS.indexOf(step);
  const isLast = step === 'background';

  function set(field: keyof typeof form, value: string) {
    setForm(p => ({ ...p, [field]: value }));
    setError('');
  }

  // Shared by both the file-upload and paste-text paths so pasting gets the
  // same "pull my info from it" prefill the resume step's hint text promises
  // — `overwriteText` is off for paste, since the user can already see their
  // typed text and a silent rewrite after blur would feel like a mutation;
  // for an uploaded file there's no "original visible text" to preserve.
  async function extractAndApply(file: File, overwriteText: boolean): Promise<boolean> {
    setError('');
    setParsingFile(true);
    setPrefilledFields([]);
    try {
      const { text, profile } = await extractResumeText(file);
      const filled: string[] = [];
      const merged: Partial<typeof form> = overwriteText ? { resume_text: text } : {};
      const apply = (key: keyof typeof form, label: string, value?: string) => {
        if (value?.trim() && !form[key].trim()) { merged[key] = value.trim(); filled.push(label); }
      };
      apply('name', 'Name', profile?.name);
      apply('email', 'Email', profile?.email);
      apply('linkedin', 'LinkedIn', profile?.linkedin);
      apply('phone', 'Phone', profile?.phone);
      apply('university', 'University', profile?.university);
      apply('degree', 'Degree', profile?.degree);
      apply('graduation_date', 'Graduation date', profile?.graduation_date);
      apply('gpa', 'GPA', profile?.gpa);
      apply('honors', 'Honors', profile?.honors);
      apply('minors', 'Minors', profile?.minors);
      apply('target_roles', 'Target roles', profile?.target_roles);
      setForm(p => ({ ...p, ...merged }));
      setPrefilledFields(filled);
      setParsingFile(false);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that.');
      setParsingFile(false);
      return false;
    }
  }

  async function handleResumeFile(file: File | undefined) {
    if (!file) return;
    setResumeFileName(file.name);
    const ok = await extractAndApply(file, true);
    if (!ok) setResumeFileName('');
  }

  const lastExtractedPasteRef = useRef('');
  async function handlePastedTextBlur() {
    const text = form.resume_text.trim();
    if (text.length < 40 || text === lastExtractedPasteRef.current) return;
    lastExtractedPasteRef.current = text;
    await extractAndApply(new File([text], 'pasted-resume.txt', { type: 'text/plain' }), false);
  }

  function validate(): string {
    if (step === 'identity' && !form.name.trim()) return 'Name is required.';
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
      saveUser(userId);
      localStorage.setItem('cid_display_name', form.name.trim());

      // Create profile in DB
      await fetch('/api/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
        },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          linkedin: form.linkedin.trim(),
          phone: form.phone.trim(),
          university: form.university.trim(),
          degree: form.degree.trim(),
          graduation_date: form.graduation_date.trim(),
          gpa: form.gpa.trim(),
          honors: form.honors.trim(),
          minors: form.minors.trim(),
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
          },
          body: JSON.stringify({ raw_text: form.resume_text.trim() }),
        });
      }

      router.replace('/');
    } catch {
      setError('Something went wrong saving your profile. Please try again.');
      setSaving(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px', boxSizing: 'border-box',
    }}>
      <div style={{ width: '100%', maxWidth: '520px' }}>

        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h1 className="prompt" style={{ color: 'var(--text)', fontSize: '22px', fontWeight: 700, margin: 0, letterSpacing: '-0.02em', justifyContent: 'center', display: 'flex' }}>
            jobs<span style={{ color: 'var(--accent)' }}>_</span>
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '6px 0 0' }}>
            Your job tracker, set up in under a minute
          </p>
        </div>

        {/* Progress bar */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '32px' }}>
          {STEPS.map((s, i) => (
            <div key={s} style={{
              flex: 1, height: '3px', borderRadius: '2px',
              background: i <= stepIdx ? 'var(--accent)' : 'var(--border)',
              transition: 'background 0.3s ease',
            }} />
          ))}
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: 'var(--r-lg)',
          padding: '32px 28px',
        }}>
          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ color: 'var(--text)', fontSize: '17px', fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.01em' }}>
              {STEP_META[step].label}
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: 0 }}>
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
                  onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
              </div>
              <div>
                <label style={LABEL}>Email (optional)</label>
                <input value={form.email} onChange={e => set('email', e.target.value)}
                  placeholder="alex@example.com" type="email" style={INPUT}
                  onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
              </div>
              <div>
                <label style={LABEL}>LinkedIn URL (optional)</label>
                <input value={form.linkedin} onChange={e => set('linkedin', e.target.value)}
                  placeholder="linkedin.com/in/yourname" style={INPUT}
                  onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
              </div>
              <p style={{ color: 'var(--text-dim)', fontSize: '11px', margin: 0, lineHeight: 1.5 }}>
                Email and LinkedIn are only used to sign your generated cover letters — skip them if you&apos;d rather add that yourself.
              </p>
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
                    onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                    onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
                </div>
                <div>
                  <label style={LABEL}>Graduation date</label>
                  <input value={form.graduation_date} onChange={e => set('graduation_date', e.target.value)}
                    placeholder="May 2027" style={INPUT}
                    onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                    onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
                </div>
              </div>
              <div>
                <label style={LABEL}>Degree / Major</label>
                <input value={form.degree} onChange={e => set('degree', e.target.value)}
                  placeholder="BS Computer Science" style={INPUT}
                  onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
              </div>
              <div>
                <label style={LABEL}>Target roles</label>
                <input value={form.target_roles} onChange={e => set('target_roles', e.target.value)}
                  placeholder="Software Engineer, PM, Data Analyst" style={INPUT}
                  onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
              </div>
              <div>
                <label style={LABEL}>Target cities / locations</label>
                <input value={form.target_cities} onChange={e => set('target_cities', e.target.value)}
                  placeholder="New York, San Francisco, Remote" style={INPUT}
                  onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
              </div>
              <div>
                <label style={LABEL}>Anything else the AI should know</label>
                <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
                  placeholder="e.g. 'Remote only for internships, open to relocation full-time. Strong interest in fintech.'"
                  rows={3} style={{ ...INPUT, resize: 'vertical' }}
                  onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
              </div>
            </div>
          )}

          {/* ── Step: resume ── */}
          {step === 'resume' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <input
                  id="resume-file-input"
                  type="file"
                  accept=".pdf,.docx,.txt,.jpg,.jpeg,.png,.webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,image/*"
                  style={{ display: 'none' }}
                  onChange={e => handleResumeFile(e.target.files?.[0])}
                />
                <label htmlFor="resume-file-input" style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  border: '1px dashed var(--border-hi)', borderRadius: 'var(--r-lg)',
                  padding: '16px', cursor: parsingFile ? 'wait' : 'pointer',
                  color: parsingFile ? 'var(--text-muted)' : 'var(--accent)',
                  fontSize: '13px', fontWeight: 600, textAlign: 'center',
                  background: 'var(--surface)', transition: 'border-color 0.15s, background 0.15s',
                  overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                }}>
                  {parsingFile
                    ? `Reading ${resumeFileName}…`
                    : resumeFileName
                      ? <><Check size={14} /> {resumeFileName} — click to replace</>
                      : <><FileText size={14} /> Upload resume/CV (PDF, Word, or photo)</>}
                </label>
              </div>

              {prefilledFields.length > 0 && (
                <div style={{
                  background: 'var(--success-bg)', border: '1px solid var(--success-bg)',
                  borderRadius: 'var(--r)', padding: '9px 12px', color: 'var(--success)', fontSize: '11px', lineHeight: 1.5,
                  display: 'flex', alignItems: 'flex-start', gap: '6px',
                }}>
                  <Check size={13} style={{ flexShrink: 0, marginTop: '1px' }} />
                  <span>Pulled into your profile: {prefilledFields.join(', ')} — you&apos;ll get a chance to review next.</span>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
                <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>or paste plain text</span>
                <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
              </div>

              <textarea value={form.resume_text} onChange={e => { set('resume_text', e.target.value); setResumeFileName(''); }}
                placeholder={`Paste your resume as plain text here...\n\nEXAMPLE:\n\nAlex Johnson\nalexj@email.com | linkedin.com/in/alexj\n\nEDUCATION\nUniversity of Miami — BS Computer Science, May 2027\nGPA: 3.8/4.0\n\nEXPERIENCE\nSoftware Engineering Intern — Acme Corp (Summer 2024)\n- Built REST APIs serving 10k+ daily users\n- Reduced query latency by 40% via index optimization\n\nSKILLS\nPython, TypeScript, React, PostgreSQL, AWS`}
                rows={12} style={{ ...INPUT, resize: 'vertical', fontSize: '12px', lineHeight: 1.6 }}
                onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                onBlur={e => { e.target.style.borderColor = 'var(--border)'; handlePastedTextBlur(); }} />
              {parsingFile && !resumeFileName && (
                <div style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FileText size={12} /> Pulling your info from this…
                </div>
              )}
              <p style={{ color: 'var(--text-muted)', fontSize: '11px', margin: 0 }}>
                Optional but strongly recommended — enables tailored cover letters, gap analysis, and personalized coaching. We&apos;ll use it to pre-fill the next two steps; you can always adjust afterward.
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{
              marginTop: '16px', padding: '10px 14px', borderRadius: 'var(--r)',
              background: 'var(--danger-bg)', border: '1px solid var(--danger-bg)',
              color: 'var(--danger)', fontSize: '12px',
            }}>{error}</div>
          )}

          {/* Navigation */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '28px' }}>
            <button
              onClick={() => stepIdx > 0 && setStep(STEPS[stepIdx - 1])}
              disabled={stepIdx === 0}
              style={{
                background: 'transparent', border: 'none', color: stepIdx === 0 ? 'var(--border)' : 'var(--text-muted)',
                fontSize: '13px', cursor: stepIdx === 0 ? 'default' : 'pointer', padding: '8px 0', fontFamily: 'inherit',
              }}>
              ← Back
            </button>

            <button onClick={advance} disabled={saving} style={{
              background: saving ? 'var(--border-dim)' : 'var(--accent)',
              color: saving ? 'var(--border-hi)' : '#0A0A0A',
              border: saving ? '1px solid var(--border)' : '1px solid var(--accent)', borderRadius: 'var(--r-lg)',
              padding: '10px 24px', fontSize: '13px', fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              letterSpacing: '0.02em', transition: 'all 0.15s',
            }}>
              {saving ? 'Setting up…' : isLast ? 'Launch →' : `Next →`}
            </button>
          </div>
        </div>

        {/* Footer note */}
        <p style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: '11px', marginTop: '20px' }}>
          Open source · No account required · AI included free
        </p>
      </div>
    </div>
  );
}
