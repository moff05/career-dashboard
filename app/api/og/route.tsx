import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0A0A0A',
          fontFamily: 'monospace',
          gap: '20px',
        }}
      >
        <div
          style={{
            fontSize: '96px',
            fontWeight: 700,
            color: '#F5F5F5',
            letterSpacing: '-3px',
            display: 'flex',
          }}
        >
          jobs<span style={{ color: '#F97316' }}>_</span>
        </div>
        <div
          style={{
            fontSize: '28px',
            color: '#9CA3AF',
            textAlign: 'center',
            lineHeight: 1.5,
            maxWidth: '800px',
          }}
        >
          A job tracker with AI fit scoring, cover letter
          generation, and a coach that knows your resume.
        </div>
        <div
          style={{
            display: 'flex',
            gap: '32px',
            marginTop: '16px',
          }}
        >
          {['Fit scoring', 'Cover letters', 'Coach'].map((label) => (
            <div
              key={label}
              style={{
                color: '#6B7280',
                fontSize: '18px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span style={{ color: '#F97316' }}>›</span> {label}
            </div>
          ))}
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
