import { Application, Container } from "pixi.js";
import type { Beat, Mood, World } from "@agent-theatre/core";
import { Camera } from "../render/camera.js";
import { backOut, bump, walkEase } from "../render/ease.js";
import { iso, lerp, seg, TH, type Pt } from "../render/iso.js";
import { WorldLayer, type LampState } from "../render/world-layer.js";
import type { SetTheme } from "../sets/types.js";
import { Gremlin } from "./gremlin.js";
import { Particles } from "./particles.js";
import { Pip, type CharacterPose } from "./pip.js";
import { pickCompany, type CharacterSpec } from "./cast.js";
import type { AudioEngine } from "../audio/engine.js";
import { Sfx } from "../audio/sfx.js";
import { Ambience } from "../audio/ambience.js";

export interface PlayerState {
  t: number; duration: number; playing: boolean; rate: number;
  current: Beat | null; mood: Mood;
  bubble: { text: string; color: number; screen: Pt } | null;
  labels: Array<{ text: string; screen: Pt; active: boolean }>;
  evidence: { passed: number } | null;
  signal: "ok" | "lost";
}

/**
 * Plays a Beat timeline on a World. Deterministic: seeking rebuilds state
 * from the beats, so any frame can be rendered cold (screenshots, tests).
 */
export class ScenePlayer {
  readonly stage = new Container();
  readonly worldLayer: WorldLayer;
  private readonly camera: Camera;
  private readonly pip: Pip;
  private readonly helpers = new Map<string, Pip>();
  private readonly gremlins = new Map<string, Gremlin>();
  private readonly particles: Particles;
  private readonly sfx: Sfx;
  private readonly amb: Ambience;

  private beats: Beat[] = [];
  private t = 0;
  private prevT = -1;
  private _playing = false;
  private rate = 1;
  private duration = 0;
  private mood: Mood = "curious";
  private actorAt = new Map<string, string>(); // actor -> placeId they stand at
  private walkFrom = new Map<string, Pt>();
  private growth = new Map<string, number>();
  private lastPass = 0;
  private signal: "ok" | "lost" = "ok";
  private footT = 0; private hammerT = 0;
  private claimGremlinId: string | null = null;
  evidenceCount: number | null = null;

  readonly company: { lead: CharacterSpec; helpers: CharacterSpec[] };
  private helperIndex = 0;
  constructor(private readonly app: Application, public world: World, public theme: SetTheme, private readonly audio: AudioEngine, private readonly reducedMotion: boolean, leadId?: string | null) {
    this.worldLayer = new WorldLayer(world, theme);
    this.particles = new Particles(reducedMotion);
    this.company = pickCompany(world.seed, leadId, theme.ground.fill);
    this.pip = new Pip(theme, reducedMotion, this.company.lead);
    this.camera = new Camera(this.stage, reducedMotion);
    this.sfx = new Sfx(audio); this.amb = new Ambience(audio);
    this.stage.sortableChildren = true;
    this.stage.addChild(this.worldLayer.container);
    this.worldLayer.container.sortableChildren = true;
    this.worldLayer.container.addChild(this.pip.container, this.particles.g);
    this.particles.g.zIndex = 1e7;
    app.stage.addChild(this.stage);
    this.actorAt.set("pip", "forge");
    this.fitCamera();
    this.camera.snap();
  }

