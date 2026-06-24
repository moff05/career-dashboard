// Tall, clearly separated pointed ears with a real notch between them,
// flared cheeks, and a long tapered snout — v1 was a blunt hexagon-ish
// blob that didn't read as a fox at any size; this is built specifically
// around the features that make a fox silhouette recognizable as a fox.
const FOX_PATH = 'M 20 8 L 38 30 L 50 24 L 62 30 L 80 8 L 88 38 L 92 52 L 70 75 L 50 95 L 30 75 L 8 52 L 12 38 Z';
const FOX_DETAILS = [
  'M 33 48 L 40 41 L 45 50 Z',
  'M 67 48 L 60 41 L 55 50 Z',
  'M 50 84 L 45 72 L 55 72 Z',
];

// Geometric brand mark — the one warm/organic touch against an otherwise
// monochrome system. Static, no idle animation (the old "companion orb"
// breathed and spun; this is a mark, not a character). Holds up down to
// ~16px, verified — keep `cutout` matched to whatever it sits on so the
// negative-space face details don't show a seam.
export function FoxMark({ size = 28, color = '#F97316', cutout = '#101012' }: { size?: number; color?: string; cutout?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden="true">
      <path d={FOX_PATH} fill={color} />
      {FOX_DETAILS.map(d => <path key={d} d={d} fill={cutout} />)}
    </svg>
  );
}
