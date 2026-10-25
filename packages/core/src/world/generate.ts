import { hashString, mulberry32 } from "./prng.js";
import { footprintOf, heightClass, scoreFiles, type Scored } from "./relevance.js";
import type { District, GenerateOptions, Path, Place, Rect, World } from "./types.js";
import { profileRepo } from "./profile.js";

/**
 * Deterministic world layout. Same repoId + same file list → identical World.
 *
 * Shape: a hub (forge) at the origin; districts (top-level folders) packed in a
 * ring around it, each a square patch with buildings spiral-packed from its
 * centre by relevance; beacons (tests) on an outer ring near their district;
 * the dock on the outer ring at a seeded angle. Paths join each district to the hub.
 */
export function generateWorld(opts: GenerateOptions): World {
  const cap = opts.cap ?? 60;
  const beaconCap = opts.beaconCap ?? 8;
  // Force-include only the first `touchedCap` touched files (callers pass them most-active first); the rest get an overflow building per district.
  const touchedCap = opts.touchedCap ?? 48;
  const touched = new Set((opts.touched ?? []).map(norm).slice(0, touchedCap));
  const seed = hashString(opts.repoId);
  const rnd = mulberry32(seed);
  const files = opts.files.map((f) => ({ ...f, path: norm(f.path) }));
  const scored = scoreFiles(files, touched);
  const maxLoc = Math.max(1, ...scored.map((s) => s.loc));

  // ---- selection: touched always; then by score within caps ----
  const byScore = [...scored].sort((a, b) => b.score - a.score || a.file.path.localeCompare(b.file.path));
  const beacons = pick(byScore.filter((s) => s.kind === "beacon"), beaconCap);
  const others = pick(byScore.filter((s) => s.kind !== "beacon"), cap);
  const selected = [...others, ...beacons];
  const capped = selected.length < scored.length;

  // ---- districts: group by top-level folder ----
  const groups = new Map<string, Scored[]>();
  for (const s of others) {
    const d = topDir(s.file.path);
    (groups.get(d) ?? groups.set(d, []).get(d)!).push(s);
  }
  const names = [...groups.keys()].sort();
  const occupied = new Set<string>();
  const places: Place[] = [];
  const districts: District[] = [];

  // hub
  const forge: Place = { id: "forge", kind: "forge", path: "", label: "forge", district: "", gx: 0, gy: 0, footprint: 2, height: 2, score: 0, touched: false };
  claim(occupied, forge);
  places.push(forge);

  // district patches around the hub, ring-packed deterministically
  let ring = 3;
  const placedRects: Rect[] = [{ x: -2, y: -2, w: 4, h: 4 }];
  const jitter = rnd() * Math.PI * 2;
  names.forEach((name, i) => {
    const items = groups.get(name)!.sort((a, b) => b.score - a.score || a.file.path.localeCompare(b.file.path));
    const cells = items.reduce((n, s) => n + footprintOf(heightClass(s.loc, maxLoc)) ** 2, 0);
    const side = Math.max(3, Math.ceil(Math.sqrt(cells * 1.45)));
    const angle = jitter + (i / Math.max(1, names.length)) * Math.PI * 2;
    let r = ring + side / 2;
    let rect: Rect;
    for (;;) {
      const cx = Math.round(Math.cos(angle) * r);
      const cy = Math.round(Math.sin(angle) * r * 0.8);
      rect = { x: cx - Math.floor(side / 2), y: cy - Math.floor(side / 2), w: side, h: side };
      if (!placedRects.some((o) => overlaps(o, rect, 0))) break;
      r += 1;
    }
    placedRects.push(rect);
    ring = Math.max(ring, r - side / 2);
    const d: District = { id: `d:${name}`, label: name === "" ? "/" : `${name}/`, bounds: rect, cx: rect.x + Math.floor(rect.w / 2), cy: rect.y + Math.floor(rect.h / 2), placeIds: [] };
    for (const s of items) {
      const h = heightClass(s.loc, maxLoc);
      const fp = footprintOf(h);
      const spot = spiralSpot(occupied, d.cx, d.cy, fp, rect);
      const p: Place = { id: `p:${s.file.path}`, kind: s.kind as Place["kind"], path: s.file.path, label: base(s.file.path), district: d.id, gx: spot[0], gy: spot[1], footprint: fp, height: h, score: round3(s.score), touched: s.touched };
      claim(occupied, p);
      places.push(p);
      d.placeIds.push(p.id);
    }
    districts.push(d);
  });

  // outer ring: beacons near their district (or hub), dock at a seeded angle
  const outer = Math.ceil(maxExtent(placedRects)) + 1;
  for (const s of beacons) {
    const home = districts.find((d) => d.id === `d:${topDir(s.file.path)}`);
    const ang = home ? Math.atan2(home.cy, home.cx) : rnd() * Math.PI * 2;
    const spot = ringSpot(occupied, ang, outer, 1);
    const p: Place = { id: `p:${s.file.path}`, kind: "beacon", path: s.file.path, label: base(s.file.path), district: home?.id ?? "", gx: spot[0], gy: spot[1], footprint: 1, height: 4, score: round3(s.score), touched: s.touched };
    claim(occupied, p);
    places.push(p);
    home?.placeIds.push(p.id);
  }
  const dockSpot = ringSpot(occupied, jitter + Math.PI, outer + 1, 2);
  const dock: Place = { id: "dock", kind: "dock", path: "", label: "dock", district: "", gx: dockSpot[0], gy: dockSpot[1], footprint: 2, height: 1, score: 0, touched: false };
  claim(occupied, dock);
  places.push(dock);

  // paths: each district centre → hub; dock → hub
  const paths: Path[] = districts.map((d) => ({ from: d.id, to: "forge", points: [[d.cx, d.cy], [Math.round(d.cx / 2), Math.round(d.cy / 2)], [0, 0]] }));
  paths.push({ from: "dock", to: "forge", points: [[dock.gx, dock.gy], [0, 0]] });

  // overflow: one shared building per district that had files cut, so unplaced activity still lands in the right area
  if (capped) {
    for (const d of districts) {
      const top = d.id.slice(2);
      const total = scored.filter((s) => s.kind !== "beacon" && topDir(s.file.path) === top).length;
      if (total <= d.placeIds.length) continue;
      const spot = spiralSpot(occupied, d.cx, d.cy, 1, d.bounds);
      const p: Place = { id: `p:${top ? top + "/" : ""}…`, kind: "overflow", path: `${top ? top + "/" : ""}…`, label: `+${total - d.placeIds.length} more`, district: d.id, gx: spot[0], gy: spot[1], footprint: 1, height: 2, score: 0, touched: false };
      claim(occupied, p); places.push(p); d.placeIds.push(p.id);
    }
  }
  const bounds = boundsOf(places, 2);
  const profile = profileRepo(files, opts.manifests ?? {});
  return { repoId: opts.repoId, seed, profile, districts, places, paths, bounds, stats: { files: scored.length, placed: selected.length, capped } };
}