  // ---------- control ----------
  load(beats: Beat[]): void { this.beats = beats; this.duration = beats.length ? Math.max(...beats.map((b) => b.atMs + b.durationMs)) : 0; this.seek(0); }
  get beatCount(): number { return this.beats.length; }
  /** What is under a stage-local screen point: a place, the lead, or a helper. Smallest hit wins. */
  hitTest(sx: number, sy: number): { kind: "place"; place: import("@agent-theatre/core").Place } | { kind: "lead"; name: string; mood: string } | { kind: "helper"; name: string } | null {
    const z = this.camera.scale;
    const near = (p: { x: number; y: number }, r: number) => { const s = this.camera.toScreen(p.x, p.y); return Math.hypot(s.x - sx, s.y - sy) < r * z; };
    const lp = this.pip.drawn; if (near({ x: lp.x, y: lp.y - 18 }, 26)) return { kind: "lead", name: this.company.lead.name, mood: this.pip.pose.mood };
    for (const [id, h] of this.helpers) { const d = h.drawn; if (near({ x: d.x, y: d.y - 14 }, 22)) return { kind: "helper", name: this.company.helpers.find((c) => c.id === id)?.name ?? "Helper" }; }
    let best: { place: import("@agent-theatre/core").Place; area: number } | null = null;
    for (const p of this.world.places) {
      const pos = this.worldLayer.positionOf(p.id); if (!pos) continue;
      const g = this.camera.toScreen(pos.ground.x, pos.ground.y), t = this.camera.toScreen(pos.top.x, pos.top.y);
      const hw = (p.footprint * 32 + 8) * z, bottom = g.y + p.footprint * 16 * z, top = t.y - 6 * z;
      if (sx >= g.x - hw && sx <= g.x + hw && sy >= top && sy <= bottom) { const area = hw * (bottom - top); if (!best || area < best.area) best = { place: p, area }; }
    }
    return best ? { kind: "place", place: best.place } : null;
  }
  append(beats: Beat[]): void { this.beats.push(...beats); this.duration = Math.max(this.duration, ...beats.map((b) => b.atMs + b.durationMs)); }
  get playing(): boolean { return this._playing; }
  play(): void { this._playing = true; this.amb.start(this.theme); }
  /** The browser only lets audio start after a gesture; once it does, (re)start this stage's ambience. */
  audioReady(): void { this.amb.stop(); if (this._playing) this.amb.start(this.theme); }
  pause(): void { this._playing = false; }
  setRate(r: number): void { this.rate = r; }
  setSignal(s: "ok" | "lost"): void { this.signal = s; }
  /** 0 = active, 1 = thinking (20 s+), 2 = quiet (90 s+): dims the stage and sits the lead down. Eased, never a cut. */
  quietLevel = 0;
  private dim = 0;
  setQuiet(level: number): void { this.quietLevel = level; }
  seek(ms: number): void {
    this.t = Math.max(0, Math.min(this.duration, ms));
    this.rebuild(this.t);
    this.prevT = this.t;
    this.particles.clear();
  }
  get leadName(): string { return this.company.lead.name; }
  /**
   * Thinking looks like thinking: a slow weight shift, a glance to one side every few seconds, now and
   * then a look up, a tiny settle-hop when the glance turns. Driven by the wall clock, never by the beat
   * clock, so the character keeps breathing between events and at the live edge.
   */
  private idleBusiness(a: { face: number; look: "fwd" | "up" | "down"; sx: number; sy: number; lean: number; lift: number; moving: boolean }): void {
    if (this.reducedMotion) return;
    const w = this.wall / 1000;
    a.moving = false;
    if (this.quietLevel >= 2) { a.sy = 0.84 + 0.012 * Math.sin(w * 0.9); a.sx = 1.1; a.look = "down"; a.lean = 0.03 * Math.sin(w * 0.3); return; } // sat down, dozing
    a.sy = 1 + 0.025 * Math.sin(w * 1.1); a.sx = 1 / a.sy;                 // breathing / weight shift
    a.lean = 0.04 * Math.sin(w * 0.37);                                      // slow sway
    const phase = (w % 7.3);                                                 // a glance cycle every ~7 s
    a.face = phase > 3.1 && phase < 5.4 ? -1 : 1;
    a.look = phase > 5.9 && phase < 6.8 ? "up" : "fwd";
    const hop = Math.abs(phase - 3.1) < 0.18 || Math.abs(phase - 5.4) < 0.18 ? Math.sin(((phase % 0.36) / 0.36) * Math.PI) : 0;
    a.lift = Math.max(a.lift, hop * 4);
  }
  get state(): PlayerState {
    const cur = this.currentBeat();
    return { t: this.t, duration: this.duration, playing: this._playing, rate: this.rate, current: cur, mood: this.mood, bubble: this.bubble(cur), labels: this.labels(cur), evidence: this.evidenceCount !== null ? { passed: this.evidenceCount } : null, signal: this.signal };
  }

  // ---------- frame ----------
  /** Wall clock for idle business: runs whether or not the scene clock does, so a thinking agent never freezes. */
  private wall = 0;
  update(dtMs: number): void {
    this.wall += dtMs;
    // quiet: the house lights come down over ~2 s, and back up the instant something happens
    const wantDim = this.quietLevel >= 2 ? 0.55 : this.quietLevel === 1 ? 0.18 : 0;
    this.dim += (wantDim - this.dim) * (1 - Math.pow(wantDim > this.dim ? 0.2 : 0.02, dtMs / 1000));
    this.stage.alpha = 1 - this.dim;
    if (this._playing) {
      this.t = Math.min(this.duration, this.t + dtMs * this.rate);
      if (this.t >= this.duration && this.duration > 0) this._playing = false;
      this.triggerBetween(this.prevT, this.t);
      this.prevT = this.t;
    }
    const cur = this.currentBeat();
    this.pose(cur, dtMs);
    this.worldState(cur);
    this.worldLayer.update(dtMs);
    this.pip.update(dtMs);
    for (const h of this.helpers.values()) h.update(dtMs);
    for (const g of this.gremlins.values()) g.update(dtMs);
    this.particles.update(dtMs);
    this.cameraStep(cur, dtMs);
    this.amb.setMood(this.mood);
  }

