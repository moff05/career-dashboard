'use client';

import './globals.css';
import React from 'react';
import { usePathname } from 'next/navigation';
import { User, MessageSquare, Users, Building2, Share2, Check } from 'lucide-react';
import { ClientRoot } from './ClientRoot';
import { useUser } from './hooks/useUser';
import { OverlayProvider, useOverlays } from './OverlayContext';
import { CoachPanel } from './components/CoachPanel';
import { ProfilePanel } from './components/ProfilePanel';
import { ConnectionsPanel } from './components/ConnectionsPanel';
import { CompaniesPanel } from './components/CompaniesPanel';
import { FeedbackWidget } from './components/FeedbackWidget';

function Header() {
  const { displayName } = useUser();
  const { openCoach, openProfile, openConnections, openCompanies } = useOverlays();
  const initials = displayName
    ? displayName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
    : '';
  const [shared, setShared] = React.useState(false);
  function handleShare() {
    navigator.clipboard.writeText("been using jobs_ to track my applications — does AI fit scoring, cover letters, the whole thing. free: https://career-dashboard-ten.vercel.app");
    setShared(true);
    setTimeout(() => setShared(false), 2000);
  }

  return (
    <header className="app-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ color: 'var(--text)', fontWeight: 700, fontSize: '14px', letterSpacing: '-0.01em' }}>
          jobs<span style={{ color: 'var(--accent)' }}>_</span>
        </span>
        <button onClick={handleShare} aria-label="Share" style={{ background: 'none', border: 'none', padding: '4px', cursor: 'pointer', color: shared ? 'var(--success)' : 'var(--text-dim)', display: 'flex', alignItems: 'center', transition: 'color 0.15s' }}
          onMouseEnter={e => { if (!shared) e.currentTarget.style.color = 'var(--text-muted)'; }}
          onMouseLeave={e => { if (!shared) e.currentTarget.style.color = 'var(--text-dim)'; }}>
          {shared ? <Check size={13} /> : <Share2 size={13} />}
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button onClick={() => openCompanies()} className="header-btn" aria-label="Companies">
          <Building2 size={14} /> <span className="header-btn-label">Companies</span>
        </button>
        <button onClick={() => openConnections()} className="header-btn" aria-label="Connections">
          <Users size={14} /> <span className="header-btn-label">Connections</span>
        </button>
        <button onClick={() => openCoach()} className="header-btn" aria-label="Coach">
          <MessageSquare size={14} /> <span className="header-btn-label">Coach</span>
        </button>
        <button onClick={() => openProfile()} className="header-btn" style={{ gap: '8px' }} aria-label="Profile">
          {initials ? (
            <span style={{ width: '18px', height: '18px', borderRadius: '4px', background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)' }}>{initials}</span>
          ) : <User size={14} />}
          <span className="header-btn-label">Profile</span>
        </button>
      </div>
    </header>
  );
}

function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isStandalone = pathname === '/welcome' || pathname === '/setup' || pathname === '/extension' || pathname === '/privacy';

  if (isStandalone) return <>{children}</>;

  return (
    <>
      <Header />
      <main className="app-main">
        <div key={pathname} className="page-enter">
          {children}
        </div>
      </main>
      <CoachPanel />
      <ProfilePanel />
      <ConnectionsPanel />
      <CompaniesPanel />
      <FeedbackWidget />
    </>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>jobs_</title>
        <meta name="description" content="A job tracker with AI fit scoring, cover letter generation, and a coach that knows your resume." />
        <meta property="og:title" content="jobs_" />
        <meta property="og:description" content="A job tracker with AI fit scoring, cover letter generation, and a coach that knows your resume." />
        <meta property="og:url" content={process.env.NEXT_PUBLIC_BASE_URL ?? 'https://career-dashboard-ten.vercel.app'} />
        <meta property="og:type" content="website" />
        <meta property="og:image" content={`${process.env.NEXT_PUBLIC_BASE_URL ?? 'https://career-dashboard-ten.vercel.app'}/api/og`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="jobs_" />
        <meta name="twitter:description" content="A job tracker with AI fit scoring, cover letter generation, and a coach that knows your resume." />
        <meta name="twitter:image" content={`${process.env.NEXT_PUBLIC_BASE_URL ?? 'https://career-dashboard-ten.vercel.app'}/api/og`} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&display=swap"
          rel="stylesheet"
        />
        <style>{`
          @keyframes spin    { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          @keyframes fadeIn  { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes slideUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes barGrow { from { width: 0%; } }
        `}</style>
      </head>
      <body>
        <ClientRoot>
          <OverlayProvider>
            <AppShell>{children}</AppShell>
          </OverlayProvider>
        </ClientRoot>
      </body>
    </html>
  );
}
