'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { apiFetch } from '@/lib/apiFetch';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Send, Loader, X } from 'lucide-react';
import { useOverlays } from '@/app/OverlayContext';

interface Message {
  id?: number;
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
}

const QUICK_ACTIONS = [
  { label: 'What should I apply to?', text: 'Based on my background and saved jobs, what should I prioritize applying to right now?' },
  { label: 'Interview prep', text: 'I have an upcoming interview. Help me prepare with likely questions and strong answers based on my background.' },
  { label: 'Cold outreach', text: "Help me write a cold outreach email to a recruiter at a company I'm interested in." },
];

export function CoachPanel() {
  const { coachOpen, closeCoach, coachPrefill } = useOverlays();
  const [sessionId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem('coach-session-id');
      if (stored) return stored;
      const id = crypto.randomUUID();
      sessionStorage.setItem('coach-session-id', id);
      return id;
    }
    return 'default';
  });
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(() => { if (coachOpen) scrollToBottom(); }, [messages, coachOpen]);

  const loadHistory = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/chat/history?session_id=${sessionId}`);
      const data = await res.json();
      setMessages(data?.length > 0 ? data : [{
        role: 'assistant',
        content: "Hi, I'm your AI career coach. I have your full resume, saved memories, and job tracker context. What's on your mind?",
      }]);
    } catch {
      setMessages([{ role: 'assistant', content: "Hi, I'm your AI career coach. I have your full resume, saved memories, and job tracker context. What's on your mind?" }]);
    }
    setHistoryLoaded(true);
  }, [sessionId]);

  useEffect(() => { if (coachOpen && !historyLoaded) loadHistory(); }, [coachOpen, historyLoaded, loadHistory]);

  useEffect(() => {
    if (coachOpen && coachPrefill) setQuickAction(coachPrefill);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachOpen, coachPrefill]);

  useEffect(() => {
    if (!coachOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeCoach(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [coachOpen, closeCoach]);

  const handleSend = async (forceText?: string) => {
    const text = (forceText ?? input).trim();
    if (!text || loading) return;
    if (!forceText) { setInput(''); if (textareaRef.current) textareaRef.current.style.height = 'auto'; }
    if (!localStorage.getItem('cid_api_key')) {
      setMessages(prev => [...prev, { role: 'user', content: text }, { role: 'assistant', content: "I need an API key to respond — add one in Profile, then ask again." }]);
      return;
    }
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setLoading(true);
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
    try {
      const res = await apiFetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, session_id: sessionId }) });
      if (!res.body) throw new Error('No stream');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullResponse += decoder.decode(value, { stream: true });
        setMessages(prev => { const u = [...prev]; u[u.length - 1] = { role: 'assistant', content: fullResponse }; return u; });
      }
      setLoading(false);
      try {
        const memRes = await apiFetch('/api/chat/memories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, response: fullResponse, session_id: sessionId }) });
        const memData = await memRes.json();
        if (memData.saved > 0 && memData.memories?.[0]) {
          const snippet = memData.memories[0].content.slice(0, 60);
          setToast(`Memory saved: "${snippet}${snippet.length >= 60 ? '…' : ''}"`);
          setTimeout(() => setToast(''), 4000);
        }
      } catch { /* ignore */ }
    } catch {
      setMessages(prev => { const u = [...prev]; u[u.length - 1] = { role: 'assistant', content: 'Sorry, I hit an error. Please try again.' }; return u; });
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const t = e.target;
    t.style.height = 'auto';
    t.style.height = Math.min(t.scrollHeight, 160) + 'px';
  };

  function setQuickAction(text: string) {
    setInput(text);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + 'px';
      }
    }, 0);
  }

  if (!coachOpen) return null;

  return (
    <>
      <div className="overlay-backdrop" onClick={closeCoach} />
      <div className="overlay-panel from-right" style={{ top: 0, right: 0, bottom: 0, width: 'min(480px, 100vw)', display: 'flex', flexDirection: 'column' }}>

        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div>
              <h1 style={{ color: 'var(--text)', fontSize: '15px', fontWeight: 700, margin: 0 }}>Coach</h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '11px', margin: '2px 0 0' }}>Knows your resume, memory, and tracked jobs</p>
            </div>
            <button onClick={closeCoach} aria-label="Close" style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--r)', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', cursor: 'pointer' }}>
              <X size={14} />
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            {QUICK_ACTIONS.map(({ label, text }) => (
              <button key={label} onClick={() => setQuickAction(text)} className="chip">{label}</button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {!historyLoaded && <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px', fontSize: '12px' }}>Loading…</div>}
          {historyLoaded && messages.map((msg, idx) => (
            <div key={idx} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: '8px', width: '100%' }}>
              {msg.role === 'assistant' && (
                <div style={{ width: '24px', height: '24px', borderRadius: 'var(--r-sm)', background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', fontSize: '10px', fontWeight: 800, flexShrink: 0, marginTop: '2px' }}>AI</div>
              )}
              <div style={{ maxWidth: '88%', backgroundColor: msg.role === 'user' ? 'var(--surface)' : 'transparent', border: msg.role === 'user' ? '1px solid var(--border)' : 'none', borderRadius: msg.role === 'user' ? 'var(--r)' : '0', padding: msg.role === 'user' ? '9px 13px' : '0', fontSize: '13px', lineHeight: '1.6' }}>
                {msg.role === 'assistant' ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                    p: ({ children }) => <p style={{ margin: '0 0 10px', color: 'var(--text-muted)' }}>{children}</p>,
                    strong: ({ children }) => <strong style={{ color: 'var(--text)', fontWeight: 700 }}>{children}</strong>,
                    ul: ({ children }) => <ul style={{ margin: '8px 0', paddingLeft: '18px', color: 'var(--text-muted)' }}>{children}</ul>,
                    ol: ({ children }) => <ol style={{ margin: '8px 0', paddingLeft: '18px', color: 'var(--text-muted)' }}>{children}</ol>,
                    li: ({ children }) => <li style={{ margin: '4px 0', color: 'var(--text-muted)' }}>{children}</li>,
                    h1: ({ children }) => <h1 style={{ color: 'var(--text)', fontSize: '15px', fontWeight: 700, margin: '14px 0 8px' }}>{children}</h1>,
                    h2: ({ children }) => <h2 style={{ color: 'var(--text)', fontSize: '14px', fontWeight: 700, margin: '12px 0 6px' }}>{children}</h2>,
                    h3: ({ children }) => <h3 style={{ color: 'var(--text)', fontSize: '13px', fontWeight: 700, margin: '10px 0 5px' }}>{children}</h3>,
                    code: ({ children }) => <code style={{ background: 'var(--surface)', color: 'var(--accent)', padding: '1px 5px', borderRadius: 'var(--r-sm)', fontSize: '12px', border: '1px solid var(--border)' }}>{children}</code>,
                    blockquote: ({ children }) => <blockquote style={{ borderLeft: '2px solid var(--border-hi)', paddingLeft: '12px', margin: '8px 0', color: 'var(--text-muted)' }}>{children}</blockquote>,
                  }}>
                    {msg.content || (loading && idx === messages.length - 1 ? '…' : '')}
                  </ReactMarkdown>
                ) : (
                  <span style={{ whiteSpace: 'pre-wrap', color: 'var(--text)' }}>{msg.content}</span>
                )}
              </div>
            </div>
          ))}
          {loading && messages[messages.length - 1]?.content === '' && (
            <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
              <div style={{ width: '24px', height: '24px', borderRadius: 'var(--r-sm)', background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', fontSize: '10px', fontWeight: 800, flexShrink: 0 }}>AI</div>
              <Loader size={14} color="var(--text-muted)" style={{ marginTop: '5px', animation: 'spin 1s linear infinite' }} />
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div style={{ padding: '12px 20px 16px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
            <textarea
              ref={textareaRef} value={input} onChange={handleTextareaChange} onKeyDown={handleKeyDown}
              placeholder="Ask your career coach anything…" rows={1}
              className="field-input"
              style={{ flex: 1, resize: 'none', lineHeight: '1.5', minHeight: '40px', maxHeight: '160px', overflow: 'auto' }}
            />
            <button onClick={() => handleSend()} disabled={loading || !input.trim()} className="btn-primary" style={{ width: '40px', height: '40px', padding: 0, justifyContent: 'center', flexShrink: 0 }}>
              <Send size={15} />
            </button>
          </div>
          <p style={{ color: 'var(--text-dim)', fontSize: '10px', margin: '7px 0 0', textAlign: 'center' }}>Enter to send · Shift+Enter for new line</p>
        </div>
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', background: 'var(--surface)', border: '1px solid var(--border-hi)', color: 'var(--text)', padding: '10px 18px', borderRadius: 'var(--r)', fontSize: '12px', zIndex: 600, maxWidth: '400px', textAlign: 'center' }}>
          {toast}
        </div>
      )}
    </>
  );
}
