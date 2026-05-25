'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Send, Loader } from 'lucide-react';

interface Message {
  id?: number;
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
}

export default function CoachPage() {
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => { scrollToBottom(); }, [messages]);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/history?session_id=${sessionId}`);
      const data = await res.json();
      if (data && data.length > 0) {
        setMessages(data);
      } else {
        setMessages([{
          role: 'assistant',
          content: "Hi Nicholas! I'm your AI career coach. I have your full resume, saved memories, and job tracker context. What's on your mind?",
        }]);
      }
    } catch {
      setMessages([{
        role: 'assistant',
        content: "Hi Nicholas! I'm your AI career coach. I have your full resume, saved memories, and job tracker context. What's on your mind?",
      }]);
    }
    setHistoryLoaded(true);
  }, [sessionId]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  useEffect(() => {
    if (!historyLoaded) return;
    const brief = sessionStorage.getItem('coach-score-brief');
    if (!brief) return;
    sessionStorage.removeItem('coach-score-brief');
    try {
      const data = JSON.parse(brief);
      const cats = (data.categories || [])
        .map((c: { name: string; score: number; rationale: string }) =>
          `• ${c.name}: ${c.score}/100 — ${c.rationale}`)
        .join('\n');
      const msg = `Walk me through my fit score for ${data.company} — ${data.title}.\n\nOverall: ${data.total}/100 — ${data.summary}\n\nCategory breakdown:\n${cats}\n\nWhat does this score mean, which gaps should I focus on, and what's my best strategy to improve my chances with this company?`;
      handleSend(msg);
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyLoaded]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('prefill') === 'cover-letter') {
      const company = params.get('company') || '';
      const title = params.get('title') || '';
      const prefillText = `Please write a tailored cover letter for me for this role:\n\nCompany: ${company}\nRole: ${title}\n\nMake it specific to my background in CRE tech and AI automation.`;
      setInput(prefillText);
      window.history.replaceState({}, '', '/coach');
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.style.height = 'auto';
          textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + 'px';
        }
      }, 100);
    }
  }, []);

  const handleSend = async (forceText?: string) => {
    const text = (forceText ?? input).trim();
    if (!text || loading) return;
    if (!forceText) {
      setInput('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    }
    const userMessage: Message = { role: 'user', content: text };
    setMessages(prev => [...prev, userMessage]);
    setLoading(true);
    const assistantPlaceholder: Message = { role: 'assistant', content: '' };
    setMessages(prev => [...prev, assistantPlaceholder]);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, session_id: sessionId }),
      });
      if (!res.body) throw new Error('No stream');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullResponse += chunk;
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: fullResponse };
          return updated;
        });
      }
      setLoading(false);
      try {
        const memRes = await fetch('/api/chat/memories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, response: fullResponse, session_id: sessionId }),
        });
        const memData = await memRes.json();
        if (memData.saved > 0 && memData.memories?.[0]) {
          const snippet = memData.memories[0].content.slice(0, 60);
          setToast(`Memory saved: "${snippet}${snippet.length >= 60 ? '...' : ''}"`);
          setTimeout(() => setToast(''), 4000);
        }
      } catch { /* silently ignore */ }
    } catch (err) {
      console.error('Chat error:', err);
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: 'Sorry, I hit an error. Please try again.' };
        return updated;
      });
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 160) + 'px';
  };

  const setQuickAction = (text: string) => {
    setInput(text);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + 'px';
      }
    }, 0);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#0e1520' }}>

      {/* Header */}
      <div style={{ padding: '18px 32px', borderBottom: '1px solid #1e2e42', backgroundColor: '#0b0e18', flexShrink: 0 }}>
        <h1 style={{ color: '#eaf2ff', fontSize: '15px', fontWeight: 700, margin: '0 0 1px' }}>AI Career Coach</h1>
        <p style={{ color: '#507090', fontSize: '11px', margin: '0 0 12px' }}>Powered by Claude — knows your full background</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span style={{ color: '#507090', fontSize: '10px', fontWeight: 600, marginRight: '2px' }}>Quick actions:</span>
          {[
            { label: 'Analyze a JD', text: 'Please analyze this job description for me and tell me how well I\'d fit:\n\n[paste JD here]' },
            { label: 'What should I apply to?', text: 'Based on my background and the jobs I\'ve saved, what should I be applying to right now?' },
            { label: 'Interview prep', text: 'I have an upcoming interview. Can you help me prepare with likely questions and strong answers based on my background?' },
            { label: 'Cold outreach email', text: 'Help me write a cold outreach email to a recruiter at a company I\'m interested in.' },
          ].map(({ label, text }) => (
            <button key={label} onClick={() => setQuickAction(text)} style={{
              backgroundColor: '#182535', border: '1px solid #263a52',
              borderRadius: '20px', padding: '5px 12px', color: '#628aaa',
              fontSize: '11px', fontWeight: 500, cursor: 'pointer',
              transition: 'all 0.15s', whiteSpace: 'nowrap', fontFamily: 'inherit',
            }}
              onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = 'rgba(245,158,11,0.35)'; b.style.color = '#f59e0b'; }}
              onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#263a52'; b.style.color = '#628aaa'; }}
            >{label}</button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: '22px' }}>
        {!historyLoaded && (
          <div style={{ textAlign: 'center', color: '#507090', padding: '48px', fontSize: '13px' }}>Loading…</div>
        )}

        {historyLoaded && messages.map((msg, idx) => (
          <div key={idx} style={{
            display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            gap: '10px', maxWidth: '800px', margin: '0 auto', width: '100%',
          }}>
            {msg.role === 'assistant' && (
              <div style={{
                width: '30px', height: '30px', borderRadius: '10px',
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#000', fontSize: '11px', fontWeight: 800,
                flexShrink: 0, marginTop: '2px', letterSpacing: '-0.5px',
                boxShadow: '0 0 14px rgba(245,158,11,0.25)',
              }}>AI</div>
            )}

            <div style={{
              maxWidth: '85%',
              backgroundColor: msg.role === 'user' ? '#182535' : 'transparent',
              border: msg.role === 'user' ? '1px solid #263a52' : 'none',
              borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '0',
              padding: msg.role === 'user' ? '10px 15px' : '0',
              color: '#eaf2ff', fontSize: '14px', lineHeight: '1.65',
            }}>
              {msg.role === 'assistant' ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p: ({ children }) => <p style={{ margin: '0 0 10px', color: '#d5e5f5' }}>{children}</p>,
                    strong: ({ children }) => <strong style={{ color: '#eaf2ff', fontWeight: 600 }}>{children}</strong>,
                    ul: ({ children }) => <ul style={{ margin: '8px 0', paddingLeft: '20px', color: '#d5e5f5' }}>{children}</ul>,
                    ol: ({ children }) => <ol style={{ margin: '8px 0', paddingLeft: '20px', color: '#d5e5f5' }}>{children}</ol>,
                    li: ({ children }) => <li style={{ margin: '4px 0', color: '#d5e5f5' }}>{children}</li>,
                    h1: ({ children }) => <h1 style={{ color: '#eaf2ff', fontSize: '17px', fontWeight: 700, margin: '14px 0 8px' }}>{children}</h1>,
                    h2: ({ children }) => <h2 style={{ color: '#eaf2ff', fontSize: '15px', fontWeight: 700, margin: '12px 0 6px' }}>{children}</h2>,
                    h3: ({ children }) => <h3 style={{ color: '#eaf2ff', fontSize: '13px', fontWeight: 600, margin: '10px 0 5px' }}>{children}</h3>,
                    code: ({ children }) => <code style={{ backgroundColor: '#1d2d42', color: '#f59e0b', padding: '1px 5px', borderRadius: '5px', fontSize: '12px', fontFamily: 'monospace' }}>{children}</code>,
                    blockquote: ({ children }) => <blockquote style={{ borderLeft: '3px solid rgba(245,158,11,0.4)', paddingLeft: '12px', margin: '8px 0', color: '#8eb0cc' }}>{children}</blockquote>,
                  }}
                >
                  {msg.content || (loading && idx === messages.length - 1 ? '...' : '')}
                </ReactMarkdown>
              ) : (
                <span style={{ whiteSpace: 'pre-wrap', color: '#d5e5f5' }}>{msg.content}</span>
              )}
            </div>
          </div>
        ))}

        {loading && messages[messages.length - 1]?.content === '' && (
          <div style={{ display: 'flex', gap: '10px', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
            <div style={{
              width: '30px', height: '30px', borderRadius: '10px',
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#000', fontSize: '11px', fontWeight: 800, flexShrink: 0,
              boxShadow: '0 0 14px rgba(245,158,11,0.25)',
            }}>AI</div>
            <Loader size={15} color="#507090" style={{ marginTop: '7px', animation: 'spin 1s linear infinite' }} />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div style={{ padding: '14px 32px 22px', borderTop: '1px solid #1e2e42', backgroundColor: '#0b0e18', flexShrink: 0 }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask your career coach anything…"
            rows={1}
            style={{
              flex: 1, backgroundColor: '#182535', border: '1px solid #263a52',
              borderRadius: '12px', padding: '12px 16px', color: '#eaf2ff',
              fontSize: '14px', outline: 'none', resize: 'none', lineHeight: '1.5',
              minHeight: '44px', maxHeight: '160px', overflow: 'auto', fontFamily: 'inherit',
              transition: 'border-color 0.15s',
            }}
            onFocus={e => (e.target.style.borderColor = 'rgba(245,158,11,0.4)')}
            onBlur={e => (e.target.style.borderColor = '#263a52')}
          />
          <button
            onClick={() => handleSend()}
            disabled={loading || !input.trim()}
            style={{
              width: '44px', height: '44px', borderRadius: '12px',
              background: loading || !input.trim() ? '#182535' : 'linear-gradient(135deg, #f59e0b, #d97706)',
              border: loading || !input.trim() ? '1px solid #263a52' : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: loading || !input.trim() ? 'not-allowed' : 'pointer', flexShrink: 0,
              boxShadow: loading || !input.trim() ? 'none' : '0 4px 12px rgba(245,158,11,0.3)',
            }}
          >
            <Send size={16} color={loading || !input.trim() ? '#507090' : '#fff'} />
          </button>
        </div>
        <p style={{ color: '#3c5875', fontSize: '10px', margin: '7px 0 0', textAlign: 'center' }}>
          Enter to send · Shift+Enter for new line
        </p>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '100px', left: '50%', transform: 'translateX(-50%)',
          backgroundColor: '#182535', border: '1px solid rgba(245,158,11,0.3)',
          color: '#eaf2ff', padding: '10px 20px', borderRadius: '10px',
          fontSize: '12px', zIndex: 1000, maxWidth: '400px', textAlign: 'center',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}
