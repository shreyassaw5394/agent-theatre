import { hashString, mulberry32 } from "./prng.js";
import { footprintOf, heightClass, scoreFiles, type Scored } from "./relevance.js";
import type { District, GenerateOptions, LayoutStyle, Path, Place, Rect, World } from "./types.js";
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
  const forge: Place = { id: "forge", kind: "forge", path: "", label: "forge", district: "", gx: -1, gy: -1, footprint: 2, height: 2, score: 0, touched: false };
  places.push(forge);

  // district patches, arranged by layout style
  const layout: LayoutStyle = opts.layout ?? LAYOUTS[seed % LAYOUTS.length]!;
  const jitter = rnd() * Math.PI * 2;
  const sized = names.map((name) => {
    const items = groups.get(name)!.sort((a, b) => b.score - a.score || a.file.path.localeCompare(b.file.path));
    const cells = items.reduce((n, s) => n + footprintOf(heightClass(s.loc, maxLoc)) ** 2, 0);
    const side = Math.max(3, Math.ceil(Math.sqrt(cells * 1.45)));
    return { name, items, side };
  });
  const placedRects: Rect[] = [];
  const hubRect: Rect = { x: -2, y: -2, w: 4, h: 4 };
  const rects = layoutRects(layout, sized.map((d) => d.side), hubRect, jitter, rnd);
  placedRects.push(hubRect, ...rects);
  // hub position may move with the layout (strip/terrace/spine); re-place the forge
  const hub = hubFor(layout, rects);
  forge.gx = hub[0]; forge.gy = hub[1]; occupied.clear(); claim(occupied, forge);
  sized.forEach((d0, i) => {
    const rect = rects[i]!;
    const d: District = { id: `d:${d0.name}`, label: d0.name === "" ? "/" : `${d0.name}/`, bounds: rect, cx: rect.x + Math.floor(rect.w / 2), cy: rect.y + Math.floor(rect.h / 2), placeIds: [] };
    for (const s of d0.items) {
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
  let ring = Math.ceil(maxExtent(placedRects));

  // outer ring: beacons near their district (or hub), dock at a seeded angle
  void ring;
  // reserve every district rectangle (plus a 1-tile moat) so rim features never land between buildings
  for (const r of placedRects) for (let x = r.x - 1; x < r.x + r.w + 1; x++) for (let y = r.y - 1; y < r.y + r.h + 1; y++) occupied.add(`${x},${y}`);
  for (const s of beacons) {
    const home = districts.find((d) => d.id === `d:${topDir(s.file.path)}`);
    const spot = home ? edgeSpot(occupied, home, forge, 1) : nearSpot(occupied, forge.gx + 1, forge.gy + 1, rnd() * Math.PI * 2, 4, 1);
    const p: Place = { id: `p:${s.file.path}`, kind: "beacon", path: s.file.path, label: base(s.file.path), district: home?.id ?? "", gx: spot[0], gy: spot[1], footprint: 1, height: 4, score: round3(s.score), touched: s.touched };
    claim(occupied, p);
    places.push(p);
    home?.placeIds.push(p.id);
  }
  const dockSpot = nearSpot(occupied, forge.gx + 1, forge.gy + 1, jitter + Math.PI, 5, 2);
  const dock: Place = { id: "dock", kind: "dock", path: "", label: "dock", district: "", gx: dockSpot[0], gy: dockSpot[1], footprint: 2, height: 1, score: 0, touched: false };
  claim(occupied, dock);
  places.push(dock);

  const paths = layoutPaths(layout, districts, forge, dock);

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
  return { repoId: opts.repoId, seed, layout, profile, districts, places, paths, bounds, stats: { files: scored.length, placed: selected.length, capped } };
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

export const LAYOUTS: readonly LayoutStyle[] = ["ring", "grid", "strip", "scatter", "terrace", "spine"];

/** District rectangles for a layout. Deterministic for (style, sides, jitter, rnd). Never overlapping, never touching the hub. */
function layoutRects(style: LayoutStyle, sides: number[], hub: Rect, jitter: number, rnd: () => number): Rect[] {
  const n = sides.length, out: Rect[] = [];
  const maxSide = Math.max(3, ...sides);
  const fits = (r: Rect) => !overlaps(hub, r, 1) && !out.some((o) => overlaps(o, r, 1));
  const push = (x: number, y: number, side: number) => { const r = { x, y, w: side, h: side }; out.push(r); return r; };
  switch (style) {
    case "grid": {
      // row-major shelves: each row as tall as its tallest district, columns packed tight, hub cell skipped
      const cols = Math.max(2, Math.ceil(Math.sqrt(n + 1)));
      const cells: Array<{ x: number; y: number }> = [];
      let y = 0, i = 0;
      while (i < n) {
        const row = sides.slice(i, i + cols), rowH = Math.max(...row) + 2;
        let x = 0; for (const w of row) { cells.push({ x, y }); x += w + 2; }
        y += rowH; i += cols;
      }
      const totalW = Math.max(...cells.map((c, j) => c.x + sides[j]!)), totalH = y;
      for (let j = 0; j < n; j++) {
        let rect: Rect = { x: cells[j]!.x - Math.round(totalW / 2), y: cells[j]!.y - Math.round(totalH / 2), w: sides[j]!, h: sides[j]! };
        while (!fits(rect)) rect = { ...rect, x: rect.x + 1 };
        out.push(rect);
      }
      return out;
    }
    case "strip": {
      const total = sides.reduce((a, b) => a + b + 2, 0);
      let x = Math.round(-total / 2) + 6;
      for (let i = 0; i < n; i++) { const wobble = Math.round((rnd() - 0.5) * 3); push(x, wobble - Math.floor(sides[i]! / 2), sides[i]!); x += sides[i]! + 2; }
      return out;
    }
    case "terrace": {
      let x = -Math.round(n * (maxSide + 1) / 2), y = -Math.round(n * (maxSide + 1) * 0.3);
      for (let i = 0; i < n; i++) { push(x, y, sides[i]!); x += sides[i]! + 1; y += Math.round(sides[i]! * 0.6) + 1; }
      return out;
    }
    case "spine": {
      let y = -Math.round(n * (maxSide + 2) / 4);
      for (let i = 0; i < n; i++) { const left = i % 2 === 0; push(left ? -sides[i]! - 3 : 3, y, sides[i]!); if (!left) y += maxSide + 2; }
      return out;
    }
    case "scatter": {
      for (let i = 0; i < n; i++) {
        let R = 5 + maxSide, placed = false;
        for (let tries = 0; tries < 400 && !placed; tries++) {
          const a = jitter + rnd() * Math.PI * 2, r = R * (0.5 + rnd() * 0.7);
          const rect: Rect = { x: Math.round(Math.cos(a) * r), y: Math.round(Math.sin(a) * r * 0.8), w: sides[i]!, h: sides[i]! };
          if (fits(rect)) { out.push(rect); placed = true; }
          if (tries % 40 === 39) R += 2;
        }
        if (!placed) push(R + i * 2, 0, sides[i]!);
      }
      return out;
    }
    default: { // ring
      let ring = 3;
      for (let i = 0; i < n; i++) {
        const side = sides[i]!, angle = jitter + (i / Math.max(1, n)) * Math.PI * 2;
        let r = ring + side / 2, rect: Rect;
        for (;;) {
          const cx = Math.round(Math.cos(angle) * r), cy = Math.round(Math.sin(angle) * r * 0.8);
          rect = { x: cx - Math.floor(side / 2), y: cy - Math.floor(side / 2), w: side, h: side };
          if (fits(rect)) break;
          r += 1;
        }
        out.push(rect); ring = Math.max(ring, r - side / 2);
      }
      return out;
    }
  }
}

/** Where the forge/hub sits for a layout: centre for ring/scatter/grid, an end for strip/terrace/spine. */
function hubFor(style: LayoutStyle, rects: Rect[]): [number, number] {
  if (!rects.length) return [-1, -1];
  const minX = Math.min(...rects.map((r) => r.x)), minY = Math.min(...rects.map((r) => r.y));
  switch (style) {
    case "strip": return [minX - 5, -1];
    case "terrace": return [minX - 5, minY - 1];
    case "spine": return [-1, minY - 5];
    default: return [-1, -1];
  }
}

/** Paths by layout: spokes (ring/scatter), L-shaped streets (grid/spine), a chain (strip/terrace). */
function layoutPaths(style: LayoutStyle, districts: District[], forge: Place, dock: Place): Path[] {
  const hub: [number, number] = [forge.gx + 1, forge.gy + 1];
  const paths: Path[] = [];
  if (style === "strip" || style === "terrace") {
    const ordered = [...districts].sort((a, b) => a.cx - b.cx || a.cy - b.cy);
    let prev: [number, number] = hub, prevId = "forge";
    for (const d of ordered) { paths.push({ from: prevId, to: d.id, points: [prev, [d.cx, d.cy]] }); prev = [d.cx, d.cy]; prevId = d.id; }
  } else if (style === "grid" || style === "spine") {
    for (const d of districts) paths.push({ from: d.id, to: "forge", points: [[d.cx, d.cy], [d.cx, hub[1]], hub] });
  } else {
    for (const d of districts) paths.push({ from: d.id, to: "forge", points: [[d.cx, d.cy], [Math.round((d.cx + hub[0]) / 2), Math.round((d.cy + hub[1]) / 2)], hub] });
  }
  paths.push({ from: "dock", to: "forge", points: [[dock.gx, dock.gy], hub] });
  return paths;
}

/**
 * Re-arrange an existing world in another layout. Keeps every id, kind, height
 * and footprint; only positions, paths and bounds change — so beats directed
 * against the old world still name valid places. Used by the stage so each
 * set can show the same repo in its own arrangement.
 */
export function relayoutWorld(world: World, layout: LayoutStyle): World {
  if (world.layout === layout) return world;
  const seed = world.seed;
  const rnd = mulberry32(seed ^ 0x51ed270b ^ LAYOUTS.indexOf(layout));
  const occupied = new Set<string>();
  const places: Place[] = [];
  const forge: Place = { ...world.places.find((p) => p.kind === "forge")!, gx: -1, gy: -1 };
  places.push(forge);
  const jitter = rnd() * Math.PI * 2;
  const groups = world.districts.map((d) => ({ d, items: world.places.filter((p) => p.district === d.id && (p.kind === "building" || p.kind === "archive" || p.kind === "overflow")).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)) }));
  const sized = groups.map((g) => { const cells = g.items.reduce((n, p) => n + p.footprint ** 2, 0); return { ...g, side: Math.max(3, Math.ceil(Math.sqrt(cells * 1.45))) }; });
  const hubRect: Rect = { x: -2, y: -2, w: 4, h: 4 };
  const rects = layoutRects(layout, sized.map((d) => d.side), hubRect, jitter, rnd);
  const placedRects: Rect[] = [hubRect, ...rects];
  const hub = hubFor(layout, rects);
  forge.gx = hub[0]; forge.gy = hub[1]; claim(occupied, forge);
  const districts: District[] = sized.map((g, i) => {
    const rect = rects[i]!;
    const d: District = { ...g.d, bounds: rect, cx: rect.x + Math.floor(rect.w / 2), cy: rect.y + Math.floor(rect.h / 2), placeIds: [] };
    for (const old of g.items) {
      const spot = spiralSpot(occupied, d.cx, d.cy, old.footprint, rect);
      const p: Place = { ...old, gx: spot[0], gy: spot[1] };
      claim(occupied, p); places.push(p); d.placeIds.push(p.id);
    }
    return d;
  });
  const ring = Math.ceil(maxExtent(placedRects));
  void ring;
  for (const r of placedRects) for (let x = r.x - 1; x < r.x + r.w + 1; x++) for (let y = r.y - 1; y < r.y + r.h + 1; y++) occupied.add(`${x},${y}`);
  for (const old of world.places.filter((p) => p.kind === "beacon")) {
    const home = districts.find((d) => d.id === old.district);
    const spot = home ? edgeSpot(occupied, home, forge, 1) : nearSpot(occupied, forge.gx + 1, forge.gy + 1, rnd() * Math.PI * 2, 4, 1);
    const p: Place = { ...old, gx: spot[0], gy: spot[1] };
    claim(occupied, p); places.push(p); home?.placeIds.push(p.id);
  }
  const dockSpot = nearSpot(occupied, forge.gx + 1, forge.gy + 1, jitter + Math.PI, 5, 2);
  const dock: Place = { ...world.places.find((p) => p.kind === "dock")!, gx: dockSpot[0], gy: dockSpot[1] };
  claim(occupied, dock); places.push(dock);
  const paths = layoutPaths(layout, districts, forge, dock);
  return { ...world, layout, districts, places, paths, bounds: boundsOf(places, 2) };
}

/** Like ringSpot but around an arbitrary centre. */
function nearSpot(occ: Set<string>, cx: number, cy: number, ang: number, radius: number, fp: number): [number, number] {
  for (let r = radius; r < radius + 40; r++) {
    for (let k = 0; k < 64; k++) {
      const a = ang + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 32);
      const gx = Math.round(cx + Math.cos(a) * r), gy = Math.round(cy + Math.sin(a) * r * 0.85);
      if (free(occ, gx, gy, fp)) return [gx, gy];
    }
  }
  return [cx + radius, cy];
}
/** A cell just outside a district, on the side facing away from the hub — where that folder's beacon stands. */
function edgeSpot(occ: Set<string>, d: District, hub: Place, fp: number): [number, number] {
  const ang = Math.atan2(d.cy - hub.gy, d.cx - hub.gx);
  const r0 = Math.ceil(Math.max(d.bounds.w, d.bounds.h) / 2) + 2;
  return nearSpot(occ, d.cx, d.cy, ang, r0, fp);
}
