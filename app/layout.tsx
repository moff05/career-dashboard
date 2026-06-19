'use client';

import './globals.css';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Briefcase, Compass, MessageSquare, CalendarDays, User, BarChart2, Brain } from 'lucide-react';
import { ClientRoot } from './ClientRoot';
import { useUser } from './hooks/useUser';

const navItems = [
  { href: '/',          label: 'Home',      icon: LayoutDashboard },
  { href: '/tracker',   label: 'Jobs',      icon: Briefcase },
  { href: '/discover',  label: 'Discover',  icon: Compass },
  { href: '/coach',     label: 'Coach',     icon: MessageSquare },
  { href: '/analytics', label: 'Analytics', icon: BarChart2 },
  { href: '/timeline',  label: 'Timeline',  icon: CalendarDays },
  { href: '/profile',   label: 'Profile',   icon: User },
  { href: '/memory',    label: 'Memory',    icon: Brain },
];

function CompanionOrb() {
  return (
    <div className="companion-section">
      <span className="companion-label">Neural Link</span>

      <div className="companion-orb">
        <div className="orb-mega-halo" />
        <div className="orb-ring-outer" />
        <div className="orb-ring-mid" />
        <div className="orb-ring-inner" />
        <div className="orb-core" />
      </div>

      <div className="companion-status">
        <div className="companion-status-dot" />
        Claude · Active
      </div>
    </div>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { userId } = useUser();

  // Derive initials from stored name (set after setup)
  const initials = (() => {
    if (typeof window === 'undefined') return 'CD';
    const name = localStorage.getItem('cid_display_name') || '';
    return name ? name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() : 'CD';
  })();

  const mobileNavItems = navItems.filter(n =>
    ['/', '/tracker', '/discover', '/coach', '/profile'].includes(n.href)
  );

  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,300;14..32,400;14..32,500;14..32,600;14..32,700;14..32,800&display=swap"
          rel="stylesheet"
        />
        <style>{`
          @keyframes spin     { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          @keyframes fadeIn   { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes slideUp  { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes barGrow  { from { width: 0%; } }
        `}</style>
      </head>
      <body>
        <ClientRoot>
        <div style={{ display: 'flex', minHeight: '100vh' }}>

          {/* ── Sidebar ─────────────────────────────────────────── */}
          <aside className="app-sidebar">

            {/* Brand / User */}
            <div style={{
              padding: '18px 16px 16px',
              borderBottom: '1px solid rgba(125, 220, 255, 0.09)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {/* Avatar */}
                <div style={{
                  width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
                  background: 'linear-gradient(135deg, #4A9EF8, #7DF4FC)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '13px', fontWeight: 800, color: '#03091A', letterSpacing: '-0.5px',
                  boxShadow: '0 0 0 1px rgba(125,244,252,0.3), 0 0 20px rgba(125,244,252,0.2)',
                }}>{initials}</div>

                <div style={{ minWidth: 0 }}>
                  <div style={{
                    color: 'rgba(232, 244, 255, 0.95)',
                    fontWeight: 700, fontSize: '13px',
                    lineHeight: 1.2, letterSpacing: '-0.01em',
                  }}>{typeof window !== 'undefined' ? (localStorage.getItem('cid_display_name') || 'You') : 'You'}</div>
                  <div style={{
                    color: 'rgba(125, 175, 230, 0.55)',
                    marginTop: '2px', letterSpacing: '0.03em',
                    fontFamily: 'monospace', fontSize: '9px',
                  }}>{userId ? userId.slice(0, 8) + '…' : '—'}</div>
                </div>
              </div>
            </div>

            {/* Companion Orb */}
            <CompanionOrb />

            {/* Nav */}
            <nav style={{ padding: '4px 10px', flex: 1 }}>
              {navItems.map(({ href, label, icon: Icon }) => {
                const isActive = href === '/'
                  ? pathname === '/'
                  : pathname === href || pathname.startsWith(href + '/');
                return (
                  <Link key={href} href={href} className={`nav-item${isActive ? ' active' : ''}`}>
                    <Icon size={14} className="nav-icon" />
                    {label}
                  </Link>
                );
              })}
            </nav>

            {/* Bottom status bar */}
            <div style={{
              padding: '12px 16px',
              borderTop: '1px solid rgba(125, 220, 255, 0.08)',
              display: 'flex', alignItems: 'center', gap: '6px',
            }}>
              <div style={{
                width: '5px', height: '5px', borderRadius: '50%',
                background: '#34d399',
                boxShadow: '0 0 8px rgba(52,211,153,0.7)',
              }} />
              <span style={{ color: 'rgba(125, 175, 230, 0.45)', fontSize: '10px', letterSpacing: '0.05em' }}>
                Powered by Claude
              </span>
            </div>
          </aside>

          {/* ── Main ──────────────────────────────────────────── */}
          <main className="app-main">
            <div key={pathname} className="page-enter">
              {children}
            </div>
          </main>

        </div>

        {/* Mobile bottom nav */}
        <nav className="bottom-nav">
          {mobileNavItems.map(({ href, label, icon: Icon }) => {
            const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Link key={href} href={href} className={isActive ? 'active' : ''}>
                <Icon size={18} />
                {label}
              </Link>
            );
          })}
        </nav>
        </ClientRoot>
      </body>
    </html>
  );
}
