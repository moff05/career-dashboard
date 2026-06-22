'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { apiFetch } from '@/lib/apiFetch';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Send, Loader, Mic, ChevronRight, Bookmark } from 'lucide-react';

interface Message {
  id?: number;
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
}

interface SavedJob { id: number; company: string; title: string; }

interface InterviewExchange {
  question: string;
  answer: string;
  response: string; // feedback (+ next question if not last)
}

const INTERVIEW_TYPES = [
  { value: 'behavioral', label: 'Behavioral', desc: 'STAR questions about past experience' },
  { value: 'product', label: 'Product / PM', desc: 'Design, metrics, prioritization' },
  { value: 'technical', label: 'Technical', desc: 'Problem-solving and analytics' },
  { value: 'case', label: 'Case / Strategy', desc: 'Market sizing, business decisions' },
  { value: 'fit', label: 'Culture Fit', desc: 'Motivation, values, career goals' },
];

export default function CoachPage() {
  // ── Chat state ────────────────────────────────────────────────────────────
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

  // ── Mode ──────────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<'chat' | 'interview'>('chat');

  // ── Interview state ───────────────────────────────────────────────────────
  const [savedJobs, setSavedJobs] = useState<SavedJob[]>([]);
  const [intPhase, setIntPhase] = useState<'setup' | 'active' | 'done'>('setup');
  const [intSetup, setIntSetup] = useState({ useCustom: false, jobId: '', customCompany: '', customTitle: '', type: 'behavioral' });
  const [intExchanges, setIntExchanges] = useState<InterviewExchange[]>([]);
  const [intCurrentQ, setIntCurrentQ] = useState(''); // current question being answered
  const [intAnswer, setIntAnswer] = useState('');
  const [intStreaming, setIntStreaming] = useState(false);
  const [intQNumber, setIntQNumber] = useState(0); // 1–5
  const [intFinalSummary, setIntFinalSummary] = useState('');
  const [savedStoryIds, setSavedStoryIds] = useState<Set<number>>(new Set());
  const intAnswerRef = useRef<HTMLTextAreaElement>(null);
  const intBottomRef = useRef<HTMLDivElement>(null);

  const saveAsStory = useCallback(async (ex: InterviewExchange, index: number) => {
    const content = `Q: ${ex.question}\nA: ${ex.answer}\nFeedback: ${ex.response}`;
    try {
      await apiFetch('/api/memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, category: 'story_bank', source: 'interview' }),
      });
      setSavedStoryIds(prev => new Set([...prev, index]));
    } catch { /* leave unsaved, button stays clickable to retry */ }
  }, []);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(() => { scrollToBottom(); }, [messages]);
  useEffect(() => { intBottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [intExchanges, intCurrentQ, intFinalSummary]);

  // ── Chat: load history ────────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/chat/history?session_id=${sessionId}`);
      const data = await res.json();
      setMessages(data?.length > 0 ? data : [{
        role: 'assistant',
        content: "Hi! I'm your AI career coach. I have your full resume, saved memories, and job tracker context. What's on your mind?",
      }]);
    } catch {
      setMessages([{ role: 'assistant', content: "Hi! I'm your AI career coach. I have your full resume, saved memories, and job tracker context. What's on your mind?" }]);
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
      const cats = (data.categories || []).map((c: { name: string; score: number; rationale: string }) => `• ${c.name}: ${c.score}/100 — ${c.rationale}`).join('\n');
      const msg = `Walk me through my fit score for ${data.company} — ${data.title}.\n\nOverall: ${data.total}/100 — ${data.summary}\n\nCategory breakdown:\n${cats}\n\nWhat does this score mean, which gaps should I focus on, and what's my best strategy to improve my chances?`;
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
      setInput(`Please write a tailored cover letter for me for this role:\n\nCompany: ${company}\nRole: ${title}\n\nMake it specific to my actual background and experience.`);
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
    if (!forceText) { setInput(''); if (textareaRef.current) textareaRef.current.style.height = 'auto'; }
    const userMessage: Message = { role: 'user', content: text };
    setMessages(prev => [...prev, userMessage]);
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

  // ── Interview: helpers ────────────────────────────────────────────────────
  const switchToInterview = async () => {
    setMode('interview');
    setIntPhase('setup');
    setIntExchanges([]);
    setIntCurrentQ('');
    setIntAnswer('');
    setIntQNumber(0);
    setIntFinalSummary('');
    if (savedJobs.length === 0) {
      const data = await apiFetch('/api/jobs').then(r => r.json()).catch(() => []);
      setSavedJobs((data || []).map((j: { id: number; company: string; title: string }) => ({ id: j.id, company: j.company, title: j.title })));
    }
  };

  const getInterviewMeta = () => {
    if (intSetup.useCustom) return { company: intSetup.customCompany, title: intSetup.customTitle };
    const job = savedJobs.find(j => j.id === parseInt(intSetup.jobId));
    return job ? { company: job.company, title: job.title } : { company: '', title: '' };
  };

  const streamInterview = async (company: string, title: string, action: 'start' | 'answer', answerText?: string, qNum?: number, exchanges?: InterviewExchange[]) => {
    setIntStreaming(true);
    let streamed = '';
    try {
      const res = await apiFetch('/api/interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company, title,
          interview_type: intSetup.type,
          exchanges: (exchanges || intExchanges).map(e => ({ question: e.question, answer: e.answer })),
          action,
          current_answer: answerText,
          question_number: qNum ?? intQNumber,
        }),
      });
      if (!res.body) throw new Error('No stream');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        streamed += decoder.decode(value, { stream: true });
        if (action === 'start') {
          setIntCurrentQ(streamed);
        } else {
          setIntExchanges(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = { ...updated[updated.length - 1], response: streamed };
            return updated;
          });
        }
      }
    } catch { /* ignore */ }
    setIntStreaming(false);
    return streamed;
  };

  const startInterview = async () => {
    const { company, title } = getInterviewMeta();
    if (!company || !title) return;
    setIntPhase('active');
    setIntQNumber(1);
    await streamInterview(company, title, 'start', undefined, 1, []);
    setTimeout(() => intAnswerRef.current?.focus(), 100);
  };

  const submitAnswer = async () => {
    if (!intAnswer.trim() || intStreaming) return;
    const { company, title } = getInterviewMeta();
    const answer = intAnswer.trim();
    const currentQ = intCurrentQ;
    const currentQNum = intQNumber;
    const isLast = currentQNum >= 5;

    setIntAnswer('');
    const newExchange: InterviewExchange = { question: currentQ, answer, response: '' };
    setIntExchanges(prev => [...prev, newExchange]);
    setIntCurrentQ('');

    const exchangesSoFar = [...intExchanges, newExchange];
    const streamed = await streamInterview(company, title, 'answer', answer, currentQNum, exchangesSoFar.slice(0, -1));

    if (isLast) {
      setIntFinalSummary(streamed);
      setIntPhase('done');
    } else {
      setIntQNumber(prev => prev + 1);
      setIntCurrentQ(streamed);
      setTimeout(() => intAnswerRef.current?.focus(), 100);
    }
  };

  const resetInterview = () => {
    setIntPhase('setup');
    setIntExchanges([]);
    setIntCurrentQ('');
    setIntAnswer('');
    setIntQNumber(0);
    setIntFinalSummary('');
  };

  // ── Shared styles ─────────────────────────────────────────────────────────
  const { company: intCompany, title: intTitle } = mode === 'interview' ? getInterviewMeta() : { company: '', title: '' };
  const intTypeLabel = INTERVIEW_TYPES.find(t => t.value === intSetup.type)?.label || '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'rgba(125,220,255,0.025)' }}>

      {/* Header */}
      <div style={{ padding: '16px 32px', borderBottom: '1px solid rgba(125,220,255,0.10)', background: 'rgba(125,220,255,0.055)', backdropFilter: 'blur(20px)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div>
            <h1 style={{ color: 'rgba(232,244,255,0.95)', fontSize: '15px', fontWeight: 700, margin: 0 }}>
              {mode === 'chat' ? 'AI Career Coach' : 'Mock Interview'}
            </h1>
            <p style={{ color: 'rgba(135,185,230,0.65)', fontSize: '11px', margin: '2px 0 0' }}>
              {mode === 'chat' ? 'Powered by Claude — knows your full background' : 'Practice with realistic interview questions and live feedback'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {(['chat', 'interview'] as const).map(m => (
              <button key={m} onClick={() => m === 'interview' ? switchToInterview() : setMode('chat')} style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                backgroundColor: mode === m ? (m === 'interview' ? 'rgba(139,92,246,0.1)' : 'rgba(59,130,246,0.1)') : 'rgba(125,220,255,0.04)',
                color: mode === m ? (m === 'interview' ? '#7c3aed' : '#3b82f6') : 'rgba(158,202,242,0.85)',
                border: `1px solid ${mode === m ? (m === 'interview' ? 'rgba(139,92,246,0.3)' : 'rgba(59,130,246,0.3)') : 'rgba(125,220,255,0.13)'}`,
                borderRadius: '20px', padding: '5px 14px', fontSize: '11px', fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
              }}>
                {m === 'interview' && <Mic size={11} />}
                {m === 'chat' ? 'Chat' : 'Mock Interview'}
              </button>
            ))}
          </div>
        </div>

        {/* Chat quick actions */}
        {mode === 'chat' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ color: 'rgba(135,185,230,0.65)', fontSize: '10px', fontWeight: 600, marginRight: '2px' }}>Quick:</span>
            {[
              { label: 'What should I apply to?', text: "Based on my background and saved jobs, what should I prioritize applying to right now?" },
              { label: 'Interview prep', text: "I have an upcoming interview. Help me prepare with likely questions and strong answers based on my background." },
              { label: 'Cold outreach', text: "Help me write a cold outreach email to a recruiter at a company I'm interested in." },
              { label: 'Analyze a JD', text: "Please analyze this job description and tell me how well I'd fit:\n\n[paste JD here]" },
            ].map(({ label, text }) => (
              <button key={label} onClick={() => setQuickAction(text)} style={{
                background: 'transparent', border: '1px solid rgba(125,220,255,0.13)', borderRadius: '20px',
                padding: '5px 12px', color: 'rgba(158,202,242,0.72)', fontSize: '11px', fontWeight: 500,
                cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap', fontFamily: 'inherit',
              }}
                onMouseEnter={e => { const b = e.currentTarget; b.style.borderColor = 'rgba(59,130,246,0.35)'; b.style.color = '#3b82f6'; b.style.backgroundColor = 'rgba(59,130,246,0.05)'; }}
                onMouseLeave={e => { const b = e.currentTarget; b.style.borderColor = 'rgba(125,220,255,0.13)'; b.style.color = 'rgba(158,202,242,0.85)'; b.style.backgroundColor = 'rgba(125,220,255,0.06)'; }}
              >{label}</button>
            ))}
          </div>
        )}
      </div>

      {/* ── CHAT MODE ──────────────────────────────────────────────────────── */}
      {mode === 'chat' && (
        <>
          <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: '22px' }}>
            {!historyLoaded && <div style={{ textAlign: 'center', color: 'rgba(135,185,230,0.65)', padding: '48px', fontSize: '13px' }}>Loading…</div>}
            {historyLoaded && messages.map((msg, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: '10px', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
                {msg.role === 'assistant' && (
                  <div style={{ width: '30px', height: '30px', borderRadius: '10px', background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '11px', fontWeight: 800, flexShrink: 0, marginTop: '2px', boxShadow: '0 2px 8px rgba(59,130,246,0.25)' }}>AI</div>
                )}
                <div style={{ maxWidth: '85%', backgroundColor: msg.role === 'user' ? 'rgba(125,220,255,0.06)' : 'transparent', border: msg.role === 'user' ? '1px solid rgba(125,220,255,0.13)' : 'none', borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '0', padding: msg.role === 'user' ? '10px 15px' : '0', fontSize: '14px', lineHeight: '1.65' }}>
                  {msg.role === 'assistant' ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                      p: ({ children }) => <p style={{ margin: '0 0 10px', color: 'rgba(200,228,255,0.85)' }}>{children}</p>,
                      strong: ({ children }) => <strong style={{ color: 'rgba(232,244,255,0.95)', fontWeight: 600 }}>{children}</strong>,
                      ul: ({ children }) => <ul style={{ margin: '8px 0', paddingLeft: '20px', color: 'rgba(200,228,255,0.85)' }}>{children}</ul>,
                      ol: ({ children }) => <ol style={{ margin: '8px 0', paddingLeft: '20px', color: 'rgba(200,228,255,0.85)' }}>{children}</ol>,
                      li: ({ children }) => <li style={{ margin: '4px 0', color: 'rgba(200,228,255,0.85)' }}>{children}</li>,
                      h1: ({ children }) => <h1 style={{ color: 'rgba(232,244,255,0.95)', fontSize: '17px', fontWeight: 700, margin: '14px 0 8px' }}>{children}</h1>,
                      h2: ({ children }) => <h2 style={{ color: 'rgba(232,244,255,0.95)', fontSize: '15px', fontWeight: 700, margin: '12px 0 6px' }}>{children}</h2>,
                      h3: ({ children }) => <h3 style={{ color: 'rgba(232,244,255,0.95)', fontSize: '13px', fontWeight: 600, margin: '10px 0 5px' }}>{children}</h3>,
                      code: ({ children }) => <code style={{ background: 'transparent', color: '#3b82f6', padding: '1px 5px', borderRadius: '5px', fontSize: '12px', fontFamily: 'monospace', border: '1px solid rgba(125,220,255,0.13)' }}>{children}</code>,
                      blockquote: ({ children }) => <blockquote style={{ borderLeft: '3px solid rgba(59,130,246,0.3)', paddingLeft: '12px', margin: '8px 0', color: 'rgba(158,202,242,0.72)' }}>{children}</blockquote>,
                    }}>
                      {msg.content || (loading && idx === messages.length - 1 ? '…' : '')}
                    </ReactMarkdown>
                  ) : (
                    <span style={{ whiteSpace: 'pre-wrap', color: 'rgba(220,235,255,0.90)' }}>{msg.content}</span>
                  )}
                </div>
              </div>
            ))}
            {loading && messages[messages.length - 1]?.content === '' && (
              <div style={{ display: 'flex', gap: '10px', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
                <div style={{ width: '30px', height: '30px', borderRadius: '10px', background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '11px', fontWeight: 800, flexShrink: 0, boxShadow: '0 2px 8px rgba(59,130,246,0.25)' }}>AI</div>
                <Loader size={15} color="rgba(158,202,242,0.85)" style={{ marginTop: '7px', animation: 'spin 1s linear infinite' }} />
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div style={{ padding: '14px 32px 22px', borderTop: '1px solid rgba(125,220,255,0.10)', background: 'rgba(125,220,255,0.055)', backdropFilter: 'blur(20px)', flexShrink: 0, boxShadow: '0 -1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
              <textarea ref={textareaRef} value={input} onChange={handleTextareaChange} onKeyDown={handleKeyDown} placeholder="Ask your career coach anything…" rows={1} style={{ flex: 1, background: 'rgba(125,220,255,0.025)', border: '1px solid rgba(125,220,255,0.13)', borderRadius: '12px', padding: '12px 16px', color: 'rgba(232,244,255,0.95)', fontSize: '14px', outline: 'none', resize: 'none', lineHeight: '1.5', minHeight: '44px', maxHeight: '160px', overflow: 'auto', fontFamily: 'inherit', transition: 'border-color 0.15s' }} onFocus={e => (e.target.style.borderColor = 'rgba(59,130,246,0.4)')} onBlur={e => (e.target.style.borderColor = 'rgba(125,220,255,0.13)')} />
              <button onClick={() => handleSend()} disabled={loading || !input.trim()} style={{ width: '44px', height: '44px', borderRadius: '12px', background: loading || !input.trim() ? 'rgba(125,220,255,0.06)' : 'linear-gradient(135deg, #3b82f6, #1d4ed8)', border: loading || !input.trim() ? '1px solid rgba(125,220,255,0.13)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: loading || !input.trim() ? 'not-allowed' : 'pointer', flexShrink: 0, boxShadow: loading || !input.trim() ? 'none' : '0 4px 12px rgba(59,130,246,0.3)' }}>
                <Send size={16} color={loading || !input.trim() ? 'rgba(158,202,242,0.85)' : '#fff'} />
              </button>
            </div>
            <p style={{ color: 'rgba(125,175,230,0.35)', fontSize: '10px', margin: '7px 0 0', textAlign: 'center' }}>Enter to send · Shift+Enter for new line</p>
          </div>
        </>
      )}

      {/* ── INTERVIEW MODE ─────────────────────────────────────────────────── */}
      {mode === 'interview' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '28px 36px' }}>
          <div style={{ maxWidth: '720px', margin: '0 auto' }}>

            {/* Setup */}
            {intPhase === 'setup' && (
              <div style={{ background: 'rgba(125,220,255,0.055)', backdropFilter: 'blur(20px)', border: '1px solid rgba(125,220,255,0.13)', borderRadius: '18px', padding: '28px' }}>
                <h2 style={{ color: 'rgba(232,244,255,0.95)', fontSize: '16px', fontWeight: 700, margin: '0 0 6px' }}>Set up your interview</h2>
                <p style={{ color: 'rgba(135,185,230,0.65)', fontSize: '12px', margin: '0 0 24px' }}>5 questions · live feedback · personalized to your background</p>

                {/* Job selection */}
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', color: 'rgba(158,202,242,0.72)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>Role</label>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                    {(['saved', 'custom'] as const).map(opt => (
                      <button key={opt} onClick={() => setIntSetup(p => ({ ...p, useCustom: opt === 'custom' }))} style={{
                        backgroundColor: (intSetup.useCustom ? opt === 'custom' : opt === 'saved') ? 'rgba(59,130,246,0.08)' : 'rgba(125,220,255,0.04)',
                        color: (intSetup.useCustom ? opt === 'custom' : opt === 'saved') ? '#3b82f6' : 'rgba(158,202,242,0.85)',
                        border: `1px solid ${(intSetup.useCustom ? opt === 'custom' : opt === 'saved') ? 'rgba(59,130,246,0.3)' : 'rgba(125,220,255,0.13)'}`,
                        borderRadius: '20px', padding: '5px 14px', fontSize: '11px', fontWeight: 600,
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}>{opt === 'saved' ? 'From my tracker' : 'Custom role'}</button>
                    ))}
                  </div>
                  {!intSetup.useCustom ? (
                    <select value={intSetup.jobId} onChange={e => setIntSetup(p => ({ ...p, jobId: e.target.value }))} style={{ width: '100%', background: 'rgba(125,220,255,0.025)', border: '1px solid rgba(125,220,255,0.13)', borderRadius: '10px', padding: '9px 12px', color: 'rgba(232,244,255,0.95)', fontSize: '13px', outline: 'none', fontFamily: 'inherit' }}>
                      <option value="">Select a job…</option>
                      {savedJobs.map(j => <option key={j.id} value={j.id}>{j.company} — {j.title}</option>)}
                    </select>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <input placeholder="Company" value={intSetup.customCompany} onChange={e => setIntSetup(p => ({ ...p, customCompany: e.target.value }))} style={{ background: 'rgba(125,220,255,0.025)', border: '1px solid rgba(125,220,255,0.13)', borderRadius: '10px', padding: '9px 12px', color: 'rgba(232,244,255,0.95)', fontSize: '13px', outline: 'none', fontFamily: 'inherit' }} />
                      <input placeholder="Role title" value={intSetup.customTitle} onChange={e => setIntSetup(p => ({ ...p, customTitle: e.target.value }))} style={{ background: 'rgba(125,220,255,0.025)', border: '1px solid rgba(125,220,255,0.13)', borderRadius: '10px', padding: '9px 12px', color: 'rgba(232,244,255,0.95)', fontSize: '13px', outline: 'none', fontFamily: 'inherit' }} />
                    </div>
                  )}
                </div>

                {/* Interview type */}
                <div style={{ marginBottom: '28px' }}>
                  <label style={{ display: 'block', color: 'rgba(158,202,242,0.72)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '10px' }}>Interview Type</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {INTERVIEW_TYPES.map(t => (
                      <button key={t.value} onClick={() => setIntSetup(p => ({ ...p, type: t.value }))} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        backgroundColor: intSetup.type === t.value ? 'rgba(124,58,237,0.06)' : 'rgba(125,220,255,0.04)',
                        border: `1px solid ${intSetup.type === t.value ? 'rgba(124,58,237,0.25)' : 'rgba(125,220,255,0.13)'}`,
                        borderRadius: '12px', padding: '10px 14px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                        transition: 'all 0.1s',
                      }}>
                        <div>
                          <div style={{ color: intSetup.type === t.value ? '#7c3aed' : 'rgba(200,228,255,0.85)', fontSize: '13px', fontWeight: 600 }}>{t.label}</div>
                          <div style={{ color: 'rgba(135,185,230,0.65)', fontSize: '11px', marginTop: '1px' }}>{t.desc}</div>
                        </div>
                        {intSetup.type === t.value && <ChevronRight size={14} color="#7c3aed" />}
                      </button>
                    ))}
                  </div>
                </div>

                <button onClick={startInterview} disabled={intStreaming || (!intSetup.useCustom ? !intSetup.jobId : !intSetup.customCompany || !intSetup.customTitle)} style={{
                  width: '100%', background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                  color: '#fff', border: 'none', borderRadius: '12px', padding: '12px',
                  fontSize: '14px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  boxShadow: '0 4px 14px rgba(124,58,237,0.3)',
                  opacity: (!intSetup.useCustom ? !intSetup.jobId : !intSetup.customCompany || !intSetup.customTitle) ? 0.4 : 1,
                }}>
                  {intStreaming ? 'Starting…' : 'Start Interview →'}
                </button>
              </div>
            )}

            {/* Active interview */}
            {intPhase === 'active' && (
              <div>
                {/* Progress bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                  <div style={{ flex: 1, height: '4px', backgroundColor: 'rgba(125,220,255,0.13)', borderRadius: '10px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(((intQNumber - 1) / 5) * 100, 100)}%`, background: 'linear-gradient(90deg, #7c3aed, #6d28d9)', borderRadius: '10px', transition: 'width 0.4s ease' }} />
                  </div>
                  <span style={{ color: 'rgba(135,185,230,0.65)', fontSize: '11px', fontWeight: 600, flexShrink: 0 }}>Q{intQNumber} of 5</span>
                  <span style={{ color: 'rgba(125,175,230,0.35)', fontSize: '10px', flexShrink: 0 }}>{intTypeLabel} · {intCompany}</span>
                </div>

                {/* Past exchanges */}
                {intExchanges.map((ex, i) => (
                  <div key={i} style={{ marginBottom: '24px' }}>
                    <div style={{ background: 'rgba(125,220,255,0.055)', backdropFilter: 'blur(20px)', border: '1px solid rgba(125,220,255,0.13)', borderRadius: '14px', padding: '14px 16px', marginBottom: '10px', borderLeft: '3px solid rgba(124,58,237,0.3)' }}>
                      <div style={{ color: 'rgba(135,185,230,0.65)', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px' }}>Question {i + 1}</div>
                      <p style={{ color: 'rgba(200,228,255,0.85)', fontSize: '13px', lineHeight: 1.65, margin: 0 }}>{ex.question}</p>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
                      <div style={{ maxWidth: '80%', background: 'transparent', border: '1px solid rgba(125,220,255,0.13)', borderRadius: '14px 14px 4px 14px', padding: '10px 14px' }}>
                        <p style={{ color: 'rgba(220,235,255,0.90)', fontSize: '13px', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{ex.answer}</p>
                      </div>
                    </div>
                    {ex.response && (
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '10px', fontWeight: 800, flexShrink: 0 }}>AI</div>
                        <div style={{ flex: 1, color: 'rgba(200,228,255,0.85)', fontSize: '13px', lineHeight: 1.65 }}>
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                            p: ({ children }) => <p style={{ margin: '0 0 8px', color: 'rgba(200,228,255,0.85)' }}>{children}</p>,
                            strong: ({ children }) => <strong style={{ color: 'rgba(232,244,255,0.95)', fontWeight: 600 }}>{children}</strong>,
                          }}>{ex.response}</ReactMarkdown>
                          <button
                            onClick={() => saveAsStory(ex, i)}
                            disabled={savedStoryIds.has(i)}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: '5px', marginTop: '4px',
                              background: 'none', border: 'none', padding: 0, fontFamily: 'inherit',
                              fontSize: '12px', fontWeight: 600, cursor: savedStoryIds.has(i) ? 'default' : 'pointer',
                              color: savedStoryIds.has(i) ? '#86efac' : '#7c3aed',
                            }}>
                            <Bookmark size={11} /> {savedStoryIds.has(i) ? 'Saved as story' : 'Save as reusable story'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* Current question */}
                {intCurrentQ && (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ background: 'rgba(125,220,255,0.055)', backdropFilter: 'blur(20px)', border: '1px solid rgba(125,220,255,0.13)', borderRadius: '14px', padding: '14px 16px', borderLeft: '3px solid #7c3aed', marginBottom: '14px' }}>
                      <div style={{ color: '#7c3aed', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px' }}>Question {intQNumber}</div>
                      <p style={{ color: 'rgba(232,244,255,0.95)', fontSize: '13px', lineHeight: 1.65, margin: 0 }}>
                        {intStreaming && !intCurrentQ ? <Loader size={14} color="rgba(158,202,242,0.85)" style={{ animation: 'spin 1s linear infinite' }} /> : intCurrentQ}
                      </p>
                    </div>
                    {!intStreaming && (
                      <div>
                        <textarea ref={intAnswerRef} value={intAnswer} onChange={e => setIntAnswer(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) submitAnswer(); }} placeholder="Type your answer… (⌘+Enter to submit)" rows={4} style={{ width: '100%', background: 'rgba(125,220,255,0.025)', border: '1px solid rgba(125,220,255,0.13)', borderRadius: '12px', padding: '12px 16px', color: 'rgba(232,244,255,0.95)', fontSize: '13px', outline: 'none', resize: 'vertical', lineHeight: '1.6', fontFamily: 'inherit', boxSizing: 'border-box', transition: 'border-color 0.15s' }} onFocus={e => (e.target.style.borderColor = 'rgba(124,58,237,0.4)')} onBlur={e => (e.target.style.borderColor = 'rgba(125,220,255,0.13)')} />
                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                          <button onClick={submitAnswer} disabled={!intAnswer.trim()} style={{ flex: 1, background: intAnswer.trim() ? 'linear-gradient(135deg, #7c3aed, #6d28d9)' : 'rgba(125,220,255,0.06)', color: intAnswer.trim() ? '#fff' : 'rgba(158,202,242,0.85)', border: 'none', borderRadius: '10px', padding: '10px', fontSize: '13px', fontWeight: 700, cursor: intAnswer.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit', boxShadow: intAnswer.trim() ? '0 4px 12px rgba(124,58,237,0.25)' : 'none' }}>
                            Submit Answer {intQNumber < 5 ? `→ Q${intQNumber + 1}` : '· Finish'}
                          </button>
                          <button onClick={resetInterview} style={{ background: 'rgba(125,220,255,0.025)', color: 'rgba(135,185,230,0.65)', border: '1px solid rgba(125,220,255,0.13)', borderRadius: '10px', padding: '10px 16px', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}>End</button>
                        </div>
                        <p style={{ color: 'rgba(125,175,230,0.35)', fontSize: '10px', margin: '6px 0 0', textAlign: 'center' }}>Take your time — answer as you would in a real interview</p>
                      </div>
                    )}
                    {intStreaming && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'rgba(135,185,230,0.65)', fontSize: '12px', padding: '8px 0' }}>
                        <Loader size={13} color="#7c3aed" style={{ animation: 'spin 1s linear infinite' }} />
                        Getting feedback…
                      </div>
                    )}
                  </div>
                )}

                {/* Streaming state for start */}
                {!intCurrentQ && intStreaming && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'rgba(135,185,230,0.65)', fontSize: '12px', padding: '16px 0' }}>
                    <Loader size={13} color="#7c3aed" style={{ animation: 'spin 1s linear infinite' }} />
                    Starting your interview…
                  </div>
                )}

                <div ref={intBottomRef} />
              </div>
            )}

            {/* Done */}
            {intPhase === 'done' && (
              <div>
                {/* Past exchanges summary */}
                {intExchanges.map((ex, i) => (
                  <div key={i} style={{ marginBottom: '16px', background: 'rgba(125,220,255,0.055)', backdropFilter: 'blur(20px)', border: '1px solid rgba(125,220,255,0.13)', borderRadius: '14px', padding: '14px 16px' }}>
                    <div style={{ color: 'rgba(135,185,230,0.65)', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '4px' }}>Q{i + 1}</div>
                    <p style={{ color: 'rgba(158,202,242,0.72)', fontSize: '12px', margin: '0 0 8px', fontStyle: 'italic' }}>{ex.question}</p>
                    <p style={{ color: 'rgba(200,228,255,0.85)', fontSize: '12px', margin: 0, lineHeight: 1.6, borderTop: '1px solid rgba(125,220,255,0.06)', paddingTop: '8px' }}>{ex.answer}</p>
                  </div>
                ))}

                {/* Final assessment */}
                <div style={{ backgroundColor: 'rgba(124,58,237,0.04)', border: '1px solid rgba(124,58,237,0.2)', borderRadius: '18px', padding: '20px', marginBottom: '20px', animation: 'fadeIn 0.3s ease' }}>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', alignItems: 'center' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '10px', fontWeight: 800, flexShrink: 0 }}>AI</div>
                    <span style={{ color: '#7c3aed', fontSize: '12px', fontWeight: 700 }}>Interview Assessment</span>
                  </div>
                  <div style={{ color: 'rgba(200,228,255,0.85)', fontSize: '13px', lineHeight: 1.7 }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                      p: ({ children }) => <p style={{ margin: '0 0 10px', color: 'rgba(200,228,255,0.85)' }}>{children}</p>,
                      strong: ({ children }) => <strong style={{ color: 'rgba(232,244,255,0.95)', fontWeight: 700 }}>{children}</strong>,
                      li: ({ children }) => <li style={{ margin: '4px 0', color: 'rgba(200,228,255,0.85)' }}>{children}</li>,
                      ul: ({ children }) => <ul style={{ margin: '8px 0', paddingLeft: '18px' }}>{children}</ul>,
                    }}>{intFinalSummary}</ReactMarkdown>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={resetInterview} style={{ flex: 1, background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', color: '#fff', border: 'none', borderRadius: '12px', padding: '11px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 12px rgba(124,58,237,0.25)' }}>
                    Practice Again
                  </button>
                  <button onClick={() => setMode('chat')} style={{ background: 'rgba(125,220,255,0.055)', backdropFilter: 'blur(20px)', color: 'rgba(158,202,242,0.72)', border: '1px solid rgba(125,220,255,0.13)', borderRadius: '12px', padding: '11px 18px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>
                    Go to Coach
                  </button>
                </div>
                <div ref={intBottomRef} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: '100px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(125,220,255,0.055)', backdropFilter: 'blur(20px)', border: '1px solid rgba(59,130,246,0.2)', color: 'rgba(232,244,255,0.95)', padding: '10px 20px', borderRadius: '10px', fontSize: '12px', zIndex: 1000, maxWidth: '400px', textAlign: 'center', boxShadow: '0 8px 24px rgba(0,0,0,0.1)' }}>
          {toast}
        </div>
      )}
    </div>
  );
}
