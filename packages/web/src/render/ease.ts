/**
 * The only easing functions in the codebase. Linear is deliberately absent;
 * tests/no-linear.test.ts fails the build if a linear tween appears anywhere.
 */
export const easeInOut = (u: number) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
export const easeOut = (u: number) => 1 - Math.pow(1 - u, 3);
export const easeIn = (u: number) => u * u * u;
/** Material-style standard curve, used for all walks. */
export const walkEase = (u: number) => cubicBezier(0.4, 0, 0.2, 1, u);
export const backOut = (u: number) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); };
export const elasticOut = (u: number) => (u === 0 || u === 1 ? u : Math.pow(2, -10 * u) * Math.sin((u * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1);
/** Smooth 0→1→0 pulse. */
export const bump = (u: number) => Math.sin(Math.PI * Math.min(1, Math.max(0, u)));

function cubicBezier(x1: number, y1: number, x2: number, y2: number, t: number): number {
  // Newton-Raphson on x to find parameter, then evaluate y. 6 iterations is plenty for UI.
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sampleX = (s: number) => ((ax * s + bx) * s + cx) * s;
  const sampleY = (s: number) => ((ay * s + by) * s + cy) * s;
  const slopeX = (s: number) => (3 * ax * s + 2 * bx) * s + cx;
  let s = t;
  for (let i = 0; i < 6; i++) { const d = slopeX(s); if (Math.abs(d) < 1e-6) break; s -= (sampleX(s) - t) / d; }
  return sampleY(Math.min(1, Math.max(0, s)));
}
