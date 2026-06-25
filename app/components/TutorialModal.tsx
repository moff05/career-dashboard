'use client';

import { useState } from 'react';
import { X, ChevronRight } from 'lucide-react';
import { useOverlays } from '@/app/OverlayContext';

const STEPS = [
  {
    emoji: '👋',
    title: 'Welcome to jobs_',
    body: "Your job tracker with AI built in. Track every application, get an AI fit score for each job, and get personalized coaching — all in one place.",
  },
  {
    emoji: '🔑',
    title: 'Set up your AI key first',
    body: "The AI features need a free Anthropic API key. Tap the Profile button (top right) → tap the ? next to \"API Key\" for step-by-step instructions. Start with just $1 — that covers 50+ AI actions.",
  },
  {
    emoji: '➕',
    title: 'Add your first job',
    body: "Tap + Add Job and paste a job posting URL or description. The AI automatically scores your fit, finds gaps, and tailors your resume bullets the first time you open it.",
  },
  {
    emoji: '✅',
    title: "You're all set",
    body: "Click any job to expand it and see your AI score, fit gaps, and tailored bullets. The Coach button gives you personalized advice anytime about any job or your search overall.",
  },
];

export function TutorialModal() {
  const { tutorialOpen, closeTutorial } = useOverlays();
  const [step, setStep] = useState(0);

  function handleClose() {
    localStorage.setItem('cid_tutorial_done', '1');
    setStep(0);
    closeTutorial();
  }

  function handleNext() {
    if (step < STEPS.length - 1) {
      setStep(s => s + 1);
    } else {
      handleClose();
    }
  }

  if (!tutorialOpen) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <>
      <div className="overlay-backdrop" onClick={handleClose} />
      <div
        className="overlay-panel center-modal"
        style={{
          left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
          width: 'min(420px, 92vw)',
          borderRadius: 'var(--r-lg)',
          padding: '28px 28px 24px',
        }}
      >
        <button
          onClick={handleClose}
          style={{ position: 'absolute', top: '14px', right: '14px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: '4px', lineHeight: 1 }}
        >
          <X size={15} />
        </button>

        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div style={{ fontSize: '36px', lineHeight: 1, marginBottom: '14px' }}>{current.emoji}</div>
          <div style={{ color: 'var(--text)', fontWeight: 700, fontSize: '16px', marginBottom: '10px' }}>{current.title}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.65 }}>{current.body}</div>
        </div>

        {/* Progress dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginBottom: '20px' }}>
          {STEPS.map((_, i) => (
            <div
              key={i}
              onClick={() => setStep(i)}
              style={{
                width: i === step ? '18px' : '6px', height: '6px',
                borderRadius: '3px',
                backgroundColor: i === step ? 'var(--accent)' : 'var(--border-hi)',
                cursor: 'pointer',
                transition: 'width 0.2s, background-color 0.2s',
              }}
            />
          ))}
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          {!isLast && (
            <button
              onClick={handleClose}
              className="btn-ghost"
              style={{ flex: 1, justifyContent: 'center', fontSize: '13px' }}
            >
              Skip
            </button>
          )}
          <button
            onClick={handleNext}
            className="btn-primary"
            style={{ flex: isLast ? undefined : 2, width: isLast ? '100%' : undefined, justifyContent: 'center', fontSize: '13px' }}
          >
            {isLast ? "Let's go →" : <>Next <ChevronRight size={13} /></>}
          </button>
        </div>
      </div>
    </>
  );
}
