import { Container, FillGradient, Graphics, Text, TextStyle } from "pixi.js";
import { AdvancedBloomFilter } from "pixi-filters";
import type { Place, World } from "@agent-theatre/core";
import { hashString, mulberry32 } from "@agent-theatre/core";
import { corners, depthOf, flat, iso, lerpP, up, type Pt } from "./iso.js";
import type { Palette, SetTheme } from "../sets/types.js";
import { ARCHITECTURE } from "../sets/architecture.js";

export type LampState = "idle" | "scan" | "fail" | "pass";

interface Drawn { place: Place; g: Graphics; palette: Palette; extraH: number; glow: number; lamp: LampState; scaffold: number; dirty: boolean }

/**
 * Everything that is "the world": terrain, paths, district labels, buildings,
 * beacons, forge, dock, props. Static things draw once; a building redraws
 * only when its own state changes (glow pulse, growth, lamp).
 */
export class WorldLayer {
  readonly container = new Container();
  private readonly terrain = new Graphics();
  private readonly ripples = new Graphics();
  private readonly paths = new Graphics();
  private readonly labels = new Container();
  private readonly shadows = new Graphics();
  private readonly clouds = new Graphics();
  private readonly objects = new Container();
  private readonly drawn = new Map<string, Drawn>();
  private readonly props: Array<{ g: Graphics; gx: number; gy: number; phase: number; canopy?: Graphics }> = [];
  private time = 0;

  constructor(public readonly world: World, public theme: SetTheme) {
    this.container.addChild(this.ripples, this.terrain, this.paths, this.labels, this.shadows, this.clouds, this.objects);
    this.objects.sortableChildren = true;
    // emissive bloom: only the brightest things (lamps, windows, embers) glow; everything else is untouched
    this.objects.filters = [new AdvancedBloomFilter({ threshold: 0.9, bloomScale: 0.42, brightness: 1, blur: 5, quality: 4 })];
    this.shadows.alpha = 0.9;
    this.drawTerrain();
    this.drawPaths();
    this.drawLabels();
    for (const p of world.places) this.addPlace(p);
    this.placeProps();
  }

  // ---------- public API used by the player ----------
  positionOf(placeId: string): { ground: Pt; top: Pt; place: Place } | null {
    const d = this.drawn.get(placeId);
    if (!d) return null;
    const p = d.place;
    const c = p.gx + p.footprint / 2, r = p.gy + p.footprint / 2;
    const ground = iso(c, r);
    return { ground, top: up(ground, this.heightPx(d) + 10), place: p };
  }
  /** Where an actor stands to work on a place: the near corner, one cell out. */
  standingSpot(placeId: string): Pt {
    const d = this.drawn.get(placeId);
    if (!d) return iso(0, 0);
    const p = d.place;
    return iso(p.gx + p.footprint / 2, p.gy + p.footprint + 0.55);
  }
  setGlow(placeId: string, glow: number): void { const d = this.drawn.get(placeId); if (d && d.glow !== glow) { d.glow = glow; d.dirty = true; } }
  setGrowth(placeId: string, extraH: number): void { const d = this.drawn.get(placeId); if (d && d.extraH !== extraH) { d.extraH = extraH; d.dirty = true; } }
  setScaffold(placeId: string, alpha: number): void { const d = this.drawn.get(placeId); if (d && d.scaffold !== alpha) { d.scaffold = alpha; d.dirty = true; } }
  setLamp(placeId: string, lamp: LampState): void { const d = this.drawn.get(placeId); if (d && d.lamp !== lamp) { d.lamp = lamp; d.dirty = true; } }
  lampOf(placeId: string): LampState { return this.drawn.get(placeId)?.lamp ?? "idle"; }
  has(placeId: string): boolean { return this.drawn.has(placeId); }

  addPlace(p: Place): void {
    if (this.drawn.has(p.id)) return;
    const g = new Graphics();
    g.zIndex = depthOf(p.gx, p.gy, p.footprint);
    const districtIndex = Math.max(0, this.world.districts.findIndex((d) => d.id === p.district));
    const base = p.kind === "beacon" ? this.theme.beacon : p.kind === "archive" ? this.theme.archive : p.kind === "forge" ? this.theme.forge : this.theme.palettes[districtIndex % this.theme.palettes.length]!;
    // every building in a district shares a family but not a face: seeded tint and an occasional borrowed roof
    const k = p.kind === "building" ? hashString(p.path) : 0;
    const tint = p.kind === "building" ? ((k % 5) - 2) * 0.05 : 0;
    const roofFrom = p.kind === "building" && k % 3 === 0 ? this.theme.palettes[(districtIndex + 1 + (k % 2)) % this.theme.palettes.length]! : base;
    const shade = (c: number) => (tint >= 0 ? mix(c, 0xffffff, tint) : mix(c, 0x000000, -tint));
    const palette: Palette = { top: shade(base.top), left: shade(base.left), right: shade(base.right), roof: roofFrom.roof, roofD: roofFrom.roofD, win: base.win };
    const d: Drawn = { place: p, g, palette, extraH: 0, glow: 0, lamp: "idle", scaffold: 0, dirty: true };
    this.drawn.set(p.id, d);
    this.objects.addChild(g);
    this.redraw(d);
  }

