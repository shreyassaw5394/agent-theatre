import type { World } from "./types.js";

/** Plan view for terminals and tests: B building, A archive, L beacon, F forge, D dock, # touched. */
export function worldToAscii(w: World): string {
  const { x, y, w: W, h: H } = w.bounds;
  const grid: string[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => "·"));
  const put = (gx: number, gy: number, ch: string) => {
    const r = gy - y, c = gx - x;
    if (r >= 0 && r < H && c >= 0 && c < W) grid[r]![c] = ch;
  };
  for (const p of w.places) {
    const ch = p.touched ? "#" : p.kind === "building" ? "B" : p.kind === "archive" ? "A" : p.kind === "beacon" ? "L" : p.kind === "forge" ? "F" : "D";
    for (let dx = 0; dx < p.footprint; dx++) for (let dy = 0; dy < p.footprint; dy++) put(p.gx + dx, p.gy + dy, ch);
  }
  return grid.map((r) => r.join("")).join("\n");
}
