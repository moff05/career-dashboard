'use client';

import { useState, useEffect, useRef } from 'react';
import { X, ChevronRight } from 'lucide-react';
import { useOverlays } from '@/app/OverlayContext';
import { createPortal } from 'react-dom';

interface TourStep {
  title: string;
  body: string;
  target?: string;
  type: 'center' | 'spotlight' | 'in-modal';
  advance: 'manual' | 'profileOpen' | 'profileClosed';
  primaryLabel?: string;
  skipLabel?: string;
  skipToStep?: number;
}

const STEPS: TourStep[] = [
  {
    type: 'center',
    title: 'Welcome to jobs_',
    body: 'Your job tracker with AI built in. This takes 2 minutes and gets you fully set up. You can skip at any point.',
    advance: 'manual',
    primaryLabel: 'Take the tour',
    skipLabel: 'Skip',
    skipToStep: 5,
  },
  {
    type: 'spotlight',
    title: 'Open Profile',
    body: 'First, set up your AI key. Click the Profile button in the top right — the tour will move forward automatically.',
    target: 'button[aria-label="Profile"]',
    advance: 'profileOpen',
    skipLabel: 'Skip setup',
    skipToStep: 4,
  },
  {
    type: 'in-modal',
    title: 'Tap the ?',
    body: 'This shows how to get a free API key. New Anthropic accounts start with $5 free — no card needed to get started.',
    target: 'button[aria-label="How to get an API key"]',
    advance: 'manual',
    primaryLabel: 'Got it, next',
    skipLabel: 'Skip API setup',
    skipToStep: 4,
  },
  {
    type: 'in-modal',
    title: 'Add your key and close',
    body: 'Paste your key (starts with sk-ant-) into the API Key field and tap Save. When you\'re done, click the button below.',
    advance: 'manual',
    primaryLabel: 'Done, close Profile',
    skipLabel: 'Skip for now',
    skipToStep: 4,
  },
  {
    type: 'spotlight',
    title: 'Add your first job',
    body: 'Paste a job URL or description. The AI scores your fit, finds your gaps, and tailors your resume bullets — all automatically the first time you open the job.',
    target: '[data-tutorial="add-job"]',
    advance: 'manual',
    primaryLabel: 'Got it',
  },
  {
    type: 'center',
    title: "You're all set",
    body: 'Expand any job to see your AI score, fit gaps, and tailored bullets. Use Coach for personalized advice. Replay this tour from Profile whenever you need it.',
    advance: 'manual',
    primaryLabel: 'Start tracking',
  },
];

const CARD_W = 300;
const SPAD = 8;

function useTargetRect(selector: string | undefined, step: number) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (!selector) { setRect(null); return; }
    const measure = () => {
      const el = document.querySelector(selector);
      setRect(el ? el.getBoundingClientRect() : null);
      return !!el;
    };
    // Poll until the target element appears in the DOM (handles elements that
    // render after a data fetch, e.g. the Add a Job button on step 4)
    if (!measure()) {
      const interval = setInterval(() => { if (measure()) clearInterval(interval); }, 100);
      window.addEventListener('resize', measure);
      return () => { clearInterval(interval); window.removeEventListener('resize', measure); };
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [selector, step]);
  return rect;
}

function Arrow({ placeBelow, arrowLeft }: { placeBelow: boolean; arrowLeft: number }) {
  return (
    <>
      <div style={{
        position: 'absolute', left: arrowLeft,
        [placeBelow ? 'top' : 'bottom']: -7,
        width: 0, height: 0,
        borderLeft: '7px solid transparent', borderRight: '7px solid transparent',
        [placeBelow ? 'borderBottom' : 'borderTop']: '7px solid var(--border)',
      }} />
      <div style={{
        position: 'absolute', left: arrowLeft + 1,
        [placeBelow ? 'top' : 'bottom']: -6,
        width: 0, height: 0,
        borderLeft: '6px solid transparent', borderRight: '6px solid transparent',
        [placeBelow ? 'borderBottom' : 'borderTop']: '6px solid var(--bg)',
      }} />
    </>
  );
}

