'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Briefcase, Sparkles, Search, MessageSquare, ArrowRight, Upload, Loader } from 'lucide-react';
import { saveUser } from '@/app/hooks/useUser';

const FEATURES = [
  { icon: Briefcase, title: 'Track applications', desc: 'Paste a job URL and it gets parsed into your tracker automatically — company, role, deadline, full description.' },
  { icon: Sparkles, title: 'AI-tailored everything', desc: 'Cover letters, fit gaps, and resume bullets generated from your actual resume for each specific job.' },
  { icon: Search, title: 'Real job leads', desc: 'Hunt Agent searches live job boards and only ever shows postings with a real, working link.' },
  { icon: MessageSquare, title: 'Coach + mock interviews', desc: 'Chat with an AI that remembers your background, or run a 5-question mock interview before the real one.' },
];

const INPUT: React.CSSProperties = {
  width: '100%', background: 'rgba(125,220,255,0.06)', backdropFilter: 'blur(12px)',
  border: '1px solid rgba(125,220,255,0.18)', borderRadius: '10px',
  padding: '11px 14px', color: 'rgba(232,244,255,0.95)', fontSize: '14px',
  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
};

const LABEL: React.CSSProperties = {
  display: 'block', color: 'rgba(158,202,242,0.75)', fontSize: '11px',
  fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '6px',
};

function generateUserId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 11);
}

