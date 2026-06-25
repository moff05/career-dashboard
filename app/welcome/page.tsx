'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Briefcase, Sparkles, MessageSquare, ArrowRight, Upload, Loader } from 'lucide-react';
import { saveUser } from '@/app/hooks/useUser';

const FEATURES = [
  { icon: Briefcase, title: 'Import a job, get a real score', desc: 'Paste a link or just the job description — it gets parsed and scored against your resume, 5 categories, no false hope.' },
  { icon: Sparkles, title: 'Cover letters, gaps, bullets', desc: 'Generated from your actual resume for each specific job, right in the tracker — no separate tool to open.' },
  { icon: MessageSquare, title: 'A coach that knows you', desc: 'Chat about your search, interview prep, or outreach — it has your resume, memory, and tracked jobs in context.' },
];

const INPUT: React.CSSProperties = {
  width: '100%', background: 'var(--surface)',
  border: '1px solid var(--border)', borderRadius: 'var(--r-lg)',
  padding: '11px 14px', color: 'var(--text)', fontSize: '14px',
  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
};

const LABEL: React.CSSProperties = {
  display: 'block', color: 'var(--text-muted)', fontSize: '11px',
  fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '6px',
};

function generateUserId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 11);
}

export default function WelcomePage() {
  const router = useRouter();
  const [showRestore, setShowRestore] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileText, setFileText] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState('');
  const [syncCode, setSyncCode] = useState('');
  const [syncing, setSyncing] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError('');
    setFileName(file.name);
    setFileText(await file.text());
  }

  async function handleSync() {
    setError('');
    const clean = syncCode.replace(/\D/g, '');
    if (clean.length !== 6) return setError('Enter the full 6-digit code.');
    setSyncing(true);
    try {
      const res = await fetch('/api/device-code/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: clean }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Code not found.');
      saveUser(data.user_id, data.api_key || '');
      localStorage.setItem('cid_display_name', data.display_name || '');
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not redeem code.');
    }
    setSyncing(false);
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
          <h1 className="prompt" style={{ color: 'var(--text)', fontSize: '26px', fontWeight: 700, margin: 0, letterSpacing: '-0.02em', justifyContent: 'center', display: 'flex' }}>
            jobs<span style={{ color: 'var(--accent)' }}>_</span>
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: '8px 0 0', lineHeight: 1.6 }}>
            A job tracker that feels like a spreadsheet, with two AI features that earn their place.
          </p>
        </div>

        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: 'var(--r-lg)',
          padding: '28px', display: 'flex', flexDirection: 'column', gap: '18px', marginBottom: '24px',
        }}>
          {FEATURES.map(f => (
            <div key={f.title} style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: 'var(--r)', flexShrink: 0,
                background: 'var(--border-dim)', border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <f.icon size={15} color="var(--accent)" />
              </div>
              <div>
                <div style={{ color: 'var(--text)', fontSize: '14px', fontWeight: 700, marginBottom: '3px' }}>{f.title}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.55 }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-lg)', padding: '14px 16px', marginBottom: '24px',
          color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.6,
        }}>
          No accounts, no signup. You bring your own free Anthropic API key (typical cost: a few cents a day), and everything stays in your browser — nothing is stored on a server you don&apos;t control.
        </div>

        {!showRestore && !showCode ? (
          <>
            <Link href="/setup" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              background: 'var(--accent)',
              color: '#0A0A0A', border: '1px solid var(--accent)', borderRadius: 'var(--r-lg)',
              padding: '14px 24px', fontSize: '14px', fontWeight: 700, textDecoration: 'none',
            }}>
              Get Started <ArrowRight size={15} />
            </Link>

            <button onClick={() => { setShowCode(true); setError(''); }} style={{
              display: 'block', width: '100%', textAlign: 'center', marginTop: '16px',
              background: 'none', border: 'none', color: 'var(--text-muted)',
              fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', padding: '4px',
            }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
              Have a sync code? Enter it here
            </button>

            <button onClick={() => { setShowRestore(true); setError(''); }} style={{
              display: 'block', width: '100%', textAlign: 'center', marginTop: '8px',
              background: 'none', border: 'none', color: 'var(--text-dim)',
              fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit', padding: '4px',
            }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-muted)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-dim)')}>
              Already have a backup? Restore it instead
            </button>
          </>
        ) : showCode ? (
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)', borderRadius: 'var(--r-lg)',
            padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px',
          }}>
            <div>
              <label style={LABEL}>Sync code</label>
              <input
                value={syncCode}
                onChange={e => { setSyncCode(e.target.value); setError(''); }}
                placeholder="000-000"
                maxLength={7}
                style={{ ...INPUT, fontSize: '22px', letterSpacing: '0.12em', textAlign: 'center' }}
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') handleSync(); }}
              />
            </div>

            {error && (
              <div style={{ padding: '10px 14px', borderRadius: 'var(--r)', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', color: 'var(--danger)', fontSize: '12px' }}>{error}</div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={handleSync} disabled={syncing} style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                background: 'var(--accent)', color: '#0A0A0A',
                border: 'none', borderRadius: 'var(--r-lg)',
                padding: '12px 20px', fontSize: '13px', fontWeight: 700,
                cursor: syncing ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: syncing ? 0.7 : 1,
              }}>
                {syncing ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                {syncing ? 'Syncing…' : 'Connect'}
              </button>
              <button onClick={() => { setShowCode(false); setError(''); setSyncCode(''); }} disabled={syncing} style={{
                background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)',
                borderRadius: 'var(--r-lg)', padding: '12px 18px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit',
              }}>Cancel</button>
            </div>
          </div>

        ) : (
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)', borderRadius: 'var(--r-lg)',
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
                border: '1px dashed var(--border-hi)', borderRadius: 'var(--r-lg)',
                padding: '14px', cursor: 'pointer', color: 'var(--accent)',
                fontSize: '13px', fontWeight: 600, textAlign: 'center',
                background: 'var(--surface)',
                overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
              }}>
                {fileName ? <>✓ {fileName} — click to replace</> : <><Upload size={14} /> Choose your career-dashboard-backup-*.json file</>}
              </label>
            </div>

            {error && (
              <div style={{
                padding: '10px 14px', borderRadius: 'var(--r)',
                background: 'var(--danger-bg)', border: '1px solid var(--danger-bg)',
                color: 'var(--danger)', fontSize: '12px',
              }}>{error}</div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
              <button onClick={handleRestore} disabled={restoring} style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                background: restoring ? 'var(--border-dim)' : 'var(--accent-bg)',
                color: restoring ? 'var(--border-hi)' : 'var(--accent)',
                border: '1px solid var(--accent-dim)', borderRadius: 'var(--r-lg)',
                padding: '12px 20px', fontSize: '13px', fontWeight: 700,
                cursor: restoring ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              }}>
                {restoring ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                {restoring ? 'Restoring…' : 'Restore my data'}
              </button>
              <button onClick={() => { setShowRestore(false); setError(''); }} disabled={restoring} style={{
                background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)',
                borderRadius: 'var(--r-lg)', padding: '12px 18px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit',
              }}>Cancel</button>
            </div>
          </div>
        )}

        <p style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: '11px', marginTop: '20px' }}>
          Open source · Your data stays with you
        </p>
      </div>
    </div>
  );
}
