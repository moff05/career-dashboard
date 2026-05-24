'use client';

import './globals.css';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Briefcase,
  MessageSquare,
  CalendarDays,
  User,
  Zap,
} from 'lucide-react';

const navItems = [
  { href: '/tracker',  label: 'Jobs',     icon: Briefcase },
  { href: '/coach',    label: 'Coach',    icon: MessageSquare },
  { href: '/analyze',  label: 'Analyze',  icon: Zap },
  { href: '/timeline', label: 'Timeline', icon: CalendarDays },
  { href: '/profile',  label: 'Profile',  icon: User },
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
          ::-webkit-scrollbar-track { background: #1a1a1a; }
          ::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
          ::-webkit-scrollbar-thumb:hover { background: #444; }
          input[type=date]::-webkit-calendar-picker-indicator { filter: invert(0.4); }
          select option { background: #1e1e1e; }
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `}</style>
      </head>
      <body style={{ margin: 0, padding: 0, backgroundColor: '#1a1a1a' }}>
        <div style={{ display: 'flex', minHeight: '100vh' }}>

          {/* Sidebar */}
          <aside style={{
            width: '208px', minHeight: '100vh',
            backgroundColor: '#181818',
            borderRight: '1px solid #242424',
            position: 'fixed', top: 0, left: 0, bottom: 0,
            display: 'flex', flexDirection: 'column',
            zIndex: 50,
          }}>
            {/* Brand */}
            <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid #222' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '32px', height: '32px', borderRadius: '8px',
                  backgroundColor: '#d97706',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '13px', fontWeight: 800, color: '#fff',
                  letterSpacing: '-0.5px', flexShrink: 0,
                }}>
                  NM
                </div>
                <div>
                  <div style={{ color: '#d0d0d0', fontWeight: 600, fontSize: '13px', lineHeight: 1.2 }}>
                    Nicholas Moffett
                  </div>
                  <div style={{ color: '#555', fontSize: '10px', marginTop: '2px' }}>
                    Career Dashboard
                  </div>
                </div>
              </div>
            </div>

            {/* Nav */}
            <nav style={{ padding: '8px 0', flex: 1 }}>
              <div style={{ padding: '8px 12px 4px' }}>
                <span style={{ color: '#3a3a3a', fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  Navigation
                </span>
              </div>
              {navItems.map(({ href, label, icon: Icon }) => {
                const isActive = pathname === href || pathname.startsWith(href + '/');
                return (
                  <Link key={href} href={href} style={{
                    display: 'flex', alignItems: 'center', gap: '9px',
                    padding: '8px 14px 8px 12px',
                    textDecoration: 'none',
                    color: isActive ? '#e0e0e0' : '#565656',
                    backgroundColor: isActive ? '#222' : 'transparent',
                    borderLeft: isActive ? '2px solid #d97706' : '2px solid transparent',
                    fontSize: '13px', fontWeight: isActive ? 500 : 400,
                    transition: 'all 0.12s ease',
                    position: 'relative',
                  }}
                    onMouseEnter={e => {
                      if (!isActive) {
                        (e.currentTarget as HTMLAnchorElement).style.color = '#999';
                        (e.currentTarget as HTMLAnchorElement).style.backgroundColor = '#1e1e1e';
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isActive) {
                        (e.currentTarget as HTMLAnchorElement).style.color = '#565656';
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
            <div style={{ padding: '12px 16px', borderTop: '1px solid #222' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{
                  width: '6px', height: '6px', borderRadius: '50%',
                  backgroundColor: '#d97706', flexShrink: 0,
                }} />
                <span style={{ color: '#3a3a3a', fontSize: '11px' }}>Powered by Claude</span>
              </div>
              <div style={{ color: '#2e2e2e', fontSize: '10px', marginTop: '3px', paddingLeft: '12px' }}>
                UM · Class of 2027
              </div>
            </div>
          </aside>

          {/* Main */}
          <main style={{
            marginLeft: '208px', flex: 1, minHeight: '100vh',
            backgroundColor: '#1a1a1a', overflow: 'auto',
          }}>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