// ---- helpers ----
const norm = (p: string) => p.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
const base = (p: string) => p.slice(p.lastIndexOf("/") + 1);
const topDir = (p: string) => (p.includes("/") ? p.slice(0, p.indexOf("/")) : "");
const round3 = (n: number) => Math.round(n * 1000) / 1000;

function pick(sorted: Scored[], cap: number): Scored[] {
  const forced = sorted.filter((s) => s.touched);
  const rest = sorted.filter((s) => !s.touched);
  return [...forced, ...rest.slice(0, Math.max(0, cap - forced.length))];
}

function overlaps(a: Rect, b: Rect, gap: number): boolean {
  return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
}

function cellsOf(gx: number, gy: number, fp: number): string[] {
  const out: string[] = [];
  for (let dx = 0; dx < fp; dx++) for (let dy = 0; dy < fp; dy++) out.push(`${gx + dx},${gy + dy}`);
  return out;
}
function free(occ: Set<string>, gx: number, gy: number, fp: number): boolean {
  return cellsOf(gx, gy, fp).every((c) => !occ.has(c));
}
function claim(occ: Set<string>, p: Place): void {
  for (const c of cellsOf(p.gx, p.gy, p.footprint)) occ.add(c);
}

/** Nearest free fp×fp spot to (cx,cy), spiralling outward in origin-relative steps; prefers the patch, never fails. */
function spiralSpot(occ: Set<string>, cx: number, cy: number, fp: number, rect: Rect): [number, number] {
  let x = 0, y = 0, dx = 0, dy = -1;
  let fallback: [number, number] | null = null;
  for (let i = 0; i < 4096; i++) {
    const gx = cx + x - Math.floor(fp / 2), gy = cy + y - Math.floor(fp / 2);
    if (free(occ, gx, gy, fp)) {
      const inside = gx >= rect.x - 1 && gy >= rect.y - 1 && gx + fp <= rect.x + rect.w + 1 && gy + fp <= rect.y + rect.h + 1;
      if (inside) return [gx, gy];
      fallback ??= [gx, gy];
      if (i > 600) return fallback;
    }
    if (x === y || (x < 0 && x === -y) || (x > 0 && x === 1 - y)) [dx, dy] = [-dy, dx];
    x += dx; y += dy;
  }
  return fallback ?? [cx, cy];
}

/** Free spot on a ring of given radius, scanning angles outward from `ang`. */
function ringSpot(occ: Set<string>, ang: number, radius: number, fp: number): [number, number] {
  for (let r = radius; r < radius + 40; r++) {
    for (let k = 0; k < 64; k++) {
      const a = ang + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 32);
      const gx = Math.round(Math.cos(a) * r), gy = Math.round(Math.sin(a) * r * 0.85);
      if (free(occ, gx, gy, fp)) return [gx, gy];
    }
  }
  return [radius, 0];
}

function maxExtent(rects: Rect[]): number {
  return Math.max(...rects.map((r) => Math.max(Math.abs(r.x), Math.abs(r.x + r.w), Math.abs(r.y), Math.abs(r.y + r.h))));
}
function boundsOf(places: Place[], pad: number): Rect {
  const xs = places.flatMap((p) => [p.gx, p.gx + p.footprint]);
  const ys = places.flatMap((p) => [p.gy, p.gy + p.footprint]);
  const x = Math.min(...xs) - pad, y = Math.min(...ys) - pad;
  return { x, y, w: Math.max(...xs) + pad - x, h: Math.max(...ys) + pad - y };
}
