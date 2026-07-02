'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Briefcase, Sparkles, MessageSquare, ArrowRight, Loader } from 'lucide-react';
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

export default function WelcomePage() {
  const router = useRouter();
  const [showCode, setShowCode] = useState(false);
  const [error, setError] = useState('');
  const [syncCode, setSyncCode] = useState('');
  const [syncing, setSyncing] = useState(false);

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
      saveUser(data.user_id);
      localStorage.setItem('cid_display_name', data.display_name || '');
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not redeem code.');
    }
    setSyncing(false);
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

        {!showCode ? (
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
          </>
        ) : (
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
            <p style={{ color: 'var(--text-dim)', fontSize: '11px', margin: 0, lineHeight: 1.5 }}>
              The sync code temporarily stores your user ID server-side for up to 10 minutes to complete the transfer, then it&apos;s automatically deleted.
            </p>
          </div>

        )}

        <p style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: '11px', marginTop: '20px' }}>
          <a href="https://github.com/moff05/career-dashboard" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>Open source</a> · No account required · <Link href="/extension" style={{ color: 'inherit', textDecoration: 'underline' }}>Chrome extension</Link>
        </p>
      </div>
    </div>
  );
}