  // ---------- state derivation ----------
  private currentBeat(): Beat | null {
    // latest beat that has started; idle beats yield to anything overlapping them
    let best: Beat | null = null;
    for (const b of this.beats) { if (b.atMs <= this.t) { if (!best || b.atMs >= best.atMs) if (!(b.kind === "idle" && best && best.kind !== "idle" && best.atMs + best.durationMs > this.t)) best = b; } else break; }
    return best;
  }
  private completed(): Beat[] { return this.beats.filter((b) => b.atMs + b.durationMs <= this.t); }

  /** Replay all beats up to t without sound/particles to recover persistent state. */
  private rebuild(t: number): void {
    this.actorAt.clear(); this.actorAt.set("pip", "forge");
    this.growth.clear(); this.lastPass = 0; this.evidenceCount = null; this.mood = "curious"; this.claimGremlinId = null; this.helperIndex = 0;
    for (const g of this.gremlins.values()) g.container.destroy(); this.gremlins.clear();
    for (const h of this.helpers.values()) h.container.destroy(); this.helpers.clear();
    for (const p of this.world.places) { this.worldLayer.setLamp(p.id, "idle"); this.worldLayer.setGrowth(p.id, 0); this.worldLayer.setGlow(p.id, 0); this.worldLayer.setScaffold(p.id, 0); }
    for (const b of this.beats) { if (b.atMs > t) break; this.onStart(b, true); if (b.atMs + b.durationMs <= t) this.onEnd(b, true); }
    this.pip.pose.mood = this.mood;
    // place pip
    const spot = this.worldLayer.standingSpot(this.actorAt.get("pip") ?? "forge");
    this.pip.pose.x = spot.x; this.pip.pose.y = spot.y; this.pip.snap();
    this.camTarget = null;
    this.fitCamera(); this.cameraStep(this.currentBeat(), 0); this.camera.snap();
  }
  private triggerBetween(a: number, b: number): void {
    for (const beat of this.beats) {
      if (beat.atMs > a && beat.atMs <= b) this.onStart(beat, false);
      const end = beat.atMs + beat.durationMs;
      if (end > a && end <= b) this.onEnd(beat, false);
    }
  }

