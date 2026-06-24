'use client';

import './globals.css';
import { usePathname } from 'next/navigation';
import { User, MessageSquare } from 'lucide-react';
import { ClientRoot } from './ClientRoot';
import { useUser } from './hooks/useUser';
import { OverlayProvider, useOverlays } from './OverlayContext';
import { CoachPanel } from './components/CoachPanel';
import { ProfilePanel } from './components/ProfilePanel';
import { FoxMark } from './components/FoxMark';

function Header() {
  const { displayName } = useUser();
  const { openCoach, openProfile } = useOverlays();
  const initials = displayName
    ? displayName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
    : '';

  return (
    <header className="app-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <FoxMark size={24} />
        <span style={{ color: 'var(--text)', fontWeight: 700, fontSize: '14px', letterSpacing: '-0.01em' }}>
          jobs<span style={{ color: 'var(--accent)' }}>_</span>
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button onClick={() => openCoach()} className="nav-item">
          <MessageSquare size={14} /> Coach
        </button>
        <button onClick={() => openProfile()} className="nav-item" style={{ gap: '8px' }}>
          {initials ? (
            <span style={{ width: '18px', height: '18px', borderRadius: '4px', background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)' }}>{initials}</span>
          ) : <User size={14} />}
          Profile
        </button>
      </div>
    </header>
  );
}

function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isOnboarding = pathname === '/welcome' || pathname === '/setup';

  if (isOnboarding) return <>{children}</>;

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
    </>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
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
