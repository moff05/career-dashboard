import Link from 'next/link';

const STEPS = [
  { n: '1', title: 'Browse any job posting', desc: 'Works on LinkedIn, Greenhouse, Lever, Workday, company career pages — anywhere.' },
  { n: '2', title: 'Click the jobs_ icon', desc: 'Hit the extension in your Chrome toolbar. It reads the page URL automatically.' },
  { n: '3', title: 'Done', desc: 'The job is parsed, added to your tracker, and ready to score — no tab switching.' },
];

const DEV_STEPS = [
  'Download the extension folder from GitHub',
  'Open chrome://extensions in a new tab',
  'Enable Developer Mode (toggle, top right)',
  'Click "Load unpacked" → select the extension folder',
  'Pin the jobs_ icon to your toolbar',
];

export default function ExtensionPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', boxSizing: 'border-box' }}>
      <div style={{ width: '100%', maxWidth: '600px' }}>

        {/* Wordmark */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <h1 style={{ color: 'var(--text)', fontSize: '26px', fontWeight: 700, margin: 0, letterSpacing: '-0.02em', fontFamily: 'inherit' }}>
              jobs<span style={{ color: 'var(--accent)' }}>_</span>
            </h1>
          </Link>
        </div>

        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '10px' }}>Chrome Extension</div>
          <h2 style={{ color: 'var(--text)', fontSize: '22px', fontWeight: 700, margin: '0 0 10px', letterSpacing: '-0.02em' }}>
            Clip any job in one click
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.6, margin: 0 }}>
            Hit the extension on any job page — it parses the posting and adds it to your tracker automatically. No copying links, no tab switching.
          </p>
        </div>

        {/* How it works */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '22px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {STEPS.map(s => (
            <div key={s.n} style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
              <div style={{ width: '26px', height: '26px', borderRadius: 'var(--r)', flexShrink: 0, background: 'var(--border-dim)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', fontSize: '11px', fontWeight: 700 }}>
                {s.n}
              </div>
              <div>
                <div style={{ color: 'var(--text)', fontSize: '13px', fontWeight: 700, marginBottom: '3px' }}>{s.title}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.55 }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Install — Web Store (coming soon) */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '22px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{ color: 'var(--text)', fontSize: '13px', fontWeight: 700 }}>Chrome Web Store</div>
            <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--accent)', background: 'var(--accent-bg)', border: '1px solid var(--accent-dim)', borderRadius: 'var(--r-sm)', padding: '2px 7px' }}>Coming soon</span>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.55, margin: '0 0 14px' }}>
            One-click install with automatic updates. Under review — check back shortly.
          </p>
          <button disabled style={{ display: 'block', width: '100%', padding: '10px 16px', fontFamily: 'inherit', fontSize: '13px', fontWeight: 700, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', background: 'var(--border-dim)', color: 'var(--text-dim)', cursor: 'not-allowed' }}>
            Add to Chrome
          </button>
        </div>

        {/* Install — Developer mode */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '22px', marginBottom: '24px' }}>
          <div style={{ color: 'var(--text)', fontSize: '13px', fontWeight: 700, marginBottom: '4px' }}>Install manually (beta)</div>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.55, margin: '0 0 16px' }}>
            While the extension is pending review, you can load it directly from the source.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
            {DEV_STEPS.map((step, i) => (
              <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--accent)', fontSize: '11px', fontWeight: 700, flexShrink: 0, minWidth: '14px' }}>{i + 1}.</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.55 }}>{step}</span>
              </div>
            ))}
          </div>
          <a
            href="https://github.com/moff05/career-dashboard/tree/main/extension"
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'block', width: '100%', padding: '10px 16px', fontFamily: 'inherit', fontSize: '13px', fontWeight: 700, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: 'pointer', textAlign: 'center', textDecoration: 'none', boxSizing: 'border-box' }}
          >
            View on GitHub →
          </a>
        </div>

        {/* Footer */}
        <p style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: '11px' }}>
          Chrome only · <Link href="/" style={{ color: 'inherit', textDecoration: 'underline' }}>Back to dashboard</Link> · <Link href="/privacy" style={{ color: 'inherit', textDecoration: 'underline' }}>Privacy</Link>
        </p>

      </div>
    </div>
  );
}