  private onStart(b: Beat, silent: boolean): void {
    this.mood = b.mood;
    const theme = this.theme;
    const pan = (id: string) => { const p = this.worldLayer.positionOf(id); return p ? Math.max(-0.8, Math.min(0.8, p.ground.x / 600)) : 0; };
    const play = (name: Parameters<Sfx["play"]>[0], ctx: Partial<Parameters<Sfx["play"]>[1]> = {}) => { if (!silent && Sfx.plays(name, this.rate)) this.sfx.play(name, { theme, ...ctx }); };
    switch (b.kind) {
      case "curtain_up": play("curtain_up"); if (!silent) this.camera.pushIn(0.12); break;
      case "walk_to": { const from = this.worldLayer.standingSpot(this.actorAt.get(b.actor) ?? "forge"); this.walkFrom.set(b.actor, from); break; }
      case "read": play("read", { pan: pan(b.target) }); break;
      case "raise": {
        if (b.newPlace && !this.worldLayer.has(b.target)) {
          const d = this.world.districts.find((x) => x.id === b.newPlace!.district) ?? this.world.districts[0];
          const place = { id: b.target, kind: b.newPlace.kind, path: b.newPlace.path, label: b.newPlace.label, district: b.newPlace.district, gx: (d?.cx ?? 2) + 1, gy: (d?.cy ?? 2) + 1, footprint: 1 as const, height: 1, score: 0, touched: true };
          this.world.places.push(place); this.worldLayer.addPlace(place);
        }
        play("raise", { pan: pan(b.target) }); break;
      }
      case "build": play("build"); break;
      case "forge": play("forge"); break;
      case "search": play("search", { pan: pan("forge") }); break;
      case "run_tests": this.worldLayer.setLamp(b.target, "scan"); play("run_tests", { pan: pan(b.target) }); break;
      case "test_outcome": {
        const lamp: LampState = b.outcome === "pass" ? "pass" : b.outcome === "fail" ? "fail" : "idle";
        this.worldLayer.setLamp(b.target, lamp);
        if (b.outcome === "pass") { this.lastPass = b.atMs; this.evidenceCount = b.passed; }
        play("test_outcome", { outcome: b.outcome, pan: pan(b.target) });
        if (!silent && b.outcome === "fail") this.camera.shake(200);
        if (!silent && b.outcome === "pass") { const p = this.worldLayer.positionOf(b.target); if (p) this.particles.burst(p.top.x, p.top.y, 16, [theme.beacon.lamp.pass, 0xd6ffe9], 70, 40); }
        break;
      }
      case "spawn_gremlin": {
        const g = new Gremlin(b.gremlinId, theme, this.reducedMotion);
        const p = this.worldLayer.positionOf(b.target); const at = p ? p.ground : iso(0, 0);
        g.x = at.x + 18; g.y = at.y + 8; g.scale = silent ? 1 : 0.01;
        this.worldLayer.container.addChild(g.container); this.gremlins.set(b.gremlinId, g);
        play("spawn_gremlin", { pan: pan(b.target) });
        if (!silent) { this.camera.pushIn(0.06); this.particles.burst(g.x, g.y - 10, 18, [theme.gremlin.body, 0xb69cff], 60, 30); }
        break;
      }
      case "chase": { const g = this.gremlins.get(b.gremlinId); if (g) g.panic = 1; play("chase", { pan: pan(b.target) }); break; }
      case "banish": {
        const g = this.gremlins.get(b.gremlinId);
        if (g) { if (!silent) this.particles.burst(g.x, g.y - 10, 30, [0xffffff, theme.gremlin.body], 80, 35); g.container.destroy(); this.gremlins.delete(b.gremlinId); }
        if (this.claimGremlinId === b.gremlinId) { this.claimGremlinId = null; this.pip.pose.hiding = 0; }
        play("banish"); break;
      }
      case "celebrate": { play("celebrate"); if (!silent) { this.camera.pushIn(0.1); const p = this.worldLayer.standingSpot(this.actorAt.get("pip") ?? "forge"); this.particles.burst(p.x, p.y - 30, 56, [0xffb547, 0x5ff0a6, 0x7cc8ff, 0xff7b69, 0xb69cff, 0xffffff], 130, 90); } break; }
      case "summon_helper": {
        const spec = this.company.helpers[this.helperIndex++ % this.company.helpers.length]!;
        const h = new Pip(theme, this.reducedMotion, spec); h.container.scale.set(0.82 * spec.size);
        const spot = this.worldLayer.standingSpot("dock"); h.pose.x = spot.x; h.pose.y = spot.y;
        this.worldLayer.container.addChild(h.container); this.helpers.set(b.helperId, h); this.actorAt.set(b.helperId, "dock");
        play("summon_helper", { pan: pan("dock") }); break;
      }
      case "dismiss_helper": play("dismiss_helper", { pan: pan("dock") }); break;
      case "blocked_on_you": play("blocked_on_you"); break;
      case "your_turn": play("your_turn"); break;
      case "stumble": play("stumble"); if (!silent) this.camera.shake(160); break;
      case "unverified_claim": {
        const g = new Gremlin(b.gremlinId, theme, this.reducedMotion); g.scale = 0.8; g.alpha = 0.95;
        this.worldLayer.container.addChild(g.container); this.gremlins.set(b.gremlinId, g); this.claimGremlinId = b.gremlinId; this.pip.pose.hiding = 1;
        play("unverified_claim"); break;
      }
      case "curtain_down": play("curtain_down"); break;
      case "idle": break;
    }
  }
  private onEnd(b: Beat, _silent: boolean): void {
    switch (b.kind) {
      case "walk_to": this.actorAt.set(b.actor, b.target); this.walkFrom.delete(b.actor); break;
      case "build": this.growth.set(b.target, Math.min(18, (this.growth.get(b.target) ?? 0) + 3 + Math.round(b.intensity * 6))); this.worldLayer.setGrowth(b.target, this.growth.get(b.target)!); this.worldLayer.setScaffold(b.target, 0); break;
      case "dismiss_helper": { const h = this.helpers.get(b.helperId); if (h) { h.container.destroy(); this.helpers.delete(b.helperId); this.actorAt.delete(b.helperId); } break; }
      case "test_outcome": break;
    }
  }