function CardContent({ current, step, total, showPrimary, isLast, onNext, onSkip }: {
  current: TourStep; step: number; total: number;
  showPrimary: boolean; isLast: boolean;
  onNext: () => void; onSkip: (to?: number) => void;
}) {
  return (
    <>
      <div style={{ color: 'var(--text)', fontWeight: 700, fontSize: '14px', marginBottom: '8px', paddingRight: '20px' }}>
        {current.title}
      </div>
      <div style={{ color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.65, marginBottom: '16px' }}>
        {current.body}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '14px' }}>
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} style={{
            width: i === step ? '14px' : '5px', height: '5px', borderRadius: '3px',
            backgroundColor: i === step ? 'var(--accent)' : 'var(--border-hi)',
            transition: 'width 0.2s, background-color 0.2s',
          }} />
        ))}
        <span style={{ marginLeft: 'auto', color: 'var(--text-dim)', fontSize: '10px' }}>{step + 1}/{total}</span>
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        {current.skipLabel && (
          <button
            onClick={() => onSkip(current.skipToStep)}
            className="btn-ghost"
            style={{
              flex: showPrimary ? 1 : undefined,
              width: !showPrimary ? '100%' : undefined,
              justifyContent: 'center', fontSize: '12px', padding: '6px 10px',
            }}
          >
            {current.skipLabel}
          </button>
        )}
        {showPrimary && (
          <button
            onClick={onNext}
            className="btn-primary"
            style={{
              flex: current.skipLabel ? 2 : undefined,
              width: !current.skipLabel ? '100%' : undefined,
              justifyContent: 'center', fontSize: '12px', padding: '6px 12px',
            }}
          >
            {isLast
              ? (current.primaryLabel || "Let's go")
              : <>{current.primaryLabel || 'Next'} <ChevronRight size={12} /></>
            }
          </button>
        )}
      </div>
    </>
  );
}

function tooltipPos(r: DOMRect) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const placeBelow = r.bottom < vh * 0.6;
  const cardTop = placeBelow
    ? Math.min(r.bottom + SPAD + 10, vh - 240)
    : Math.max(16, r.top - SPAD - 10 - 220);
  const idealLeft = r.left + r.width / 2 - CARD_W / 2;
  const cardLeft = Math.max(16, Math.min(idealLeft, vw - CARD_W - 16));
  const arrowLeft = Math.max(12, Math.min(r.left + r.width / 2 - cardLeft, CARD_W - 12));
  return { placeBelow, cardTop, cardLeft, arrowLeft };
}