export default function WelcomePage() {
  const router = useRouter();
  const [showRestore, setShowRestore] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileText, setFileText] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState('');

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError('');
    setFileName(file.name);
    setFileText(await file.text());
  }

  async function handleRestore() {
    setError('');
    if (!apiKey.trim()) return setError('API key is required.');
    if (!apiKey.startsWith('sk-ant-')) return setError('That doesn\'t look like an Anthropic API key (should start with sk-ant-).');
    if (!fileText) return setError('Choose a backup file first.');

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(fileText);
    } catch {
      return setError('That file isn\'t valid JSON — choose the .json file from "Export my data".');
    }

    setRestoring(true);
    try {
      const userId = generateUserId();
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId, 'x-api-key': apiKey.trim() },
        body: JSON.stringify(parsed),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Restore failed.');

      // Only persist the new identity once the import actually succeeded —
      // otherwise a failed restore would leave a valid-looking but empty
      // account behind.
      saveUser(userId, apiKey.trim());
      const profileRows = parsed.profile;
      const profileRow = (Array.isArray(profileRows) ? profileRows[0] : profileRows) as { name?: string } | undefined;
      localStorage.setItem('cid_display_name', profileRow?.name?.trim() || '');

      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That file could not be restored.');
    }
    setRestoring(false);
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px', boxSizing: 'border-box',
    }}>
      <div style={{ width: '100%', maxWidth: '640px' }}>

        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <div className="brand-orb" style={{ margin: '0 auto 16px' }}>
            <div className="brand-orb-halo" />
            <div className="brand-orb-ring-outer" />
            <div className="brand-orb-ring-mid" />
            <div className="brand-orb-ring-inner" />
            <div className="brand-orb-core" />
          </div>
          <h1 style={{ color: 'rgba(232,244,255,0.95)', fontSize: '26px', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
            Career Dashboard
          </h1>
          <p style={{ color: 'rgba(170,205,235,0.80)', fontSize: '14px', margin: '8px 0 0', lineHeight: 1.6 }}>
            An AI-powered job search command center — built for students applying to internships and new-grad roles.
          </p>
        </div>

        <div style={{
          background: 'rgba(125,220,255,0.055)', backdropFilter: 'blur(24px)',
          border: '1px solid rgba(125,220,255,0.14)', borderRadius: '18px',
          padding: '28px', display: 'flex', flexDirection: 'column', gap: '18px', marginBottom: '24px',
        }}>
          {FEATURES.map(f => (
            <div key={f.title} style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '8px', flexShrink: 0,
                background: 'rgba(125,220,255,0.08)', border: '1px solid rgba(125,220,255,0.16)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <f.icon size={15} color="#7DF4FC" />
              </div>
              <div>
                <div style={{ color: 'rgba(232,244,255,0.95)', fontSize: '14px', fontWeight: 700, marginBottom: '3px' }}>{f.title}</div>
                <div style={{ color: 'rgba(170,205,235,0.80)', fontSize: '12px', lineHeight: 1.55 }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{
          background: 'rgba(125,220,255,0.04)', border: '1px solid rgba(125,220,255,0.10)',
          borderRadius: '10px', padding: '14px 16px', marginBottom: '24px',
          color: 'rgba(158,202,242,0.72)', fontSize: '12px', lineHeight: 1.6,
        }}>
          No accounts, no signup. You bring your own free Anthropic API key (typical cost: a few cents a day), and everything stays in your browser — nothing is stored on a server you don&apos;t control.
        </div>

        {!showRestore ? (
          <>
            <Link href="/setup" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              background: 'linear-gradient(135deg, rgba(74,158,248,0.3), rgba(125,244,252,0.22))',
              color: '#7DF4FC', border: '1px solid rgba(125,244,252,0.32)', borderRadius: '12px',
              padding: '14px 24px', fontSize: '14px', fontWeight: 700, textDecoration: 'none',
              boxShadow: '0 0 24px -6px rgba(125,244,252,0.35)',
            }}>
              Get Started <ArrowRight size={15} />
            </Link>

            <button onClick={() => setShowRestore(true)} style={{
              display: 'block', width: '100%', textAlign: 'center', marginTop: '16px',
              background: 'none', border: 'none', color: 'rgba(158,202,242,0.65)',
              fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', padding: '4px',
            }}
              onMouseEnter={e => (e.currentTarget.style.color = '#7DF4FC')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(158,202,242,0.65)')}>
              Already have a backup? Restore it instead
            </button>
          </>
        ) : (
          <div style={{
            background: 'rgba(125,220,255,0.055)', backdropFilter: 'blur(24px)',
            border: '1px solid rgba(125,220,255,0.14)', borderRadius: '18px',
            padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px',
          }}>
            <div>
              <label style={LABEL}>Anthropic API key *</label>
              <input value={apiKey} onChange={e => { setApiKey(e.target.value); setError(''); }}
                placeholder="sk-ant-api03-..." type="password" style={INPUT} autoFocus />
            </div>

            <div>
              <label style={LABEL}>Backup file *</label>
              <input id="restore-file-input" type="file" accept="application/json"
                style={{ display: 'none' }} onChange={e => handleFile(e.target.files?.[0])} />
              <label htmlFor="restore-file-input" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                border: '1px dashed rgba(125,220,255,0.32)', borderRadius: '10px',
                padding: '14px', cursor: 'pointer', color: 'rgba(125,244,252,0.85)',
                fontSize: '13px', fontWeight: 600, textAlign: 'center',
                background: 'rgba(125,220,255,0.04)',
                overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
              }}>
                {fileName ? <>✓ {fileName} — click to replace</> : <><Upload size={14} /> Choose your career-dashboard-backup-*.json file</>}
              </label>
            </div>

            {error && (
              <div style={{
                padding: '10px 14px', borderRadius: '8px',
                background: 'rgba(248,100,100,0.10)', border: '1px solid rgba(248,100,100,0.22)',
                color: 'rgba(252,150,150,0.90)', fontSize: '12px',
              }}>{error}</div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
              <button onClick={handleRestore} disabled={restoring} style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                background: restoring ? 'rgba(125,220,255,0.08)' : 'linear-gradient(135deg, rgba(74,158,248,0.3), rgba(125,244,252,0.22))',
                color: restoring ? 'rgba(125,220,255,0.40)' : '#7DF4FC',
                border: '1px solid rgba(125,244,252,0.32)', borderRadius: '10px',
                padding: '12px 20px', fontSize: '13px', fontWeight: 700,
                cursor: restoring ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              }}>
                {restoring ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                {restoring ? 'Restoring…' : 'Restore my data'}
              </button>
              <button onClick={() => { setShowRestore(false); setError(''); }} disabled={restoring} style={{
                background: 'rgba(125,220,255,0.025)', color: 'rgba(158,202,242,0.72)', border: '1px solid rgba(125,220,255,0.13)',
                borderRadius: '10px', padding: '12px 18px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit',
              }}>Cancel</button>
            </div>
          </div>
        )}

        <p style={{ textAlign: 'center', color: 'rgba(125,175,230,0.35)', fontSize: '11px', marginTop: '20px' }}>
          Open source · Your data stays with you
        </p>
      </div>
    </div>
  );
}