  // ---------- per-frame posing ----------
  private pose(cur: Beat | null, dtMs: number): void {
    const dt = dtMs / 1000;
    for (const [actor, ch] of [["pip", this.pip] as const, ...[...this.helpers.entries()]]) {
      const a = ch.pose;
      a.moving = false; a.lift = 0; a.sx = 1; a.sy = 1; a.lean = 0; a.look = "fwd"; a.mood = this.mood; a.tool = "none"; a.toolPhase = 0;
      const mine = cur && cur.actor === actor ? cur : null;
      const standing = this.worldLayer.standingSpot(this.actorAt.get(actor) ?? (actor === "pip" ? "forge" : "dock"));
      a.x = standing.x; a.y = standing.y;
      if (!mine) { if (actor !== "pip") a.sy = 0.96; else this.idleBusiness(a); continue; }
      const u = seg(this.t, mine.atMs, mine.atMs + mine.durationMs);
      const target = "target" in mine ? this.worldLayer.standingSpot(mine.target) : standing;
      switch (mine.kind) {
        case "curtain_up": { const k = backOut(seg(u, 0.35, 0.8)); a.lift = (1 - Math.min(1, u / 0.5)) ** 2 * 150; a.sy = u < 0.5 ? 1.1 : 1 - 0.25 * bump(seg(u, 0.5, 0.75)); a.sx = 1 / a.sy; void k; break; }
        case "walk_to": {
          const from = this.walkFrom.get(actor) ?? standing;
          const ANT = Math.min(0.22, 140 / mine.durationMs); // anticipation: crouch and lean back before launching
          const e = u < ANT ? 0 : walkEase((u - ANT) / (1 - ANT));
          a.x = lerp(from.x, target.x, e); a.y = lerp(from.y, target.y, e); a.moving = u >= ANT && u < 0.98;
          a.face = target.x >= from.x ? 1 : -1;
          if (u < ANT) { const k = bump(u / ANT); a.sy = 1 - 0.1 * k; a.sx = 1 + 0.08 * k; a.lean = -a.face * 0.12 * k; }
          else {
            const ph = this.t / 1000 * (this.mood === "lost" ? 16 : 11); a.lift = Math.abs(Math.sin(ph)) * 3.5;
            const k = Math.cos(ph * 2); a.sy = 1 + 0.05 * k; a.sx = 1 - 0.05 * k; a.lean = a.face * 0.07;
            if (u > 0.86) { const f = bump((u - 0.86) / 0.14); a.lean = a.face * 0.16 * f; a.sy = 1 - 0.06 * f; a.sx = 1 + 0.05 * f; } // follow-through on arrival
          }
          if (actor === "pip" && this._playing) { this.footT += dt; if (this.footT > 0.19 && Sfx.plays("footstep", this.rate)) { this.footT = 0; this.sfx.play("footstep", { theme: this.theme, pan: Math.max(-0.8, Math.min(0.8, a.x / 600)) }); } }
          break;
        }
        case "read": { const nod = bump(((this.t / 1000) % 1.4) / 0.25); a.tool = "book"; a.toolPhase = ((this.t / 1000) % 1.4) / 1.4; a.lean = -0.17 + Math.sin(this.t / 1000 * 3) * 0.03 - nod * 0.05; a.sy = 1 - nod * 0.03; a.face = this.facing(a, mine.target); break; }
        case "build": case "forge": {
          // hammer rhythm: slow wind-up, fast strike (asymmetric), not a sine
          const period = mine.kind === "build" ? 0.28 - mine.intensity * 0.1 : 0.34;
          const ph = ((this.t / 1000) % period) / period;
          const wind = ph < 0.7 ? ph / 0.7 : 1 - (ph - 0.7) / 0.3;
          a.lift = wind * 4; a.lean = (ph < 0.7 ? -0.06 * wind : 0.12 * (1 - wind)); a.sy = ph < 0.7 ? 1 + 0.04 * wind : 1 - 0.08 * (1 - wind); a.sx = 1 / a.sy;
          a.tool = mine.kind === "build" ? "hammer" : "wrench"; a.toolPhase = mine.kind === "build" ? 1 - wind : ph;
          if ("target" in mine) a.face = this.facing(a, mine.target);
          if (actor === "pip" && this._playing && !this.reducedMotion) { this.hammerT += dt; const period = mine.kind === "build" ? 0.28 - mine.intensity * 0.1 : 0.34; if (this.hammerT > period) { this.hammerT = 0; if (Sfx.plays("hammer", this.rate)) this.sfx.play(mine.kind === "build" ? "hammer" : "spark", { theme: this.theme, intensity: mine.kind === "build" ? mine.intensity : 0.5 }); const p = "target" in mine ? this.worldLayer.positionOf(mine.target) : this.worldLayer.positionOf("forge"); if (p && Math.random() < 0.7) this.particles.burst(p.top.x + (Math.random() * 24 - 12), p.top.y + 10, 2, [0xffd66b, 0xfff3c4], 50, 60); } }
          break;
        }
        case "raise": a.look = "up"; a.sy = 1 + 0.05 * bump(u); a.tool = "trowel"; a.toolPhase = ((this.t / 1000) % 0.9) / 0.9; break;
        case "search": a.look = "up"; a.lean = Math.sin(this.t / 1000 * 1.5) * 0.12; a.tool = "lens"; a.toolPhase = ((this.t / 1000) % 2.4) / 2.4; break;
        case "run_tests": a.look = "up"; a.lean = Math.sin(this.t / 1000 * 2) * 0.04; a.tool = "clipboard"; a.toolPhase = ((this.t / 1000) % 1.6) / 1.6; break;
        case "test_outcome": if (mine.outcome === "fail") { const k = bump(seg(u, 0, 0.5)); a.lean = -0.25 * k; a.sy = 1 - 0.1 * k; a.sx = 1 + 0.08 * k; } else { a.lift = bump(u) * 14; } break;
        case "spawn_gremlin": { const k = bump(seg(u, 0, 0.5)); a.lift = Math.sin(Math.PI * seg(u, 0.05, 0.45)) * 12; a.lean = -0.22 * k; a.sx = 1 + 0.1 * k; a.sy = 1 - 0.1 * k; a.look = "down"; a.x = standing.x - a.face * 10 * k; break; }
        case "chase": { a.tool = "net"; a.toolPhase = ((this.t / 1000) % 0.5) / 0.5; const g = this.gremlins.get(mine.gremlinId); const base = target; const ang = u * Math.PI * 2 * 1.5; const r = 26;
          const gx = base.x + Math.cos(ang) * r, gy = base.y + Math.sin(ang) * r * 0.5;
          if (g) { g.x = gx; g.y = gy; g.panic = 1; }
          const lag = ang - 1.1; a.x = base.x + Math.cos(lag) * r; a.y = base.y + Math.sin(lag) * r * 0.5; a.moving = true; a.face = Math.cos(ang) > Math.cos(lag) ? 1 : -1;
          const ph = this.t / 1000 * 16; a.lift = Math.abs(Math.sin(ph)) * 4; a.lean = a.face * 0.12; break; }
        case "banish": { a.sy = 1 - 0.2 * bump(seg(u, 0, 0.4)); a.sx = 1 / a.sy; a.tool = "net"; a.toolPhase = 0.25 + bump(seg(u, 0, 0.4)) * 0.5; break; }
        case "celebrate": {
          const cyc = ((this.t - mine.atMs) % 1300) / 1300;
          if (cyc < 0.22) { const k = Math.sin(Math.PI * cyc / 0.22); a.sy = 1 - 0.24 * k; a.sx = 1 + 0.2 * k; }
          else if (cyc < 0.8) { const v = (cyc - 0.22) / 0.58; a.lift = Math.sin(Math.PI * v) * 32; a.sy = v < 0.5 ? 1 + 0.14 * (1 - v * 2) : 1; a.sx = 1 / a.sy; }
          else { const k = Math.sin(Math.PI * (cyc - 0.8) / 0.2); a.sy = 1 - 0.2 * k; a.sx = 1 + 0.16 * k; }
          break;
        }
        case "blocked_on_you": a.face = 1; a.look = "fwd"; a.sy = 1 + 0.03 * Math.sin(this.t / 1000 * 6); a.sx = 1 / a.sy; break;
        case "your_turn": this.idleBusiness(a); break; // waiting is thinking too
        case "stumble": { const k = bump(seg(u, 0, 0.7)); a.lean = Math.sin(this.t / 1000 * 40) * 0.12 * k; a.sy = 1 - 0.08 * k; a.sx = 1 + 0.06 * k; break; }
        case "unverified_claim": { a.face = 1; a.hiding = 1; const g = this.claimGremlinId ? this.gremlins.get(this.claimGremlinId) : null; if (g) { g.x = a.x - a.face * 14; g.y = a.y - 2; g.peek = 1; } break; }
        case "curtain_down": a.lean = Math.sin(this.t / 1000 * 6) * 0.15; a.face = 1; break;
        case "idle": this.idleBusiness(a); break;
        default: break;
      }
      if (actor === "pip" && this.quietLevel >= 2 && !a.moving) { const w = this.wall / 1000; a.sy = 0.84 + 0.012 * Math.sin(w * 0.9); a.sx = 1.1; a.look = "down"; a.lift = 0; } // sat down, dozing — whatever the last beat was
      if (this.claimGremlinId && mine.kind !== "unverified_claim") { const g = this.gremlins.get(this.claimGremlinId); if (g) { g.x = a.x - a.face * 14; g.y = a.y - 2; } }
      // depth: feet y → grid depth
      ch.container.zIndex = a.y / (TH / 2) + 0.6;
      if (actor !== "pip") a.mood = "focused";
    }
    for (const g of this.gremlins.values()) g.container.zIndex = g.y / (TH / 2) + 0.7;
  }
  private facing(a: CharacterPose, target: string): 1 | -1 { const p = this.worldLayer.positionOf(target); return p && p.ground.x < a.x ? -1 : 1; }