export function TutorialModal() {
  const { tutorialOpen, closeTutorial, profileOpen, closeProfile } = useOverlays();
  const [step, setStep] = useState(0);
  const [mounted, setMounted] = useState(false);
  const prevRectRef = useRef<DOMRect | null>(null);

  useEffect(() => { setMounted(true); }, []);

  const current = STEPS[step];
  const rect = useTargetRect(current.target, step);

  // Keep last-known rect so spotlight fades in/out without jumping to 0,0
  if (rect) prevRectRef.current = rect;
  const displayRect = rect ?? prevRectRef.current;
  const hasTarget = !!current.target;

  // Auto-advance based on Profile open/close state
  useEffect(() => {
    if (!tutorialOpen) return;
    if (step === 1 && profileOpen) { setStep(2); return; }
    if (step === 2 && !profileOpen) { setStep(4); return; } // closed before tapping ?
    if (step === 3 && !profileOpen) { setStep(4); return; }
  }, [profileOpen, tutorialOpen, step]);

  function handleClose() {
    localStorage.setItem('cid_tutorial_done', '1');
    setStep(0);
    closeTutorial();
  }

  function handleNext() {
    if (step === 3 && profileOpen) {
      closeProfile(); // useEffect watches profileClosed and advances to step 4
    } else if (step < STEPS.length - 1) {
      setStep(s => s + 1);
    } else {
      handleClose();
    }
  }

  function handleSkip(toStep?: number) {
    if (toStep !== undefined && toStep < STEPS.length) setStep(toStep);
    else handleClose();
  }

  if (!tutorialOpen || !mounted) return null;

  const isLast = step === STEPS.length - 1;
  const showPrimary = current.advance === 'manual';
  const inModal = current.type === 'in-modal';
  const isCenter = current.type === 'center' || (!rect && !inModal);

  // Card position
  let cardStyle: React.CSSProperties;
  let arrowNode: React.ReactNode = null;

  if (isCenter) {
    cardStyle = {
      position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
      width: `min(${CARD_W + 24}px, calc(100vw - 32px))`,
      borderRadius: 'var(--r-lg)', padding: '28px 24px 20px',
      background: 'var(--bg)', border: '1px solid var(--border)', zIndex: 600,
    };
  } else if (inModal && !rect) {
    cardStyle = {
      position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
      width: `min(${CARD_W + 24}px, calc(100vw - 32px))`,
      background: 'var(--bg)', border: '1px solid var(--border)',
      borderRadius: 'var(--r-lg)', padding: '18px 18px 14px', zIndex: 602,
    };
  } else if (rect) {
    const { placeBelow, cardTop, cardLeft, arrowLeft } = tooltipPos(rect);
    cardStyle = {
      position: 'fixed', top: cardTop, left: cardLeft, width: CARD_W,
      background: 'var(--bg)', border: '1px solid var(--border)',
      borderRadius: 'var(--r-lg)', padding: '18px 18px 14px',
      zIndex: inModal ? 602 : 600,
    };
    arrowNode = <Arrow placeBelow={placeBelow} arrowLeft={arrowLeft} />;
  } else {
    cardStyle = { display: 'none' };
  }

  const closeBtn = (
    <button
      onClick={handleClose}
      style={{ position: 'absolute', top: '10px', right: '10px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: '4px', lineHeight: 1 }}
    >
      <X size={13} />
    </button>
  );

  return createPortal(
    <>
      {/* Dim backdrop for center steps */}
      {isCenter && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 598,
          pointerEvents: 'none', animation: 'fade-in 0.2s ease-out',
        }} />
      )}

      {/* Spotlight — stays in DOM while displayRect exists so opacity can transition smoothly.
          Fades in when a target step is entered, fades out when leaving. Position transitions
          handle the slide between two targeted steps (e.g. Profile btn → ? btn). */}
      {displayRect && (
        <div style={{
          position: 'fixed',
          top: displayRect.top - SPAD, left: displayRect.left - SPAD,
          width: displayRect.width + SPAD * 2, height: displayRect.height + SPAD * 2,
          borderRadius: '8px',
          opacity: hasTarget ? 1 : 0,
          boxShadow: `0 0 0 9999px rgba(0,0,0,${inModal ? 0.5 : 0.72}), inset 0 0 0 2px var(--accent)`,
          zIndex: inModal ? 601 : 599,
          pointerEvents: 'none',
          transition: 'opacity 0.22s ease, top 0.28s cubic-bezier(0.4,0,0.2,1), left 0.28s cubic-bezier(0.4,0,0.2,1), width 0.28s cubic-bezier(0.4,0,0.2,1), height 0.28s cubic-bezier(0.4,0,0.2,1)',
        }} />
      )}

      {/* Card — key remounts on step change. Tooltip cards use page-enter (slide up + fade);
          centered/bottom-bar cards use fade-in only (transform would break their centering). */}
      <div key={step} style={{ ...cardStyle, animation: `${isCenter || (inModal && !rect) ? 'fade-in' : 'page-enter'} 0.2s cubic-bezier(0.16,1,0.3,1)` }}>
        {closeBtn}
        {arrowNode}
        <CardContent current={current} step={step} total={STEPS.length}
          showPrimary={showPrimary} isLast={isLast} onNext={handleNext} onSkip={handleSkip} />
      </div>
    </>,
    document.body
  );
}
