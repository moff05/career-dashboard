'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { apiFetch } from '@/lib/apiFetch';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Send, Loader, X, Plus, Maximize2, Minimize2, MessageSquare, Trash2 } from 'lucide-react';
import { useOverlays } from '@/app/OverlayContext';

interface Message {
  id?: number;
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
}

const GREETING: Message = {
  role: 'assistant',
  content: "Hi, I'm your AI career coach. I have your full resume, saved memories, and job tracker context. What's on your mind?",
};

interface Session { session_id: string; last_at: string; message_count: number; title: string | null; }

function relTime(iso: string): string {
  const t = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z').getTime();
  if (isNaN(t)) return '';
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days < 30 ? `${days}d ago` : new Date(t).toLocaleDateString();
}

const QUICK_ACTIONS = [
  { label: 'What should I apply to?', text: 'Based on my background and saved jobs, what should I prioritize applying to right now?' },
  { label: 'Interview prep', text: 'I have an upcoming interview. Help me prepare with likely questions and strong answers based on my background.' },
  { label: 'Cold outreach', text: "Help me write a cold outreach email to a recruiter at a company I'm interested in." },
];

export function CoachPanel() {
  const { coachOpen, closeCoach, coachPrefill } = useOverlays();
  // This id never expired or rotated on its own before 2026-09-29 — it was
  // generated once per browser on first open and stuck around in
  // localStorage forever, so every message ever sent kept piling into one
  // never-ending thread with no way to start over. startNewChat() below is
  // the fix: swaps in a fresh id, which is all a "new chat" needs to be —
  // old messages aren't deleted, just no longer the active thread (there's
  // no UI to browse past threads, by design; the Memory tab is what
  // actually needs to persist across chats, not the raw transcript).
  const [sessionId, setSessionId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('coach-session-id');
      if (stored) return stored;
      const id = crypto.randomUUID();
      localStorage.setItem('coach-session-id', id);
      return id;
    }
    return 'default';
  });
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [expanded, setExpanded] = useState<boolean>(() => {
    try { return typeof window !== 'undefined' && localStorage.getItem('coach-expanded') === '1'; } catch { return false; }
  });
  const [isWide, setIsWide] = useState(true);
  const [showList, setShowList] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(() => { if (coachOpen) scrollToBottom(); }, [messages, coachOpen]);

  const loadHistory = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/chat/history?session_id=${sessionId}`);
      const data = await res.json();
      setMessages(data?.length > 0 ? data : [GREETING]);
    } catch {
      setMessages([GREETING]);
    }
    setHistoryLoaded(true);
  }, [sessionId]);

  useEffect(() => { if (coachOpen && !historyLoaded) loadHistory(); }, [coachOpen, historyLoaded, loadHistory]);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 760px)');
    const update = () => setIsWide(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const toggleExpanded = () => {
    setExpanded(v => {
      try { localStorage.setItem('coach-expanded', v ? '0' : '1'); } catch { /* ignore */ }
      return !v;
    });
  };

  const loadSessions = useCallback(async () => {
    try {
      const res = await apiFetch('/api/chat/sessions');
      const data = await res.json();
      if (Array.isArray(data)) setSessions(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { if (coachOpen) loadSessions(); }, [coachOpen, loadSessions]);
  // Refresh the list after each finished response so titles/ordering stay current.
  useEffect(() => { if (coachOpen && !loading && historyLoaded) loadSessions(); }, [loading, coachOpen, historyLoaded, loadSessions]);

  const switchSession = (id: string) => {
    if (id === sessionId || loading) { setShowList(false); return; }
    localStorage.setItem('coach-session-id', id);
    setSessionId(id);
    setHistoryLoaded(false); // loadHistory re-runs for the new id
    setShowList(false);
  };

  const deleteSession = async (id: string) => {
    if (loading) return;
    try { await apiFetch(`/api/chat/sessions?session_id=${id}`, { method: 'DELETE' }); } catch { /* ignore */ }
    setSessions(prev => prev.filter(x => x.session_id !== id));
    if (id === sessionId) startNewChat();
  };

  // New session id, no API call needed — a fresh id has no history yet by
  // definition, same end state loadHistory() would reach on an empty result.
  const startNewChat = () => {
    const id = crypto.randomUUID();
    localStorage.setItem('coach-session-id', id);
    setSessionId(id);
    setMessages([GREETING]);
    setShowList(false);
  };

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

  const sidebarInline = expanded && isWide;
  const showingList = showList && !sidebarInline;
  const iconBtn: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--r)', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', cursor: 'pointer' };
  const column: React.CSSProperties = { width: '100%', maxWidth: '760px', margin: '0 auto' };

  const sessionList = (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
      <div style={{ padding: '12px', flexShrink: 0 }}>
        <button onClick={startNewChat} className="chip" style={{ width: '100%', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '6px', padding: '8px' }}>
          <Plus size={13} /> New chat
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 12px' }}>
        {sessions.length === 0 && <p style={{ color: 'var(--text-dim)', fontSize: '12px', padding: '8px 10px' }}>No past chats yet.</p>}
        {sessions.map(x => {
          const active = x.session_id === sessionId;
          return (
            <div key={x.session_id} onClick={() => switchSession(x.session_id)} className="coach-session"
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 10px', borderRadius: 'var(--r)', cursor: 'pointer', background: active ? 'var(--surface-2)' : 'transparent', borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent', marginBottom: '2px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '12px', color: active ? 'var(--text)' : 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.title || 'New chat'}</div>
                <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '2px' }}>{relTime(x.last_at)} · {x.message_count} msg</div>
              </div>
              <button onClick={e => { e.stopPropagation(); deleteSession(x.session_id); }} aria-label="Delete chat" title="Delete chat"
                style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '4px', display: 'flex' }}>
                <Trash2 size={12} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      <div className="overlay-backdrop" onClick={closeCoach} />
      <div className="overlay-panel from-right" style={expanded
        ? { inset: 0, width: '100vw', display: 'flex', flexDirection: 'row' }
        : { top: 0, right: 0, bottom: 0, width: 'min(760px, 100vw)', display: 'flex', flexDirection: 'row' }}>

        {sidebarInline && (
          <div style={{ width: '270px', flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--surface)' }}>
            <div style={{ padding: '16px 16px 4px', color: 'var(--text-dim)', fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Chats</div>
            {sessionList}
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', ...(expanded ? column : {}) }}>
              <div>
                <h1 style={{ color: 'var(--text)', fontSize: '15px', fontWeight: 700, margin: 0 }}>{showingList ? 'Chats' : 'Coach'}</h1>
                <p style={{ color: 'var(--text-muted)', fontSize: '11px', margin: '2px 0 0' }}>{showingList ? 'Pick up a past conversation' : 'Knows your resume, memory, and tracked jobs'}</p>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {!sidebarInline && (
                  <button onClick={() => setShowList(v => !v)} title="Past chats" aria-label="Past chats" style={{ ...iconBtn, color: showingList ? 'var(--accent)' : 'var(--text-muted)' }}>
                    <MessageSquare size={14} />
                  </button>
                )}
                <button onClick={startNewChat} title="Start a new chat" aria-label="New chat" style={iconBtn}><Plus size={14} /></button>
                {isWide && (
                  <button onClick={toggleExpanded} title={expanded ? 'Exit full screen' : 'Full screen'} aria-label={expanded ? 'Exit full screen' : 'Full screen'} style={iconBtn}>
                    {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                  </button>
                )}
                <button onClick={closeCoach} aria-label="Close" style={iconBtn}><X size={14} /></button>
              </div>
            </div>
          </div>

          {showingList ? sessionList : (
            <>
              <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px' }}>
                <div style={{ ...column, display: 'flex', flexDirection: 'column', gap: '22px' }}>
                  {!historyLoaded && <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px', fontSize: '12px' }}>Loading…</div>}
                  {historyLoaded && messages.length <= 1 && messages[0]?.role === 'assistant' && !loading && (
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {QUICK_ACTIONS.map(({ label, text }) => (
                        <button key={label} onClick={() => setQuickAction(text)} className="chip">{label}</button>
                      ))}
                    </div>
                  )}
                  {historyLoaded && messages.map((msg, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: '10px', width: '100%' }}>
                      {msg.role === 'assistant' && (
                        <div style={{ width: '24px', height: '24px', borderRadius: 'var(--r-sm)', background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', fontSize: '10px', fontWeight: 800, flexShrink: 0, marginTop: '2px' }}>AI</div>
                      )}
                      <div style={{ maxWidth: msg.role === 'user' ? '80%' : 'calc(100% - 34px)', minWidth: 0, backgroundColor: msg.role === 'user' ? 'var(--surface-2)' : 'transparent', border: msg.role === 'user' ? '1px solid var(--border)' : 'none', borderRadius: 'var(--r)', padding: msg.role === 'user' ? '10px 14px' : '0', fontSize: '13.5px', lineHeight: '1.7', overflowWrap: 'anywhere' }}>
                        {msg.role === 'assistant' ? (
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                            p: ({ children }) => <p style={{ margin: '0 0 12px', color: 'var(--text)' }}>{children}</p>,
                            strong: ({ children }) => <strong style={{ color: 'var(--text)', fontWeight: 700 }}>{children}</strong>,
                            ul: ({ children }) => <ul style={{ margin: '8px 0 12px', paddingLeft: '20px', color: 'var(--text)' }}>{children}</ul>,
                            ol: ({ children }) => <ol style={{ margin: '8px 0 12px', paddingLeft: '20px', color: 'var(--text)' }}>{children}</ol>,
                            li: ({ children }) => <li style={{ margin: '5px 0', color: 'var(--text)' }}>{children}</li>,
                            h1: ({ children }) => <h1 style={{ color: 'var(--text)', fontSize: '15px', fontWeight: 700, margin: '16px 0 8px' }}>{children}</h1>,
                            h2: ({ children }) => <h2 style={{ color: 'var(--text)', fontSize: '14px', fontWeight: 700, margin: '14px 0 6px' }}>{children}</h2>,
                            h3: ({ children }) => <h3 style={{ color: 'var(--text)', fontSize: '13.5px', fontWeight: 700, margin: '12px 0 5px' }}>{children}</h3>,
                            code: ({ children }) => <code style={{ background: 'var(--surface)', color: 'var(--accent)', padding: '1px 5px', borderRadius: 'var(--r-sm)', fontSize: '12px', border: '1px solid var(--border)' }}>{children}</code>,
                            blockquote: ({ children }) => <blockquote style={{ borderLeft: '2px solid var(--border-hi)', paddingLeft: '12px', margin: '8px 0', color: 'var(--text-muted)' }}>{children}</blockquote>,
                            table: ({ children }) => <div style={{ overflowX: 'auto', margin: '8px 0 12px' }}><table style={{ borderCollapse: 'collapse', fontSize: '12.5px' }}>{children}</table></div>,
                            th: ({ children }) => <th style={{ border: '1px solid var(--border)', padding: '5px 10px', textAlign: 'left', color: 'var(--text)' }}>{children}</th>,
                            td: ({ children }) => <td style={{ border: '1px solid var(--border)', padding: '5px 10px', color: 'var(--text-muted)' }}>{children}</td>,
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
                      <Loader size={14} color="var(--text-muted)" style={{ marginTop: '5px', marginLeft: '34px', animation: 'spin 1s linear infinite' }} />
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </div>

              <div style={{ padding: '12px 20px 16px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
                <div style={column}>
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
                  <p style={{ color: 'var(--text-dim)', fontSize: '11px', margin: '7px 0 0', textAlign: 'center' }}>Enter to send · Shift+Enter for new line</p>
                  {messages.length >= 45 && (
                    <p style={{ color: 'var(--text-dim)', fontSize: '11px', margin: '4px 0 0', textAlign: 'center', opacity: 0.6 }}>Older messages have left Coach&apos;s active context. Start a new chat for a fresh thread.</p>
                  )}
                </div>
              </div>
            </>
          )}
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