  private worldState(cur: Beat | null): void {
    for (const p of this.world.places) this.worldLayer.setGlow(p.id, 0);
    if (!cur) return;
    if (cur.kind === "read" || cur.kind === "build" || cur.kind === "chase" || cur.kind === "raise") this.worldLayer.setGlow(cur.target, cur.kind === "read" ? 0.5 : 1);
    if (cur.kind === "build") { const u = seg(this.t, cur.atMs, cur.atMs + cur.durationMs); this.worldLayer.setScaffold(cur.target, 0.85 * Math.min(seg(u, 0, 0.12), 1 - seg(u, 0.85, 1))); this.worldLayer.setGrowth(cur.target, (this.growth.get(cur.target) ?? 0) + Math.round((3 + cur.intensity * 6) * walkEase(u))); }
    if (cur.kind === "raise") { const u = seg(this.t, cur.atMs, cur.atMs + cur.durationMs); const d = this.worldLayer.positionOf(cur.target); if (d) this.worldLayer.setGrowth(cur.target, Math.round(-30 * (1 - backOut(u)))); }
    if (cur.kind === "spawn_gremlin") { const g = this.gremlins.get(cur.gremlinId); if (g) g.scale = Math.max(0.01, backOut(seg(this.t, cur.atMs, cur.atMs + 400))); }
    // lamps relax from pass to idle long after
    for (const p of this.world.places) if (p.kind === "beacon" && this.worldLayer.lampOf(p.id) === "pass" && this.t - this.lastPass > 12_000) this.worldLayer.setLamp(p.id, "idle");
  }

