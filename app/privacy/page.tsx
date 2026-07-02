import Link from 'next/link';

export const metadata = { title: 'Privacy Policy — jobs_' };

export default function PrivacyPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', boxSizing: 'border-box' }}>
      <div style={{ width: '100%', maxWidth: '640px' }}>

        <div style={{ marginBottom: '32px' }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <span style={{ color: 'var(--text)', fontSize: '20px', fontWeight: 700, letterSpacing: '-0.02em', fontFamily: 'inherit' }}>
              jobs<span style={{ color: 'var(--accent)' }}>_</span>
            </span>
          </Link>
          <h1 style={{ color: 'var(--text)', fontSize: '22px', fontWeight: 700, margin: '16px 0 6px', letterSpacing: '-0.02em' }}>Privacy Policy</h1>
          <p style={{ color: 'var(--text-dim)', fontSize: '12px', margin: 0 }}>Last updated: July 2, 2026</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.7 }}>

          <section>
            <h2 style={{ color: 'var(--text)', fontSize: '14px', fontWeight: 700, marginBottom: '8px' }}>What jobs_ is</h2>
            <p>jobs_ is a personal job tracking tool. You create a local account (no email or password required) and use it to save, score, and manage job listings. Your data lives in your account on our servers and is not shared with anyone.</p>
          </section>

          <section>
            <h2 style={{ color: 'var(--text)', fontSize: '14px', fontWeight: 700, marginBottom: '8px' }}>What data we store</h2>
            <p>We store what you explicitly give us: your name, resume, job listings you save, and any notes or cover letters you generate. We store a randomly generated user ID to identify your account. We do not require or store your email address, password, or any other personal identifier.</p>
          </section>

          <section>
            <h2 style={{ color: 'var(--text)', fontSize: '14px', fontWeight: 700, marginBottom: '8px' }}>Chrome extension</h2>
            <p>The jobs_ Chrome extension reads the URL and page title of the tab you are actively viewing when you click the extension icon. This URL is sent to your jobs_ account to parse and save the job posting. The extension stores your jobs_ user ID locally using Chrome&apos;s storage API so it can associate saved jobs with your account. The extension does not track your browsing, does not run on pages unless you click the icon, and does not send data to any third party.</p>
          </section>

          <section>
            <h2 style={{ color: 'var(--text)', fontSize: '14px', fontWeight: 700, marginBottom: '8px' }}>AI features</h2>
            <p>When you use AI features (scoring, cover letters, coach), your resume and the relevant job description are sent to an AI provider (currently Groq) to generate a response. We do not use your data to train AI models. Groq&apos;s zero data retention policy applies to these requests.</p>
          </section>

          <section>
            <h2 style={{ color: 'var(--text)', fontSize: '14px', fontWeight: 700, marginBottom: '8px' }}>Third parties</h2>
            <p>We do not sell, rent, or share your data with third parties for advertising or any commercial purpose. The only external service that touches your data is Groq, used solely to process AI requests.</p>
          </section>

          <section>
            <h2 style={{ color: 'var(--text)', fontSize: '14px', fontWeight: 700, marginBottom: '8px' }}>Data deletion</h2>
            <p>Your data is tied to your local user ID. If you clear your browser storage, your access to the account is lost. To request deletion of your data from our servers, contact us at the email below.</p>
          </section>

          <section>
            <h2 style={{ color: 'var(--text)', fontSize: '14px', fontWeight: 700, marginBottom: '8px' }}>Contact</h2>
            <p>Questions: <a href="mailto:nicmoffett5@gmail.com" style={{ color: 'var(--accent)', textDecoration: 'none' }}>nicmoffett5@gmail.com</a></p>
          </section>

        </div>

        <p style={{ marginTop: '40px', color: 'var(--text-dim)', fontSize: '11px' }}>
          <Link href="/" style={{ color: 'inherit', textDecoration: 'underline' }}>Back to dashboard</Link>
        </p>

      </div>
    </div>
  );
}
