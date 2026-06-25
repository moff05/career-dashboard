'use client';

import { useState, useRef } from 'react';
import { MessageCircle, X, ImageIcon, Send, Loader } from 'lucide-react';

export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [screenshotName, setScreenshotName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setName('');
    setMessage('');
    setScreenshot(null);
    setScreenshotName('');
    setError('');
    setSubmitted(false);
  }

  function close() {
    setOpen(false);
    setTimeout(reset, 300);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setError('Screenshot must be under 2MB'); return; }
    setError('');
    const reader = new FileReader();
    reader.onload = () => {
      setScreenshot(reader.result as string);
      setScreenshotName(file.name);
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit() {
    if (!name.trim()) { setError('Name is required'); return; }
    if (!message.trim()) { setError('Message is required'); return; }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), message: message.trim(), screenshot }),
      });
      if (!res.ok) throw new Error('Failed');
      setSubmitted(true);
      setTimeout(close, 2000);
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        onClick={() => { reset(); setOpen(true); }}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 150,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '9px 14px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '20px',
          color: 'var(--text-muted)',
          fontSize: '12px',
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: 'inherit',
          transition: 'color 0.12s, border-color 0.12s, background 0.12s',
        }}
        onMouseEnter={e => {
          const b = e.currentTarget;
          b.style.color = 'var(--text)';
          b.style.borderColor = 'var(--border-hi)';
          b.style.background = 'var(--surface-2)';
        }}
        onMouseLeave={e => {
          const b = e.currentTarget;
          b.style.color = 'var(--text-muted)';
          b.style.borderColor = 'var(--border)';
          b.style.background = 'var(--surface)';
        }}
        aria-label="Send feedback"
      >
        <MessageCircle size={13} />
        feedback
      </button>

      {open && (
        <>
          <div className="overlay-backdrop" onClick={close} />
          <div
            className="overlay-panel from-bottom"
            style={{
              bottom: 0,
              left: 0,
              right: 0,
              borderRadius: '12px 12px 0 0',
              padding: '24px',
              maxWidth: '480px',
              margin: '0 auto',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text)' }}>
                  <span style={{ color: 'var(--accent)' }}>{'>'}</span> feedback
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '3px' }}>
                  bugs, ideas, anything — all appreciated
                </div>
              </div>
              <button
                onClick={close}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: '2px', lineHeight: 1 }}
              >
                <X size={15} />
              </button>
            </div>

            {submitted ? (
              <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--success)', fontSize: '14px', fontWeight: 600 }}>
                ✓ sent. thanks!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <input
                  className="field-input"
                  placeholder="your name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  style={{ width: '100%' }}
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
                />

                <textarea
                  className="field-input"
                  placeholder="what's up? bug, feature idea, general thoughts..."
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  rows={4}
                  style={{ width: '100%', resize: 'vertical', lineHeight: '1.5' }}
                />

                <div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFile}
                    style={{ display: 'none' }}
                  />
                  {screenshot ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                      <span style={{ color: 'var(--success)' }}>✓</span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {screenshotName}
                      </span>
                      <button
                        onClick={() => { setScreenshot(null); setScreenshotName(''); if (fileRef.current) fileRef.current.value = ''; }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: '2px', lineHeight: 1 }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => fileRef.current?.click()}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: '12px', padding: 0, fontFamily: 'inherit' }}
                    >
                      <ImageIcon size={13} />
                      attach screenshot (optional)
                    </button>
                  )}
                </div>

                {error && (
                  <div style={{ fontSize: '12px', color: 'var(--danger)' }}>{error}</div>
                )}

                <button
                  className="btn-primary"
                  onClick={handleSubmit}
                  disabled={submitting}
                  style={{ width: '100%', justifyContent: 'center', marginTop: '2px' }}
                >
                  {submitting
                    ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} />
                    : <Send size={13} />}
                  {submitting ? 'sending...' : 'send'}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
