'use client';

import { useState, useEffect } from 'react';
import { X, ChevronRight } from 'lucide-react';
import { useOverlays } from '@/app/OverlayContext';

interface Step {
  title: string;
  body: string;
  targetSelector?: string;
}

const STEPS: Step[] = [
  {
    title: 'Welcome to jobs_',
    body: 'Your job tracker with AI built in. Track every application, get an AI fit score for each job, and get personalized coaching — all in one place.',
  },
  {
    title: 'Set up your API key first',
    body: "All AI features run on your own Anthropic API key. New accounts get $5 free credit — no payment needed to start. Tap Profile, then tap the ? next to \"API Key\" for step-by-step instructions.",
    targetSelector: 'button[aria-label="Profile"]',
  },
  {
    title: 'Add your first job',
    body: 'Paste a job URL or description and the AI scores your fit, finds your gaps, and tailors your resume bullets — all at once, automatically the first time you open the job.',
    targetSelector: '#tutorial-add-job',
  },
  {
    title: "You're all set",
    body: 'Open any job to expand it and see your AI score, fit gaps, and tailored bullets. The Coach button gives personalized advice anytime. Replay this tutorial from Profile whenever you need it.',
  },
];

const TOOLTIP_W = 300;
const PAD = 10;

function useTargetRect(selector: string | undefined, step: number) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!selector) { setRect(null); return; }
    const measure = () => {
      const el = document.querySelector(selector);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [selector, step]);

  return rect;
}

export function TutorialModal() {
  const { tutorialOpen, closeTutorial } = useOverlays();
  const [step, setStep] = useState(0);

  const current = STEPS[step];
  const rect = useTargetRect(current.targetSelector, step);
  const isLast = step === STEPS.length - 1;

  function handleClose() {
    localStorage.setItem('cid_tutorial_done', '1');
    setStep(0);
    closeTutorial();
  }

  function handleNext() {
    if (!isLast) setStep(s => s + 1);
    else handleClose();
  }

  if (!tutorialOpen) return null;

  // Centered card (no target)
  if (!rect || !current.targetSelector) {
    return (
      <>
        <div className="overlay-backdrop" onClick={handleClose} />
        <div
          className="overlay-panel center-modal"
          style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: `${TOOLTIP_W + 24}px`, borderRadius: 'var(--r-lg)', padding: '28px 24px 20px' }}
        >
          <button onClick={handleClose} style={{ position: 'absolute', top: '12px', right: '12px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: '4px', lineHeight: 1 }}>
            <X size={14} />
          </button>
          <CardContent current={current} step={step} isLast={isLast} onNext={handleNext} onClose={handleClose} />
        </div>
      </>
    );
  }

  // Determine tooltip position: below target if target is in upper 60% of screen, else above
  const viewH = window.innerHeight;
  const placeBelow = rect.bottom < viewH * 0.6;

  const tooltipTop = placeBelow
    ? rect.bottom + PAD + 10
    : rect.top - PAD - 10 - 200; // approximate height

  // Center tooltip over target, clamped to viewport
  const idealLeft = rect.left + rect.width / 2 - TOOLTIP_W / 2;
  const tooltipLeft = Math.max(16, Math.min(idealLeft, window.innerWidth - TOOLTIP_W - 16));

  // Arrow horizontal offset relative to tooltip
  const arrowCenter = rect.left + rect.width / 2;
  const arrowLeft = Math.max(16, Math.min(arrowCenter - tooltipLeft, TOOLTIP_W - 16));

  return (
    <>
      {/* Dimmed backdrop — rendered behind the spotlight cutout */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 398, pointerEvents: 'none' }} />
      {/* Spotlight cutout using box-shadow trick */}
      <div style={{
        position: 'fixed',
        top: rect.top - PAD,
        left: rect.left - PAD,
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2,
        borderRadius: '8px',
        boxShadow: '0 0 0 9999px rgba(0,0,0,0.72), inset 0 0 0 2px var(--accent)',
        zIndex: 499,
        pointerEvents: 'none',
      }} />
      {/* Backdrop click-to-close layer */}
      <div onClick={handleClose} style={{ position: 'fixed', inset: 0, zIndex: 498, cursor: 'pointer' }} />

      {/* Tooltip card */}
      <div style={{
        position: 'fixed',
        top: tooltipTop,
        left: tooltipLeft,
        width: TOOLTIP_W,
        zIndex: 500,
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-lg)',
        padding: '18px 18px 14px',
      }}>
        {/* Arrow */}
        <div style={{
          position: 'absolute',
          left: arrowLeft,
          [placeBelow ? 'top' : 'bottom']: -7,
          width: 0, height: 0,
          borderLeft: '7px solid transparent',
          borderRight: '7px solid transparent',
          [placeBelow ? 'borderBottom' : 'borderTop']: '7px solid var(--border)',
        }} />
        <div style={{
          position: 'absolute',
          left: arrowLeft + 1,
          [placeBelow ? 'top' : 'bottom']: -6,
          width: 0, height: 0,
          borderLeft: '6px solid transparent',
          borderRight: '6px solid transparent',
          [placeBelow ? 'borderBottom' : 'borderTop']: '6px solid var(--bg)',
        }} />

        <button onClick={handleClose} style={{ position: 'absolute', top: '10px', right: '10px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: '2px', lineHeight: 1 }}>
          <X size={13} />
        </button>

        <CardContent current={current} step={step} isLast={isLast} onNext={handleNext} onClose={handleClose} />
      </div>
    </>
  );
}

function CardContent({ current, step, isLast, onNext, onClose }: {
  current: Step; step: number; isLast: boolean; onNext: () => void; onClose: () => void;
}) {
  return (
    <>
      <div style={{ color: 'var(--text)', fontWeight: 700, fontSize: '14px', marginBottom: '8px', paddingRight: '20px' }}>{current.title}</div>
      <div style={{ color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.65, marginBottom: '16px' }}>{current.body}</div>

      {/* Progress dots */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '14px' }}>
        {STEPS.map((_, i) => (
          <div key={i} style={{
            width: i === step ? '14px' : '5px', height: '5px',
            borderRadius: '3px',
            backgroundColor: i === step ? 'var(--accent)' : 'var(--border-hi)',
            transition: 'width 0.2s, background-color 0.2s',
          }} />
        ))}
        <span style={{ marginLeft: 'auto', color: 'var(--text-dim)', fontSize: '10px' }}>{step + 1}/{STEPS.length}</span>
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        {!isLast && (
          <button onClick={onClose} className="btn-ghost" style={{ flex: 1, justifyContent: 'center', fontSize: '12px', padding: '6px 10px' }}>
            Skip
          </button>
        )}
        <button onClick={onNext} className="btn-primary" style={{ flex: isLast ? undefined : 2, width: isLast ? '100%' : undefined, justifyContent: 'center', fontSize: '12px', padding: '6px 12px' }}>
          {isLast ? "Let's go" : <>Next <ChevronRight size={12} /></>}
        </button>
      </div>
    </>
  );
}
