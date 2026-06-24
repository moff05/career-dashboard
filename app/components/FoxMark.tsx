// Tall, clearly separated pointed ears with a real notch between them,
// flared cheeks, and a long tapered snout — v1 was a blunt hexagon-ish
// blob that didn't read as a fox at any size; this is built specifically
// around the features that make a fox silhouette recognizable as a fox.
const FOX_PATH = 'M 20 8 L 38 30 L 50 24 L 62 30 L 80 8 L 88 38 L 92 52 L 70 75 L 50 95 L 30 75 L 8 52 L 12 38 Z';
// A white/cream muzzle patch — without it, three flat dark cutouts on solid
// orange reads as a jack-o-lantern, not a fox. This one shape is what
// breaks that association; the eyes are also slanted slivers now instead
// of equilateral triangles, which were the most pumpkin-coded part.
const MUZZLE_PATH = 'M 38 54 L 50 49 L 62 54 L 50 95 Z';
const EYES_AND_NOSE = [
  'M 30 47 L 42 39 L 40 47 Z',
  'M 70 47 L 58 39 L 60 47 Z',
  'M 47 78 L 53 78 L 50 86 Z',
];

// Geometric brand mark — the one warm/organic touch against an otherwise
// monochrome system. Static, no idle animation (the old "companion orb"
// breathed and spun; this is a mark, not a character). Holds up down to
// ~16px, verified — keep `cutout` matched to whatever it sits on so the
// negative-space eye/nose details don't show a seam.
export function FoxMark({ size = 28, color = '#F97316', muzzle = '#FBE8D6', cutout = '#101012' }: { size?: number; color?: string; muzzle?: string; cutout?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden="true">
      <path d={FOX_PATH} fill={color} />
      <path d={MUZZLE_PATH} fill={muzzle} />
      {EYES_AND_NOSE.map(d => <path key={d} d={d} fill={cutout} />)}
    </svg>
  );
}
