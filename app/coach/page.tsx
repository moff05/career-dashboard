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

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/history?session_id=${sessionId}`);
      const data = await res.json();
      if (data && data.length > 0) {
        setMessages(data);
      } else {
        // Show welcome message for new sessions
        setMessages([{
          role: 'assistant',
          content: "Hi Nicholas, I'm your AI career coach. I have your full resume, all your saved memories, and your job tracker context. What's on your mind?",
        }]);
      }
    } catch {
      setMessages([{
        role: 'assistant',
        content: "Hi Nicholas, I'm your AI career coach. I have your full resume, all your saved memories, and your job tracker context. What's on your mind?",
      }]);
    }
    setHistoryLoaded(true);
  }, [sessionId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Feature 7: On mount, check for cover-letter prefill URL params
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('prefill') === 'cover-letter') {
      const company = params.get('company') || '';
      const title = params.get('title') || '';
      const prefillText = `Please write a tailored cover letter for me for this role:\n\nCompany: ${company}\nRole: ${title}\n\nMake it specific to my background in CRE tech and AI automation.`;
      setInput(prefillText);
      // Clear URL params so refresh doesn't re-trigger
      window.history.replaceState({}, '', '/coach');
      // Focus the textarea after a short delay to let the page render
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.style.height = 'auto';
          textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + 'px';
        }
      }, 100);
    }
  }, []);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    const userMessage: Message = { role: 'user', content: text };
    setMessages(prev => [...prev, userMessage]);
    setLoading(true);

    // Add placeholder for streaming response
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

      // Extract memories silently
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
      } catch {
        // Silently ignore memory extraction errors
      }
    } catch (err) {
      console.error('Chat error:', err);
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
        };
        return updated;
      });
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    // Auto-resize
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 160) + 'px';
  };

  // Feature 6: Quick action presets
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

  const noMessages = messages.length === 0 || (messages.length === 1 && messages[0].role === 'assistant');

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      backgroundColor: '#1a1a1a',
    }}>
      {/* Header */}
      <div style={{
        padding: '20px 32px',
        borderBottom: '1px solid #2a2a2a',
        backgroundColor: '#1e1e1e',
        flexShrink: 0,
      }}>
        <h1 style={{ color: '#e8e8e8', fontSize: '16px', fontWeight: 600, margin: 0 }}>AI Career Coach</h1>
        <p style={{ color: '#888', fontSize: '12px', margin: '2px 0 0' }}>Powered by Claude — knows your full background</p>

        {/* Feature 6: Quick actions bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginTop: '12px',
          flexWrap: 'wrap',
        }}>
          <span style={{ color: '#555', fontSize: '11px', fontWeight: 500, whiteSpace: 'nowrap' }}>Quick actions:</span>
          <button
            onClick={() => setQuickAction('Please analyze this job description for me and tell me how well I\'d fit:\n\n[paste JD here]')}
            style={{
              background: 'none',
              border: '1px solid #333',
              borderRadius: '5px',
              padding: '4px 10px',
              color: '#d97706',
              fontSize: '11px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#d97706'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#333'; }}
          >
            Analyze a Job Description
          </button>
          <button
            onClick={() => setQuickAction('Based on my background and the jobs I\'ve saved, what should I be applying to right now?')}
            style={{
              background: 'none',
              border: '1px solid #333',
              borderRadius: '5px',
              padding: '4px 10px',
              color: '#d97706',
              fontSize: '11px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#d97706'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#333'; }}
          >
            What should I apply to next?
          </button>
        </div>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '24px 32px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}>
        {!historyLoaded && (
          <div style={{ textAlign: 'center', color: '#888', padding: '48px' }}>Loading...</div>
        )}

        {historyLoaded && messages.map((msg, idx) => (
          <div
            key={idx}
            style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              gap: '10px',
              maxWidth: '800px',
              margin: '0 auto',
              width: '100%',
            }}
          >
            {msg.role === 'assistant' && (
              <div style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                backgroundColor: '#d97706',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: '12px',
                fontWeight: 700,
                flexShrink: 0,
                marginTop: '2px',
              }}>
                N
              </div>
            )}

            <div style={{
              maxWidth: '85%',
              backgroundColor: msg.role === 'user' ? '#2a2a2a' : 'transparent',
              borderRadius: msg.role === 'user' ? '12px' : '0',
              padding: msg.role === 'user' ? '10px 14px' : '0',
              color: '#e8e8e8',
              fontSize: '14px',
              lineHeight: '1.6',
            }}>
              {msg.role === 'assistant' ? (
                <div className="prose-dark">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      p: ({ children }) => <p style={{ margin: '0 0 10px', color: '#e8e8e8' }}>{children}</p>,
                      strong: ({ children }) => <strong style={{ color: '#e8e8e8', fontWeight: 600 }}>{children}</strong>,
                      ul: ({ children }) => <ul style={{ margin: '8px 0', paddingLeft: '20px', color: '#e8e8e8' }}>{children}</ul>,
                      ol: ({ children }) => <ol style={{ margin: '8px 0', paddingLeft: '20px', color: '#e8e8e8' }}>{children}</ol>,
                      li: ({ children }) => <li style={{ margin: '4px 0', color: '#e8e8e8' }}>{children}</li>,
                      h1: ({ children }) => <h1 style={{ color: '#e8e8e8', fontSize: '18px', fontWeight: 600, margin: '12px 0 8px' }}>{children}</h1>,
                      h2: ({ children }) => <h2 style={{ color: '#e8e8e8', fontSize: '16px', fontWeight: 600, margin: '10px 0 6px' }}>{children}</h2>,
                      h3: ({ children }) => <h3 style={{ color: '#e8e8e8', fontSize: '14px', fontWeight: 600, margin: '8px 0 4px' }}>{children}</h3>,
                      code: ({ children }) => <code style={{ backgroundColor: '#2a2a2a', color: '#d97706', padding: '1px 4px', borderRadius: '3px', fontSize: '12px', fontFamily: 'monospace' }}>{children}</code>,
                      blockquote: ({ children }) => <blockquote style={{ borderLeft: '3px solid #d97706', paddingLeft: '12px', margin: '8px 0', color: '#888' }}>{children}</blockquote>,
                    }}
                  >
                    {msg.content || (loading && idx === messages.length - 1 ? '...' : '')}
                  </ReactMarkdown>
                </div>
              ) : (
                <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
              )}
            </div>
          </div>
        ))}

        {loading && messages[messages.length - 1]?.content === '' && (
          <div style={{ display: 'flex', gap: '10px', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              backgroundColor: '#d97706',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: '12px',
              fontWeight: 700,
              flexShrink: 0,
            }}>N</div>
            <Loader size={16} color="#888" style={{ marginTop: '6px', animation: 'spin 1s linear infinite' }} />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div style={{
        padding: '16px 32px 24px',
        borderTop: '1px solid #2a2a2a',
        backgroundColor: '#1a1a1a',
        flexShrink: 0,
      }}>
        <div style={{
          maxWidth: '800px',
          margin: '0 auto',
          display: 'flex',
          gap: '10px',
          alignItems: 'flex-end',
        }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask your career coach anything..."
            rows={1}
            style={{
              flex: 1,
              backgroundColor: '#2a2a2a',
              border: '1px solid #333',
              borderRadius: '10px',
              padding: '12px 16px',
              color: '#e8e8e8',
              fontSize: '14px',
              outline: 'none',
              resize: 'none',
              lineHeight: '1.5',
              minHeight: '44px',
              maxHeight: '160px',
              overflow: 'auto',
              fontFamily: 'inherit',
            }}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              backgroundColor: loading || !input.trim() ? '#333' : '#d97706',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
              flexShrink: 0,
            }}
          >
            <Send size={16} color={loading || !input.trim() ? '#555' : '#fff'} />
          </button>
        </div>
        <p style={{ color: '#555', fontSize: '11px', margin: '8px 0 0', textAlign: 'center' }}>
          Press Enter to send · Shift+Enter for new line
        </p>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '100px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: '#2a2a2a',
          border: '1px solid #d97706',
          color: '#e8e8e8',
          padding: '10px 20px',
          borderRadius: '8px',
          fontSize: '12px',
          zIndex: 1000,
          maxWidth: '400px',
          textAlign: 'center',
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}
