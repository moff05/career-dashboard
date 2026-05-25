'use client';

import './globals.css';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Briefcase, Compass, MessageSquare, CalendarDays, User, BarChart2 } from 'lucide-react';

const navItems = [
  { href: '/',          label: 'Dashboard', icon: LayoutDashboard },
  { href: '/tracker',   label: 'Jobs',      icon: Briefcase },
  { href: '/discover',  label: 'Discover',  icon: Compass },
  { href: '/coach',     label: 'Coach',     icon: MessageSquare },
  { href: '/analytics', label: 'Analytics', icon: BarChart2 },
  { href: '/timeline',  label: 'Timeline',  icon: CalendarDays },
  { href: '/profile',   label: 'Profile',   icon: User },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <html lang="en">
      <head>
        <style>{`
          * { box-sizing: border-box; }
          body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
          ::-webkit-scrollbar { width: 5px; height: 5px; }
          ::-webkit-scrollbar-track { background: transparent; }
          ::-webkit-scrollbar-thumb { background: #263a52; border-radius: 10px; }
          ::-webkit-scrollbar-thumb:hover { background: #3a5472; }
          input[type=date]::-webkit-calendar-picker-indicator { filter: invert(0.5); }
          select option { background: #182535; }
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          @keyframes fadeIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes slideUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes barGrow { from { width: 0%; } to { } }
        `}</style>
      </head>
      <body style={{ margin: 0, padding: 0, backgroundColor: '#0e1520' }}>
        <div style={{ display: 'flex', minHeight: '100vh' }}>
          <aside style={{
            width: '210px', minHeight: '100vh',
            background: 'linear-gradient(180deg, #0b0e18 0%, #090c15 100%)',
            borderRight: '1px solid #1e2e42',
            position: 'fixed', top: 0, left: 0, bottom: 0,
            display: 'flex', flexDirection: 'column',
            zIndex: 50,
          }}>
            {/* Brand */}
            <div style={{ padding: '22px 16px 20px', borderBottom: '1px solid #1e2e42' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '10px',
                  background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '13px', fontWeight: 800, color: '#000',
                  letterSpacing: '-0.5px', flexShrink: 0,
                  boxShadow: '0 0 20px rgba(245,158,11,0.3)',
                }}>NM</div>
                <div>
                  <div style={{ color: '#eaf2ff', fontWeight: 700, fontSize: '13px', lineHeight: 1.2 }}>Nicholas M.</div>
                  <div style={{ color: '#507090', fontSize: '10px', marginTop: '2px' }}>UM · Class of 2027</div>
                </div>
              </div>
            </div>

            {/* Nav */}
            <nav style={{ padding: '10px 10px', flex: 1 }}>
              {navItems.map(({ href, label, icon: Icon }) => {
                const isActive = href === '/' ? pathname === '/' : (pathname === href || pathname.startsWith(href + '/'));
                return (
                  <Link key={href} href={href} style={{
                    display: 'flex', alignItems: 'center', gap: '9px',
                    padding: '9px 12px', textDecoration: 'none',
                    color: isActive ? '#eaf2ff' : '#7098b8',
                    backgroundColor: isActive ? 'rgba(245,158,11,0.12)' : 'transparent',
                    borderRadius: '10px', fontSize: '13px', fontWeight: isActive ? 600 : 400,
                    transition: 'all 0.15s ease', marginBottom: '2px',
                    border: isActive ? '1px solid rgba(245,158,11,0.22)' : '1px solid transparent',
                  }}
                    onMouseEnter={e => {
                      if (!isActive) {
                        (e.currentTarget as HTMLAnchorElement).style.color = '#c0d8f0';
                        (e.currentTarget as HTMLAnchorElement).style.backgroundColor = 'rgba(255,255,255,0.05)';
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isActive) {
                        (e.currentTarget as HTMLAnchorElement).style.color = '#7098b8';
                        (e.currentTarget as HTMLAnchorElement).style.backgroundColor = 'transparent';
                      }
                    }}
                  >
                    <Icon size={14} style={{ flexShrink: 0, color: isActive ? '#f59e0b' : 'inherit' }} />
                    {label}
                  </Link>
                );
              })}
            </nav>

            {/* Footer */}
            <div style={{ padding: '14px 16px', borderTop: '1px solid #1e2e42' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981', flexShrink: 0, boxShadow: '0 0 8px rgba(16,185,129,0.6)' }} />
                <span style={{ color: '#507090', fontSize: '10px' }}>Powered by Claude</span>
              </div>
            </div>
          </aside>

          <main style={{ marginLeft: '210px', flex: 1, minHeight: '100vh', backgroundColor: '#0e1520', overflow: 'auto' }}>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
