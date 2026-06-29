import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#0A0A0A',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '5px',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontFamily: 'monospace',
            fontSize: '17px',
            fontWeight: 800,
            letterSpacing: '-0.5px',
          }}
        >
          <span style={{ color: '#F5F5F5' }}>j</span>
          <span style={{ color: '#F97316' }}>_</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