  /** Per-frame: ripples, prop sway, and any dirty building (glow pulse keeps active ones dirty). */
  update(dtMs: number): void {
    this.time += dtMs / 1000;
    this.drawRipples();
    this.drawCloudShadows();
    for (const pr of this.props) if (pr.canopy) pr.canopy.x = Math.sin(this.time * 1.4 + pr.phase) * 1.2;
    for (const d of this.drawn.values()) {
      if (d.glow > 0 || d.lamp === "scan" || d.lamp === "fail" || d.lamp === "pass" || d.place.kind === "dock" || d.place.kind === "forge") d.dirty = true;
      if (d.dirty) this.redraw(d);
    }
  }

  // ---------- drawing ----------
  private heightPx(d: Drawn): number {
    const p = d.place;
    const base = p.kind === "beacon" ? 70 : p.kind === "forge" ? 34 : p.kind === "dock" ? 4 : p.kind === "archive" ? 30 : 18 + p.height * 8;
    return base + d.extraH;
  }

  private redraw(d: Drawn): void {
    const { g, place: p, palette: P } = d;
    g.clear();
    d.dirty = false;
    const h = this.heightPx(d);
    const fp = p.footprint;
    // contact shadow under the footprint + a long soft cast shadow from the key light (upper-left)
    const sh = corners(p.gx + 0.12, p.gy + 0.12, fp);
    g.poly(flat(sh)).fill({ color: this.shadowInk, alpha: 0.22 });
    if (p.kind !== "dock") this.castShadow(g, p, h);
    if (p.kind === "dock") return this.drawDock(g, p);
    if (p.kind === "beacon") return this.drawBeacon(d, h);
    const c = this.box(g, p.gx, p.gy, fp, h, p.kind === "forge" ? P.roof : P.top, P.left, P.right);
    const pulse = d.glow > 0 ? 0.6 + 0.4 * Math.sin(this.time * 10) : 0;
    const win = d.glow > 0 ? mix(P.win, 0xffe9a8, 0.5 + 0.5 * pulse) : P.win;
    if (p.kind !== "archive" && p.kind !== "forge") {
      const rows = Math.max(1, Math.round(h / 28)), cols = fp >= 3 ? 3 : 2;
      this.windows(g, c[3], c[2], h, rows, cols, win, d.glow > 0 ? 1 : 0.9);
      this.windows(g, c[2], c[1], h, rows, cols, win, d.glow > 0 ? 1 : 0.8);
      // a door on the near face grounds the building
      const door = lerpP(c[3], c[2], 0.3);
      g.poly([door.x - 3, door.y - 1, door.x + 3, door.y + 1, door.x + 3, door.y - 9, door.x - 3, door.y - 11]).fill({ color: P.roofD, alpha: 0.9 });
    }
    if (p.kind === "building" && fp <= 2) this.roof(g, p, h, P);
    if (p.kind === "building" && fp >= 3 && ARCHITECTURE[this.theme.id].roof !== "capsule" && ARCHITECTURE[this.theme.id].roof !== "dome") {
      // tower: parapet band, a stepped penthouse, mast + lantern
      const t = c.map((q) => up(q, h)) as [Pt, Pt, Pt, Pt];
      g.poly(flat([t[3], t[2], up(t[2], 4), up(t[3], 4)])).fill(P.roofD);
      g.poly(flat([t[2], t[1], up(t[1], 4), up(t[2], 4)])).fill(mix(P.roofD, 0x000000, 0.2));
      g.poly(flat(t.map((q) => up(q, 4)))).fill(P.roof);
      const pc = corners(p.gx + 0.8, p.gy + 0.8, fp - 1.6, h + 4);
      g.poly(flat([pc[3], pc[2], up(pc[2], 10), up(pc[3], 10)])).fill(P.left);
      g.poly(flat([pc[2], pc[1], up(pc[1], 10), up(pc[2], 10)])).fill(P.right);
      g.poly(flat(pc.map((q) => up(q, 10)))).fill(P.top);
      const ap = up(iso(p.gx + fp / 2, p.gy + fp / 2), h + 14);
      g.moveTo(ap.x, ap.y).lineTo(ap.x, ap.y - 12).stroke({ width: 1.6, color: P.roofD });
      g.circle(ap.x, ap.y - 13 - 14, 2.2).fill(d.glow > 0 ? 0xffd66b : P.roof);
    }
    if (p.kind === "archive") {
      // columns on the two visible faces
      for (let k = 1; k < 6; k++) { const q = lerpP(c[3], c[2], k / 6); g.moveTo(q.x, q.y - 3).lineTo(q.x, q.y - h + 5).stroke({ width: 1.3, color: 0xffffff, alpha: 0.6 }); }
      for (let k = 1; k < 5; k++) { const q = lerpP(c[2], c[1], k / 5); g.moveTo(q.x, q.y - 3).lineTo(q.x, q.y - h + 5).stroke({ width: 1.3, color: 0xffffff, alpha: 0.45 }); }
      this.pyramid(g, c.map((q) => up(q, h)) as [Pt, Pt, Pt, Pt], up(iso(p.gx + fp / 2, p.gy + fp / 2), h + 10), P.roof, P.roofD);
    }
    if (p.kind === "forge") {
      const ember = this.theme.forge.ember;
      // warm open doorway on the near face + glowing windows
      const door = lerpP(c[3], c[2], 0.5);
      g.poly([door.x - 7, door.y - 2, door.x + 7, door.y + 2, door.x + 7, door.y - 18, door.x - 7, door.y - 22]).fill({ color: ember, alpha: 0.85 });
      this.windows(g, c[2], c[1], h, 2, 2, ember, 0.9);
      // pitched roof + chimney with drifting smoke
      this.pyramid(g, c.map((q) => up(q, h)) as [Pt, Pt, Pt, Pt], up(iso(p.gx + fp / 2, p.gy + fp / 2), h + 16), P.roof, P.roofD);
      const top = up(iso(p.gx + fp * 0.75, p.gy + fp * 0.3), h + 6);
      g.rect(top.x - 4, top.y - 16, 8, 16).fill(P.roofD);
      for (let i = 0; i < 3; i++) { const u = (this.time * 0.35 + i / 3) % 1; g.circle(top.x + Math.sin(u * 6 + i) * 4, top.y - 18 - u * 26, 3 + u * 6).fill({ color: 0xffffff, alpha: 0.22 * (1 - u) }); }
      const k = 0.5 + 0.5 * Math.sin(this.time * 3);
      g.circle(door.x, door.y - 8, 12 + k * 4).fill({ color: ember, alpha: 0.12 + 0.08 * k });
    }
    if (d.glow > 0) this.outline(g, c, h, 0xffc85a, 0.4 + 0.4 * pulse);
    if (d.scaffold > 0) this.scaffold(g, p, h, d.scaffold);
  }

