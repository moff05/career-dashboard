'use client';

import './globals.css';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Briefcase, MessageSquare, CalendarDays, User } from 'lucide-react';

const navItems = [
  { href: '/',        label: 'Dashboard', icon: LayoutDashboard },
  { href: '/tracker', label: 'Jobs',      icon: Briefcase },
  { href: '/coach',   label: 'Coach',     icon: MessageSquare },
  { href: '/timeline',label: 'Timeline',  icon: CalendarDays },
  { href: '/profile', label: 'Profile',   icon: User },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <html lang="en">
      <head>
        <style>{`
          * { box-sizing: border-box; }
          body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
          ::-webkit-scrollbar { width: 6px; height: 6px; }
          ::-webkit-scrollbar-track { background: #0a0a0a; }
          ::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 3px; }
          ::-webkit-scrollbar-thumb:hover { background: #3a3a3a; }
          input[type=date]::-webkit-calendar-picker-indicator { filter: invert(0.4); }
          select option { background: #111; }
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes barGrow { from { width: 0%; } to { } }
        `}</style>
      </head>
      <body style={{ margin: 0, padding: 0, backgroundColor: '#0a0a0a' }}>
        <div style={{ display: 'flex', minHeight: '100vh' }}>
          <aside style={{
            width: '200px', minHeight: '100vh',
            backgroundColor: '#0d0d0d',
            borderRight: '1px solid #1a1a1a',
            position: 'fixed', top: 0, left: 0, bottom: 0,
            display: 'flex', flexDirection: 'column',
            zIndex: 50,
          }}>
            {/* Brand */}
            <div style={{ padding: '20px 16px 18px', borderBottom: '1px solid #1a1a1a' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '34px', height: '34px', borderRadius: '8px',
                  background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '13px', fontWeight: 800, color: '#000',
                  letterSpacing: '-0.5px', flexShrink: 0,
                  boxShadow: '0 0 16px rgba(245,158,11,0.3)',
                }}>
                  NM
                </div>
                <div>
                  <div style={{ color: '#e8e8e8', fontWeight: 700, fontSize: '13px', lineHeight: 1.2 }}>
                    Nicholas M.
                  </div>
                  <div style={{ color: '#444', fontSize: '10px', marginTop: '2px' }}>
                    UM · Class of 2027
                  </div>
                </div>
              </div>
            </div>

            {/* Nav */}
            <nav style={{ padding: '10px 0', flex: 1 }}>
              {navItems.map(({ href, label, icon: Icon }) => {
                const isActive = href === '/' ? pathname === '/' : (pathname === href || pathname.startsWith(href + '/'));
                return (
                  <Link key={href} href={href} style={{
                    display: 'flex', alignItems: 'center', gap: '9px',
                    padding: '9px 16px',
                    textDecoration: 'none',
                    color: isActive ? '#f0f0f0' : '#585858',
                    backgroundColor: isActive ? '#181818' : 'transparent',
                    borderLeft: isActive ? '2px solid #f59e0b' : '2px solid transparent',
                    fontSize: '13px', fontWeight: isActive ? 600 : 400,
                    transition: 'all 0.1s ease',
                  }}
                    onMouseEnter={e => {
                      if (!isActive) {
                        (e.currentTarget as HTMLAnchorElement).style.color = '#b0b0b0';
                        (e.currentTarget as HTMLAnchorElement).style.backgroundColor = '#131313';
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isActive) {
                        (e.currentTarget as HTMLAnchorElement).style.color = '#585858';
                        (e.currentTarget as HTMLAnchorElement).style.backgroundColor = 'transparent';
                      }
                    }}
                  >
                    <Icon size={14} style={{ flexShrink: 0 }} />
                    {label}
                  </Link>
                );
              })}
            </nav>

            {/* Footer */}
            <div style={{ padding: '14px 16px', borderTop: '1px solid #1a1a1a' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#22c55e', flexShrink: 0, boxShadow: '0 0 6px rgba(34,197,94,0.6)' }} />
                <span style={{ color: '#444', fontSize: '10px' }}>Powered by Claude</span>
              </div>
            </div>
          </aside>

          <main style={{ marginLeft: '200px', flex: 1, minHeight: '100vh', backgroundColor: '#0a0a0a', overflow: 'auto' }}>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
