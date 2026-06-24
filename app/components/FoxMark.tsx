const FOX_PATH = 'M 50 12 L 23 2 L 28 31 L 6 36 L 26 51 L 17 68 L 50 90 L 83 68 L 74 51 L 94 36 L 72 31 L 77 2 Z';
const FOX_DETAILS = [
  'M 36 47 L 30 38 L 41 40 Z',
  'M 64 47 L 70 38 L 59 40 Z',
  'M 50 78 L 43 66 L 57 66 Z',
];

// Geometric brand mark — the one warm/organic touch against an otherwise
// monochrome system. Static, no idle animation (the old "companion orb"
// breathed and spun; this is a mark, not a character). Holds up down to
// ~16px, verified — keep `cutout` matched to whatever it sits on so the
// negative-space face details don't show a seam.
export function FoxMark({ size = 28, color = '#F97316', cutout = '#0A0A0A' }: { size?: number; color?: string; cutout?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden="true">
      <path d={FOX_PATH} fill={color} />
      {FOX_DETAILS.map(d => <path key={d} d={d} fill={cutout} />)}
    </svg>
  );
}