  /** Roofline by stage: this is what makes silhouettes differ, not just paint. */
  private roof(g: Graphics, p: Place, h: number, P: Palette): void {
    const A = ARCHITECTURE[this.theme.id], fp = p.footprint, e = A.eave;
    const k = hashString(p.path);
    const ec = corners(p.gx - e, p.gy - e, fp + e * 2, h); // eave corners (overhang)
    const centre = iso(p.gx + fp / 2, p.gy + fp / 2);
    const under = mix(P.roofD, this.shadowInk, 0.35);
    if (e > 0) {
      // the overhang's underside is in shadow — the single strongest "built, not extruded" cue
      g.poly(flat([ec[3], ec[2], up(ec[2], -3), up(ec[3], -3)])).fill({ color: under, alpha: 0.9 });
      g.poly(flat([ec[2], ec[1], up(ec[1], -3), up(ec[2], -3)])).fill({ color: mix(under, 0x000000, 0.2), alpha: 0.9 });
    }
    switch (A.roof) {
      case "pitched": {
        this.pyramid(g, ec, up(centre, h + 12 + fp * 9), P.roof, P.roofD);
        break;
      }
      case "gable": {
        // ridge along the long axis: two sloped faces, two triangular gables
        const ridgeH = 11 + fp * 7, r0 = up(lerpP(ec[0], ec[3], 0.5), h + ridgeH), r1 = up(lerpP(ec[1], ec[2], 0.5), h + ridgeH);
        g.poly(flat([ec[3], ec[2], r1, r0])).fill(vGrad(mix(P.roof, 0xffffff, 0.1), P.roof, r0.y, ec[3].y));
        g.poly(flat([ec[0], ec[1], r1, r0])).fill(mix(P.roofD, this.shadowInk, 0.2));
        g.poly(flat([ec[2], ec[1], r1])).fill(mix(P.right, this.shadowInk, 0.1));
        g.poly(flat([ec[3], ec[0], r0])).fill(P.left);
        g.moveTo(r0.x, r0.y).lineTo(r1.x, r1.y).stroke({ width: 1.4, color: 0xffffff, alpha: 0.4, cap: "round" });
        break;
      }
      case "flat": {
        const t = ec.map((q) => up(q, 3)) as [Pt, Pt, Pt, Pt];
        g.poly(flat([ec[3], ec[2], t[2], t[3]])).fill(P.roofD);
        g.poly(flat([ec[2], ec[1], t[1], t[2]])).fill(mix(P.roofD, 0x000000, 0.2));
        g.poly(flat(t)).fill(hGrad(mix(P.roof, 0xffffff, 0.08), P.roof, t[3].x, t[1].x));
        // rooftop units read as a city from above
        const u = corners(p.gx + 0.25 + (k % 3) * 0.1, p.gy + 0.3, 0.4, h + 3);
        g.poly(flat([u[3], u[2], up(u[2], 6), up(u[3], 6)])).fill(P.left); g.poly(flat([u[2], u[1], up(u[1], 6), up(u[2], 6)])).fill(P.right); g.poly(flat(u.map((q) => up(q, 6)))).fill(P.top);
        break;
      }
      case "dome": {
        const r = (fp * 32) * 0.78, cy = centre.y - h + 2;
        g.ellipse(centre.x, cy, r, r * 0.62).fill(vGrad(mix(P.roof, 0xffffff, 0.22), mix(P.roofD, this.shadowInk, 0.15), cy - r * 0.62, cy + r * 0.3));
        g.rect(centre.x - r, cy, r * 2, r * 0.62).fill({ color: 0, alpha: 0 });
        g.ellipse(centre.x - r * 0.3, cy - r * 0.28, r * 0.28, r * 0.14).fill({ color: 0xffffff, alpha: 0.32 });
        break;
      }
      case "onion": {
        const r = fp * 16, cy = centre.y - h;
        g.moveTo(centre.x - r, cy).quadraticCurveTo(centre.x - r * 1.15, cy - r * 1.1, centre.x, cy - r * 2.2).quadraticCurveTo(centre.x + r * 1.15, cy - r * 1.1, centre.x + r, cy).fill(vGrad(mix(P.roof, 0xffffff, 0.2), P.roofD, cy - r * 2.2, cy));
        g.moveTo(centre.x - r * 0.4, cy - r * 0.3).quadraticCurveTo(centre.x - r * 0.5, cy - r * 1.2, centre.x - r * 0.05, cy - r * 1.9).stroke({ width: 1.6, color: 0xffffff, alpha: 0.35, cap: "round" });
        break;
      }
      case "tiered": {
        // two stacked roofs with upturned eaves
        for (let tier = 0; tier < 2; tier++) {
          const eh = h + tier * 14, ee = e * (1 - tier * 0.45);
          const tc = corners(p.gx - ee, p.gy - ee, fp + ee * 2, eh);
          g.poly(flat([tc[3], tc[2], up(tc[2], -2), up(tc[3], -2)])).fill(under);
          const apex = up(centre, eh + 9 + fp * 3);
          g.poly(flat([up(tc[3], 3), up(tc[2], 3), apex])).fill(P.roof);
          g.poly(flat([up(tc[2], 3), up(tc[1], 3), apex])).fill(P.roofD);
          g.poly(flat([up(tc[3], 3), up(tc[0], 3), apex])).fill(mix(P.roof, 0xffffff, 0.1));
          // upturned corners
          for (const q of [tc[1], tc[2], tc[3]]) g.moveTo(q.x, q.y + 1).quadraticCurveTo(q.x + (q.x < centre.x ? -4 : 4), q.y - 1, q.x + (q.x < centre.x ? -5 : 5), q.y - 6).stroke({ width: 2, color: P.roofD, cap: "round" });
        }
        break;
      }
      case "tent": {
        const apex = up(centre, h + 16 + fp * 8);
        this.pyramid(g, ec, apex, P.roof, P.roofD);
        // scalloped hem
        for (let i = 0; i < fp * 3; i++) { const a = lerpP(ec[3], ec[2], i / (fp * 3)), b = lerpP(ec[3], ec[2], (i + 1) / (fp * 3)); g.moveTo(a.x, a.y).quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 + 4, b.x, b.y).fill(P.roofD); }
        g.moveTo(apex.x, apex.y).lineTo(apex.x, apex.y - 8).stroke({ width: 1.5, color: P.roofD }); g.poly([apex.x, apex.y - 8, apex.x + 7, apex.y - 6, apex.x, apex.y - 4]).fill(P.win);
        break;
      }
      case "capsule": {
        const r = fp * 32 * 0.7, cy = centre.y - h + 1;
        g.ellipse(centre.x, cy, r * 1.02, r * 0.5).fill(vGrad(mix(P.top, 0xffffff, 0.25), P.top, cy - r * 0.5, cy + r * 0.1));
        g.ellipse(centre.x - r * 0.3, cy - r * 0.22, r * 0.3, r * 0.1).fill({ color: 0xffffff, alpha: 0.4 });
        g.ellipse(centre.x, cy, r * 1.02, r * 0.5).stroke({ width: 1.2, color: mix(P.roofD, 0xffffff, 0.1), alpha: 0.6 });
        break;
      }
    }
    // furniture
    const fx = up(iso(p.gx + fp * 0.72, p.gy + fp * 0.3), h + (A.roof === "flat" ? 3 : A.roof === "pitched" || A.roof === "gable" ? 8 : 0));
    switch (A.furniture) {
      case "chimney": if (k % 2 === 0) { g.rect(fx.x - 3, fx.y - 12, 6, 12).fill(P.roofD); g.rect(fx.x - 4, fx.y - 13, 8, 3).fill(mix(P.roofD, 0x000000, 0.2)); } break;
      case "vent": g.rect(fx.x - 4, fx.y - 5, 8, 5).fill(mix(P.left, this.shadowInk, 0.2)); g.ellipse(fx.x, fx.y - 5, 4, 1.6).fill(P.top); break;
      case "mast": g.moveTo(fx.x, fx.y).lineTo(fx.x, fx.y - 16).stroke({ width: 1.4, color: P.roofD }); g.circle(fx.x, fx.y - 17, 2).fill(P.win); break;
      case "finial": { const ap = up(centre, h + 12 + fp * 9 + (A.roof === "onion" ? fp * 16 * 2.2 - 12 - fp * 9 : 0)); g.moveTo(ap.x, ap.y).lineTo(ap.x, ap.y - 7).stroke({ width: 1.4, color: 0xffd66b }); g.circle(ap.x, ap.y - 8, 2).fill(0xffd66b); break; }
      case "lantern": { const q = lerpP(ec[3], ec[2], 0.5); g.moveTo(q.x, q.y).lineTo(q.x, q.y + 5).stroke({ width: 1, color: P.roofD }); g.roundRect(q.x - 3, q.y + 5, 6, 8, 2).fill(d_glow(P.win)); break; }
      case "dish": g.ellipse(fx.x, fx.y - 2, 6, 3).stroke({ width: 1.4, color: 0xffffff, alpha: 0.7 }); g.moveTo(fx.x, fx.y - 2).lineTo(fx.x + 2, fx.y - 7).stroke({ width: 1, color: 0xffffff, alpha: 0.7 }); break;
    }
    if (A.stripes) {
      const c = corners(p.gx, p.gy, fp);
      for (let i = 0; i < fp * 4; i += 2) { const a = lerpP(c[3], c[2], i / (fp * 4)), b = lerpP(c[3], c[2], (i + 1) / (fp * 4)); g.poly([a.x, a.y, b.x, b.y, b.x, b.y - h * 0.35, a.x, a.y - h * 0.35]).fill({ color: 0xffffff, alpha: 0.22 }); }
    }
  }

  private box(g: Graphics, gx: number, gy: number, fp: number, h: number, top: number, left: number, right: number): [Pt, Pt, Pt, Pt] {
    const [p0, p1, p2, p3] = corners(gx, gy, fp);
    const haze = this.hazeOf(gy + gx);
    const L = (c: number) => mix(c, this.theme.sky[0], haze);
    // left face: lit near the eave, ambient occlusion toward the ground
    g.poly(flat([p3, p2, up(p2, h), up(p3, h)])).fill(vGrad(L(mix(left, 0xffffff, 0.08)), L(mix(left, this.shadowInk, 0.28)), p3.y - h, p3.y));
    // right face: in the shade, cooler, same AO
    g.poly(flat([p2, p1, up(p1, h), up(p2, h)])).fill(vGrad(L(mix(right, this.coolInk, 0.06)), L(mix(right, this.shadowInk, 0.38)), p2.y - h, p2.y));
    // top: brightest toward the light
    g.poly(flat([up(p0, h), up(p1, h), up(p2, h), up(p3, h)])).fill(hGrad(L(mix(top, 0xffffff, 0.16)), L(top), p3.x, p1.x));
    // rim light along the lit eave and the sunward vertical edge
    g.moveTo(p3.x, p3.y - h).lineTo(p0.x, p0.y - h).lineTo(p1.x, p1.y - h).stroke({ width: 1.3, color: 0xffffff, alpha: 0.42, cap: "round" });
    g.moveTo(p3.x, p3.y - h).lineTo(p3.x, p3.y).stroke({ width: 1.1, color: 0xffffff, alpha: 0.22 });
    return [p0, p1, p2, p3];
  }
  /** Far rows fade a little toward the sky: cheap aerial perspective. */
  private hazeOf(depth: number): number {
    const b = this.world.bounds, far = b.x + b.y, near = b.x + b.w + b.y + b.h;
    return 0.16 * (1 - Math.max(0, Math.min(1, (depth - far) / Math.max(1, near - far))));
  }
  private get shadowInk(): number { return mix(this.theme.vignette, 0x000000, 0.3); }
  private get coolInk(): number { return mix(this.theme.sky[0], 0x2a3f6a, 0.5); }
  /** Long soft shadow cast toward the lower-right, two layers so the edge is soft. */
  private castShadow(g: Graphics, p: Place, h: number): void {
    const fp = p.footprint, len = h / 36;
    const c = corners(p.gx, p.gy, fp);
    const sx = 0.55 * len, sy = 0.95 * len; // light from upper-left in grid space
    const far = [iso(p.gx + sx, p.gy + sy), iso(p.gx + fp + sx, p.gy + sy), iso(p.gx + fp + sx, p.gy + fp + sy), iso(p.gx + sx, p.gy + fp + sy)];
    const poly = [c[1], far[1]!, far[2]!, far[3]!, c[3], c[2]];
    g.poly(flat(poly)).fill({ color: this.shadowInk, alpha: 0.16 });
    const far2 = [iso(p.gx + sx * 0.6, p.gy + sy * 0.6), iso(p.gx + fp + sx * 0.6, p.gy + sy * 0.6), iso(p.gx + fp + sx * 0.6, p.gy + fp + sy * 0.6)];
    g.poly(flat([c[1], far2[1]!, far2[2]!, c[3], c[2]])).fill({ color: this.shadowInk, alpha: 0.12 });
  }
  /** Slow cloud shadows crossing the ground; the single cheapest thing that makes a stage feel outdoors. */
  private drawCloudShadows(): void {
    const g = this.clouds;
    g.clear();
    if (this.theme.terrain !== "island" && this.theme.terrain !== "block") return;
    const b = this.world.bounds, cx = iso(b.x + b.w / 2, b.y + b.h / 2);
    const span = (b.w + b.h) * 24;
    for (let i = 0; i < 3; i++) {
      const u = ((this.time * 0.012 + i * 0.37) % 1);
      const x = cx.x - span / 2 + u * span * 1.3 - span * 0.15, y = cx.y - 90 + Math.sin(i * 2.1) * 120;
      g.ellipse(x, y, 150 + i * 30, 56 + i * 8).fill({ color: this.shadowInk, alpha: 0.075 });
      g.ellipse(x + 90, y + 18, 110, 40).fill({ color: this.shadowInk, alpha: 0.06 });
    }
  }
  private pyramid(g: Graphics, tops: [Pt, Pt, Pt, Pt], apex: Pt, light: number, dark: number): void {
    g.poly(flat([tops[0], tops[1], apex])).fill(mix(dark, this.shadowInk, 0.25));
    g.poly(flat([tops[3], tops[0], apex])).fill(mix(light, 0xffffff, 0.12));
    g.poly(flat([tops[3], tops[2], apex])).fill(vGrad(mix(light, 0xffffff, 0.06), light, apex.y, tops[2].y));
    g.poly(flat([tops[2], tops[1], apex])).fill(vGrad(dark, mix(dark, this.shadowInk, 0.3), apex.y, tops[1].y));
    g.moveTo(tops[3].x, tops[3].y).lineTo(apex.x, apex.y).stroke({ width: 1.2, color: 0xffffff, alpha: 0.35, cap: "round" });
  }
  private windows(g: Graphics, a: Pt, b: Pt, h: number, rows: number, cols: number, col: number, alpha: number): void {
    const dx = ((b.x - a.x) / cols) * 0.3, dy = ((b.y - a.y) / cols) * 0.3;
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
      const base = lerpP(a, b, (k + 0.5) / cols);
      const y = base.y - (h * (r + 0.75)) / (rows + 0.5), x = base.x;
      g.poly([x - dx, y - dy, x + dx, y + dy, x + dx, y + dy - 6, x - dx, y - dy - 6]).fill({ color: col, alpha });
      g.poly([x - dx, y - dy - 4.5, x + dx, y + dy - 4.5, x + dx, y + dy - 6, x - dx, y - dy - 6]).fill({ color: 0xffffff, alpha: alpha * 0.45 });
    }
  }
  private outline(g: Graphics, c: [Pt, Pt, Pt, Pt], h: number, color: number, alpha: number): void {
    const t = c.map((p) => up(p, h));
    g.moveTo(c[3].x, c[3].y).lineTo(c[2].x, c[2].y).lineTo(c[1].x, c[1].y).lineTo(t[1]!.x, t[1]!.y).lineTo(t[0]!.x, t[0]!.y).lineTo(t[3]!.x, t[3]!.y).closePath().stroke({ width: 2, color, alpha, join: "round" });
    g.moveTo(c[2].x, c[2].y).lineTo(t[2]!.x, t[2]!.y).stroke({ width: 2, color, alpha });
  }
  private scaffold(g: Graphics, p: Place, h: number, alpha: number): void {
    const c = corners(p.gx - 0.12, p.gy - 0.12, p.footprint + 0.24);
    for (const q of [c[1], c[2], c[3]]) g.moveTo(q.x, q.y).lineTo(q.x, q.y - h - 8).stroke({ width: 1.1, color: 0xffdc96, alpha });
    for (let y = 10; y < h + 8; y += 11) g.moveTo(c[3].x, c[3].y - y).lineTo(c[2].x, c[2].y - y).lineTo(c[1].x, c[1].y - y).stroke({ width: 1.1, color: 0xffdc96, alpha });
  }
  private drawBeacon(d: Drawn, h: number): void {
    const { g, place: p } = d;
    const P = this.theme.beacon, lc = P.lamp[d.lamp];
    const c = this.box(g, p.gx + 0.2, p.gy + 0.2, 0.6, h, P.top, P.left, P.right);
    for (const [a1, a2] of [[0.2, 0.33], [0.52, 0.65]] as const) {
      g.poly(flat([up(c[3], h * a1), up(c[2], h * a1), up(c[2], h * a2), up(c[3], h * a2)])).fill(P.roof);
      g.poly(flat([up(c[2], h * a1), up(c[1], h * a1), up(c[1], h * a2), up(c[2], h * a2)])).fill(P.roofD);
    }
    const center = up(iso(p.gx + 0.5, p.gy + 0.5), h + 6);
    const pulse = d.lamp === "fail" ? 0.55 + 0.45 * Math.sin(this.time * 9) : d.lamp === "scan" ? 0.8 + 0.2 * Math.sin(this.time * 20) : 1;
    const R0 = d.lamp === "idle" ? 16 : 26;
    g.circle(center.x, center.y, R0).fill({ color: lc, alpha: 0.22 * pulse });
    g.circle(center.x, center.y, R0 * 0.55).fill({ color: lc, alpha: 0.3 * pulse });
    if (d.lamp === "scan" || d.lamp === "pass") {
      const ang = d.lamp === "scan" ? this.time * 5 : this.time * 1.1, L = d.lamp === "scan" ? 190 : 120, sp = 0.2;
      g.moveTo(center.x, center.y).arc(center.x, center.y, L, ang - sp, ang + sp).closePath().fill({ color: lc, alpha: 0.18 });
    }
    const lr = this.box(g, p.gx + 0.28, p.gy + 0.28, 0.44, 11, 0x2c3e52, lc, mix(lc, 0x000000, 0.25));
    // lamp room top shifted up by h
    void lr;
    this.pyramid(g, corners(p.gx + 0.2, p.gy + 0.2, 0.6, h + 11), up(iso(p.gx + 0.5, p.gy + 0.5), h + 22), P.roof, P.roofD);
  }
  private drawDock(g: Graphics, p: Place): void {
    const c = corners(p.gx, p.gy, p.footprint);
    // planked deck on posts
    g.poly(flat([c[3], c[2], up(c[2], -5), up(c[3], -5)])).fill(this.theme.dock.post);
    g.poly(flat([c[2], c[1], up(c[1], -5), up(c[2], -5)])).fill(mix(this.theme.dock.post, 0x000000, 0.2));
    g.poly(flat(c)).fill(this.theme.dock.deck);
    for (let k = 1; k < 5; k++) { const a = lerpP(c[0], c[3], k / 5), b = lerpP(c[1], c[2], k / 5); g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 1, color: 0x000000, alpha: 0.12 }); }
    for (const q of [c[0], c[1], c[2], c[3]]) g.rect(q.x - 2, q.y - 12, 4, 12).fill(this.theme.dock.post);
    // the vessel, bobbing
    const m = lerpP(c[1], c[2], 0.5), bob = Math.sin(this.time * 1.6) * 1.5;
    g.ellipse(m.x + 22, m.y + 6 + bob, 16, 6).fill(this.theme.dock.vessel);
    g.ellipse(m.x + 22, m.y + 3 + bob, 13, 4).fill(mix(this.theme.dock.vessel, 0x000000, 0.12));
    g.rect(m.x + 20, m.y - 12 + bob, 3, 15).fill(this.theme.dock.post);
    g.poly([m.x + 23, m.y - 12 + bob, m.x + 34, m.y - 6 + bob, m.x + 23, m.y - 2 + bob]).fill({ color: 0xffffff, alpha: 0.9 });
  }

  private blobPath(g: Graphics, k: number, dy: number): Graphics {
    const b = this.world.bounds;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2, Rx = b.w / 2 + 1.2, Ry = b.h / 2 + 1.2;
    const pts: number[] = [];
    const wob = mulberry32(this.world.seed ^ 0x5bd1e995)() * 6.28;
    for (let i = 0; i < 80; i++) {
      const a = (i / 80) * Math.PI * 2;
      const r = 1 + 0.07 * Math.sin(3 * a + wob) + 0.04 * Math.sin(5 * a + 2.1 + wob) + 0.025 * Math.sin(8 * a + 1.3);
      const p = iso(cx + Math.cos(a) * Rx * r * k, cy + Math.sin(a) * Ry * r * k);
      pts.push(p.x, p.y + dy);
    }
    return g.poly(pts);
  }
  private drawTerrain(): void {
    const g = this.terrain, T = this.theme.ground;
    if (this.theme.terrain === "island") {
      this.blobPath(g, 1, 18).fill(T.edgeDark);
      this.blobPath(g, 1, 10).fill(T.edge);
      this.blobPath(g, 1, 0).fill(T.sand);
      this.blobPath(g, 0.88, -1).fill(T.fill);
      this.blobPath(g, 0.6, -2).fill({ color: T.fillLight, alpha: 0.55 });
      // a sun pool upper-left and a cool falloff lower-right, so the ground itself is lit
      const b = this.world.bounds, c = iso(b.x + b.w / 2, b.y + b.h / 2), R = (b.w + b.h) * 14;
      g.circle(c.x - R * 0.45, c.y - R * 0.35, R * 0.9).fill({ color: 0xffffff, alpha: 0.07 });
      g.circle(c.x + R * 0.5, c.y + R * 0.4, R * 1.1).fill({ color: this.shadowInk, alpha: 0.08 });
    } else if (this.theme.terrain === "platform") {
      const b = this.world.bounds, c = corners(b.x, b.y, Math.max(b.w, b.h));
      g.poly(flat([c[3], c[2], up(c[2], -14), up(c[3], -14)])).fill(T.edgeDark);
      g.poly(flat([c[2], c[1], up(c[1], -14), up(c[2], -14)])).fill(T.edge);
      g.poly(flat(c)).fill(T.fill);
      g.poly(flat(corners(b.x + 1, b.y + 1, Math.max(b.w, b.h) - 2))).fill({ color: T.fillLight, alpha: 0.25 });
      g.poly(flat(c)).stroke({ width: 2, color: T.sand, alpha: 0.6 });
    } else {
      const b = this.world.bounds, side = Math.max(b.w, b.h), c = corners(b.x, b.y, side);
      g.poly(flat([c[3], c[2], up(c[2], -10), up(c[3], -10)])).fill(T.edgeDark);
      g.poly(flat([c[2], c[1], up(c[1], -10), up(c[2], -10)])).fill(T.edge);
      g.poly(flat(c)).fill(T.fill);
      for (let i = 1; i < side; i += 2) { const a = iso(b.x + i, b.y), bb = iso(b.x + i, b.y + side); g.moveTo(a.x, a.y).lineTo(bb.x, bb.y).stroke({ width: 1, color: T.sand, alpha: 0.12 }); }
      for (let i = 1; i < side; i += 2) { const a = iso(b.x, b.y + i), bb = iso(b.x + side, b.y + i); g.moveTo(a.x, a.y).lineTo(bb.x, bb.y).stroke({ width: 1, color: T.sand, alpha: 0.12 }); }
    }
  }
  private drawRipples(): void {
    const g = this.ripples;
    g.clear();
    if (this.theme.terrain !== "island") {
      // stars / drifting lights instead of water
      const rnd = mulberry32(this.world.seed);
      for (let i = 0; i < 70; i++) {
        const x = (rnd() - 0.5) * 2600, y = (rnd() - 0.5) * 1600, tw = 0.5 + 0.5 * Math.sin(this.time * (0.6 + rnd()) + i);
        g.circle(x, y, 0.8 + rnd() * 1.2).fill({ color: this.theme.water.ripple, alpha: this.theme.water.rippleAlpha * tw });
      }
      return;
    }
    for (let k = 0; k < 3; k++) {
      const u = (this.time * 0.06 + k / 3) % 1;
      this.blobPath(g, 1.04 + u * 0.45, 8).stroke({ width: 1.4, color: this.theme.water.ripple, alpha: this.theme.water.rippleAlpha * 0.7 * (1 - u) });
    }
  }
  private drawPaths(): void {
    const g = this.paths;
    for (const path of this.world.paths) {
      const pts = path.points.map(([a, b]) => iso(a + 0.5, b + 0.5));
      g.moveTo(pts[0]!.x, pts[0]!.y);
      for (const q of pts.slice(1)) g.lineTo(q.x, q.y);
      g.stroke({ width: 7, color: this.theme.pathColor, alpha: 0.9, cap: "round", join: "round" });
    }
  }
  private drawLabels(): void {
    const style = new TextStyle({ fontFamily: "Fredoka, Trebuchet MS, sans-serif", fontSize: 22, fontWeight: "700", fill: 0xffffff, letterSpacing: 2, stroke: { color: this.theme.vignette, width: 4, join: "round" } });
    for (const d of this.world.districts) {
      const t = new Text({ text: d.label, style });
      t.anchor.set(0.5, 0.5);
      // painted on the grass just in front of the patch, where buildings never cover it
      const p = iso(d.bounds.x + d.bounds.w / 2 + 0.5, d.bounds.y + d.bounds.h + 0.55);
      t.position.set(p.x, p.y);
      t.alpha = 0.55;
      t.skew.set(-0.35, 0.17);
      this.labels.addChild(t);
    }
  }
  private placeProps(): void {
    const rnd = mulberry32(this.world.seed ^ 0x9e3779b9);
    const occupied = new Set<string>();
    for (const p of this.world.places) for (let dx = 0; dx < p.footprint; dx++) for (let dy = 0; dy < p.footprint; dy++) occupied.add(`${p.gx + dx},${p.gy + dy}`);
    const b = this.world.bounds;
    let tries = 0, placed = 0;
    const want = Math.min(18, 5 + Math.floor(this.world.places.length / 5));
    while (placed < want && tries++ < 700) {
      const gx = Math.floor(b.x + 1 + rnd() * (b.w - 2)), gy = Math.floor(b.y + 1 + rnd() * (b.h - 2));
      if (occupied.has(`${gx},${gy}`)) continue;
      // keep props off district interiors so buildings read clearly
      if (this.world.districts.some((d) => gx >= d.bounds.x && gx < d.bounds.x + d.bounds.w && gy >= d.bounds.y && gy < d.bounds.y + d.bounds.h)) continue;
      occupied.add(`${gx},${gy}`);
      const node = new Container();
      node.zIndex = depthOf(gx, gy);
      const g = new Graphics();
      node.addChild(g);
      const p = iso(gx + 0.5, gy + 0.5), s = (0.85 + rnd() * 0.4) * 1.25;
      const [c1, c2, c3] = this.theme.propColors;
      let canopy: Graphics | undefined;
      if (this.theme.prop === "tree") {
        g.ellipse(p.x + 3, p.y + 1, 9 * s, 4 * s).fill({ color: 0x0a2a1a, alpha: 0.18 });
        g.rect(p.x - 1.5, p.y - 10 * s, 3, 10 * s).fill(c3);
        canopy = new Graphics();
        canopy.ellipse(p.x + 1 * s, p.y - 13 * s, 9.5 * s, 7.5 * s).fill(mix(c1, this.shadowInk, 0.25));
        canopy.ellipse(p.x, p.y - 16 * s, 9 * s, 8.5 * s).fill(c1);
        canopy.ellipse(p.x - 4 * s, p.y - 19 * s, 6.5 * s, 6 * s).fill(c2);
        canopy.ellipse(p.x + 4.5 * s, p.y - 20 * s, 5.5 * s, 5 * s).fill(c2);
        canopy.ellipse(p.x - 3.5 * s, p.y - 22 * s, 3.2 * s, 2.4 * s).fill({ color: 0xffffff, alpha: 0.32 });
        node.addChild(canopy);
      } else if (this.theme.prop === "antenna") {
        g.rect(p.x - 1, p.y - 18 * s, 2, 18 * s).fill(c1);
        g.circle(p.x, p.y - 20 * s, 2.5).fill(c2);
        g.ellipse(p.x, p.y, 5 * s, 2.5 * s).fill(c3);
      } else {
        g.rect(p.x - 1, p.y - 16 * s, 2, 16 * s).fill(c3);
        g.circle(p.x, p.y - 17 * s, 3).fill(c1);
        g.circle(p.x, p.y - 17 * s, 7).fill({ color: c2, alpha: 0.18 });
      }
      this.objects.addChild(node);
      this.props.push({ g, gx, gy, phase: rnd() * 6.28, ...(canopy ? { canopy } : {}) });
      placed++;
    }
  }
}

const d_glow = (c: number) => mix(c, 0xffffff, 0.25);

/** Vertical two-stop gradient in world px (Pixi 8 FillGradient, global coordinates). */
function vGrad(top: number, bottom: number, y0: number, y1: number): FillGradient {
  return new FillGradient({ start: { x: 0, y: y0 }, end: { x: 0, y: y1 }, colorStops: [{ offset: 0, color: top }, { offset: 1, color: bottom }], textureSpace: "global" });
}
function hGrad(left: number, right: number, x0: number, x1: number): FillGradient {
  return new FillGradient({ start: { x: x0, y: 0 }, end: { x: x1, y: 0 }, colorStops: [{ offset: 0, color: left }, { offset: 1, color: right }], textureSpace: "global" });
}

export function mix(a: number, b: number, u: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * u), g = Math.round(ag + (bg - ag) * u), bl = Math.round(ab + (bb - ab) * u);
  return (r << 16) | (g << 8) | bl;
}