  private fitCamera(): void { this.camera.setZoomFactor(this.fitZoom()); this.baseZoom = this.fitZoom(); }
  private baseZoom = 1;
  /** Where the camera is currently told to look; moves only when the subject leaves the dead zone. */
  private camTarget: { x: number; y: number } | null = null;
  /** Whole-repo framing on; the follow camera off. */
  overview = false;
  /** Wheel/pinch multiplier on top of the director's zoom. */
  userZoom = 1;
  setOverview(on: boolean): void { this.overview = on; this.userZoom = 1; }
  /** The viewport changed (full screen, window resize): re-centre on the subject instead of leaving it at an edge. */
  resized(): void { this.camTarget = null; }
  zoomBy(factor: number): void { this.userZoom = Math.max(0.4, Math.min(3, this.userZoom * factor)); }
  private cameraStep(cur: Beat | null, dtMs: number): void {
    // renderer.screen is the logical (CSS-pixel) view; renderer.width already is too in Pixi 8 — dividing by resolution halved the view on Retina
    const view = { w: this.app.renderer.screen.width, h: this.app.renderer.screen.height };
    const narrow = view.w < 640;
    // follow Pip loosely; weight ramps in after the curtain
    // A follow camera, not a centre-lock: the subject may roam a dead zone in the middle of the frame;
    // when it leaves, the camera glides to bring it back with a little lead room in the walking direction.
    // Wide shots only at real boundaries (open, celebrate, close); the zoom never pumps per beat.
    const wide = !cur || cur.kind === "curtain_up" || cur.kind === "curtain_down" || cur.kind === "celebrate";
    const pts = this.world.places.map((p) => iso(p.gx + p.footprint / 2, p.gy + p.footprint / 2));
    const minX = Math.min(...pts.map((p) => p.x)) - 70, maxX = Math.max(...pts.map((p) => p.x)) + 70;
    const minY = Math.min(...pts.map((p) => p.y)) - 110, maxY = Math.max(...pts.map((p) => p.y)) + 50;
    const centre = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    const zNow = Math.max(0.05, this.camera.scale);
    const halfW = view.w / zNow / 2, halfH = view.h / zNow / 2;
    const clampAxis = (v: number, lo: number, hi: number) => (lo + halfW > hi - halfW ? (lo + hi) / 2 : Math.max(lo + halfW, Math.min(hi - halfW, v)));
    const clampY = (v: number, lo: number, hi: number) => (lo + halfH > hi - halfH ? (lo + hi) / 2 : Math.max(lo + halfH, Math.min(hi - halfH, v)));
    const subject = this.pip.drawn;
    const lead = this.pip.pose.moving ? this.pip.pose.face * halfW * 0.18 : 0;
    const want = { x: subject.x + lead, y: subject.y - 24 };
    if (wide || narrow) this.camTarget = wide ? { x: centre.x, y: centre.y } : want;
    else {
      if (!this.camTarget) this.camTarget = want;
      const dzX = halfW * 0.28, dzY = halfH * 0.26;
      const dx = want.x - this.camTarget.x, dy = want.y - this.camTarget.y;
      if (Math.abs(dx) > dzX) this.camTarget.x += dx - Math.sign(dx) * dzX;
      if (Math.abs(dy) > dzY) this.camTarget.y += dy - Math.sign(dy) * dzY;
    }
    const tx = clampAxis(this.camTarget.x, minX, maxX);
    const ty = clampY(this.camTarget.y, minY, maxY);
    this.camera.follow(tx, ty, 1);
    this.camera.setDrift(this.mood === "lost");
    // the person can pull back to the whole repo, or zoom with the wheel; the director's framing resumes on follow
    if (this.overview) { this.camTarget = { x: centre.x, y: centre.y }; this.camera.follow(centre.x, centre.y, 1); }
    this.camera.setZoomFactor((this.overview ? this.fitZoom() * 0.96 : this.zoomFor(cur, view.h)) * this.userZoom);
    this.camera.update(dtMs, view.w, view.h);
  }
  /** Zoom so the inhabited part of the world (places, not the whole terrain) fills the view. */
  /** Close for the story (a character is about an eighth of the frame); wide for the establishing and closing shots. */
  private zoomFor(cur: Beat | null, viewH: number): number {
    const fit = this.fitZoom();
    if (!cur) return fit;
    // story beats use an absolute scale so a character is always about a tenth of the frame tall,
    // whatever the repo size; the establishing and closing shots fit the whole stage
    const close = Math.max(fit, Math.min(1.7, Math.max(0.95, viewH / 430)));
    switch (cur.kind) {
      case "curtain_up": return fit * lerp(1.08, 1, walkEase(seg(this.t, cur.atMs, cur.atMs + cur.durationMs)));
      case "curtain_down": return fit * 1.05;
      case "celebrate": return fit * 1.15;
      default: return close; // every story beat shares one zoom; punches come from camera.pushIn, not zoom changes
    }
  }
  private fitZoom(): number {
    const pts = this.world.places.flatMap((p) => [iso(p.gx, p.gy), iso(p.gx + p.footprint, p.gy + p.footprint)]);
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const w = Math.max(60, Math.max(...xs) - Math.min(...xs) + 140), h = Math.max(60, Math.max(...ys) - Math.min(...ys) + 150);
    const vw = this.app.renderer.screen.width, vh = this.app.renderer.screen.height;
    return Math.min(vw / (w * 1.05), vh / (h * 1.05), 2.2);
  }

