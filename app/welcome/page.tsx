'use client';

import Link from 'next/link';
import { Briefcase, Sparkles, Search, MessageSquare, ArrowRight } from 'lucide-react';

const FEATURES = [
  { icon: Briefcase, title: 'Track applications', desc: 'Paste a job URL and it gets parsed into your tracker automatically — company, role, deadline, full description.' },
  { icon: Sparkles, title: 'AI-tailored everything', desc: 'Cover letters, fit gaps, and resume bullets generated from your actual resume for each specific job.' },
  { icon: Search, title: 'Real job leads', desc: 'Hunt Agent searches live job boards and only ever shows postings with a real, working link.' },
  { icon: MessageSquare, title: 'Coach + mock interviews', desc: 'Chat with an AI that remembers your background, or run a 5-question mock interview before the real one.' },
];

export default function WelcomePage() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px', boxSizing: 'border-box',
    }}>
      <div style={{ width: '100%', maxWidth: '640px' }}>

        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <div className="brand-orb" style={{ margin: '0 auto 16px' }}>
            <div className="brand-orb-halo" />
            <div className="brand-orb-ring-outer" />
            <div className="brand-orb-ring-mid" />
            <div className="brand-orb-ring-inner" />
            <div className="brand-orb-core" />
          </div>
          <h1 style={{ color: 'rgba(232,244,255,0.95)', fontSize: '26px', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
            Career Dashboard
          </h1>
          <p style={{ color: 'rgba(170,205,235,0.80)', fontSize: '14px', margin: '8px 0 0', lineHeight: 1.6 }}>
            An AI-powered job search command center — built for students applying to internships and new-grad roles.
          </p>
        </div>

        <div style={{
          background: 'rgba(125,220,255,0.055)', backdropFilter: 'blur(24px)',
          border: '1px solid rgba(125,220,255,0.14)', borderRadius: '18px',
          padding: '28px', display: 'flex', flexDirection: 'column', gap: '18px', marginBottom: '24px',
        }}>
          {FEATURES.map(f => (
            <div key={f.title} style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '8px', flexShrink: 0,
                background: 'rgba(125,220,255,0.08)', border: '1px solid rgba(125,220,255,0.16)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <f.icon size={15} color="#7DF4FC" />
              </div>
              <div>
                <div style={{ color: 'rgba(232,244,255,0.95)', fontSize: '14px', fontWeight: 700, marginBottom: '3px' }}>{f.title}</div>
                <div style={{ color: 'rgba(170,205,235,0.80)', fontSize: '12px', lineHeight: 1.55 }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{
          background: 'rgba(125,220,255,0.04)', border: '1px solid rgba(125,220,255,0.10)',
          borderRadius: '10px', padding: '14px 16px', marginBottom: '24px',
          color: 'rgba(158,202,242,0.72)', fontSize: '12px', lineHeight: 1.6,
        }}>
          No accounts, no signup. You bring your own free Anthropic API key (typical cost: a few cents a day), and everything stays in your browser — nothing is stored on a server you don&apos;t control.
        </div>

        <Link href="/setup" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          background: 'linear-gradient(135deg, rgba(74,158,248,0.3), rgba(125,244,252,0.22))',
          color: '#7DF4FC', border: '1px solid rgba(125,244,252,0.32)', borderRadius: '12px',
          padding: '14px 24px', fontSize: '14px', fontWeight: 700, textDecoration: 'none',
          boxShadow: '0 0 24px -6px rgba(125,244,252,0.35)',
        }}>
          Get Started <ArrowRight size={15} />
        </Link>

        <p style={{ textAlign: 'center', color: 'rgba(125,175,230,0.35)', fontSize: '11px', marginTop: '20px' }}>
          Open source · Your data stays with you
        </p>
      </div>
    </div>
  );
}
