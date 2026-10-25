/** Isometric projection shared by every set. 2:1 diamond tiles. */
export const TW = 64;
export const TH = 32;
export interface Pt { x: number; y: number }
export const iso = (gx: number, gy: number): Pt => ({ x: ((gx - gy) * TW) / 2, y: ((gx + gy) * TH) / 2 });
export const up = (p: Pt, h: number): Pt => ({ x: p.x, y: p.y - h });
export const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
export const lerpP = (a: Pt, b: Pt, u: number): Pt => ({ x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u) });
export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a), 0, 1);
/** Depth key for painter's sort: larger = nearer the viewer. */
export const depthOf = (gx: number, gy: number, footprint = 1) => gx + gy + footprint;
/** Corners of an fp×fp cell block whose top-left cell is (gx,gy), as screen points at height h. */
export function corners(gx: number, gy: number, fp: number, h = 0): [Pt, Pt, Pt, Pt] {
  return [iso(gx, gy), iso(gx + fp, gy), iso(gx + fp, gy + fp), iso(gx, gy + fp)].map((p) => up(p, h)) as [Pt, Pt, Pt, Pt];
}
export const flat = (pts: Pt[]) => pts.flatMap((p) => [p.x, p.y]);