  // ---------- overlays (DOM layer reads these) ----------
  private bubble(cur: Beat | null): PlayerState["bubble"] {
    if (!cur) return null;
    const a = this.pip.pose; const s = this.camera.toScreen(a.x + 16, a.y - a.lift - 52);
    if (cur.kind === "read" || cur.kind === "search") return { text: "…", color: 0x40618a, screen: s };
    if (cur.kind === "spawn_gremlin" || (this.mood === "lost" && cur.kind !== "celebrate")) return { text: "?", color: 0xe2574c, screen: s };
    if (cur.kind === "celebrate") return { text: "!", color: 0x1f9a63, screen: s };
    if (cur.kind === "blocked_on_you") return { text: "!", color: 0xffb547, screen: s };
    if (cur.kind === "unverified_claim") return { text: "…", color: 0x7d5cff, screen: s };
    return null;
  }
  private labels(cur: Beat | null): PlayerState["labels"] {
    const out: PlayerState["labels"] = [];
    const active = cur && "target" in cur ? cur.target : null;
    for (const p of this.world.places) {
      if (p.kind === "forge" || p.kind === "dock") continue;
      const isActive = p.id === active;
      const lamp = p.kind === "beacon" ? this.worldLayer.lampOf(p.id) : "idle";
      if (!isActive && lamp === "idle") continue;
      const pos = this.worldLayer.positionOf(p.id); if (!pos) continue;
      out.push({ text: p.label, screen: this.camera.toScreen(pos.top.x, pos.top.y - 2), active: isActive });
    }
    return out;
  }
  destroy(): void { this.amb.stop(); this.worldLayer.destroy(); this.stage.destroy({ children: true }); }
}
