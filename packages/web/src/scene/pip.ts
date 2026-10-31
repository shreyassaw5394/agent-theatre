import { Container, Graphics } from "pixi.js";
import type { Mood } from "@agent-theatre/core";
import type { SetTheme } from "../sets/types.js";
import { bump } from "../render/ease.js";
import { CAST, type CharacterSpec } from "./cast.js";

/**
 * Pip, drawn procedurally every frame. Kept behind this small interface so a
 * Rive or sprite character can replace it without touching the player.
 */
export type Tool = "none" | "hammer" | "wrench" | "book" | "lens" | "trowel" | "clipboard" | "net" | "flag" | "broom";
export interface CharacterPose {
  /** World position (feet). */
  x: number; y: number;
  /** Vertical lift in px (jumps, landings). */
  lift: number;
  /** Squash & stretch. */
  sx: number; sy: number;
  /** Lean in radians. */
  lean: number;
  /** Facing: -1 left, +1 right. */
  face: 1 | -1;
  moving: boolean;
  look: "fwd" | "up" | "down";
  mood: Mood;
  /** What is in the hand, and where in its motion it is (0..1). Every kind of work has a tool. */
  tool: Tool; toolPhase: number;
  /** 0..1 how much Pip is hiding something (claim gremlin behind). */
  hiding: number;
}

export class Pip {
  readonly container = new Container();
  private readonly shadow = new Graphics();
  private readonly body = new Graphics();
  private t = 0;
  /** Target pose, set by the player every frame. */
  pose: CharacterPose = { x: 0, y: 0, lift: 0, sx: 1, sy: 1, lean: 0, face: 1, moving: false, look: "fwd", mood: "curious", hiding: 0, tool: "none", toolPhase: 0 };
  /** What is actually drawn: eases toward `pose` so beats transition instead of cut. */
  private shown = { x: 0, y: 0, lift: 0, sx: 1, sy: 1, lean: 0, face: 1 as 1 | -1, faceK: 1 };
  private snapNext = true;
  /** Secondary motion: lean into travel, squash on landing, ears that trail behind. Never in reduced motion. */
  private motion = { px: 0, lean: 0, land: 0, prevLift: 0, ear: 0 };
  /** Call after a seek so the character doesn't glide from the old spot. */
  snap(): void { this.snapNext = true; }
  /** Where the character is drawn this frame (eased), not where it is headed. */
  get drawn(): { x: number; y: number } { return { x: this.shown.x, y: this.shown.y }; }

  constructor(private theme: SetTheme, private reducedMotion: boolean, public spec: CharacterSpec = CAST[0]!) {
    this.container.addChild(this.shadow, this.body);
    this.container.scale.set(1.75 * spec.size);
  }
  setTheme(t: SetTheme): void { this.theme = t; }

  update(dtMs: number): void {
    // a seek hands over a negative (or NaN) delta: time never runs backwards for the character, or the turn and
    // the eases overshoot (Pip showed as a sliver for a second after every scrub)
    const dt = Number.isFinite(dtMs) ? Math.max(0, Math.min(0.05, dtMs / 1000)) : 0;
    this.t += Number.isFinite(dtMs) ? Math.max(0, dtMs) / 1000 : 0;
    const target = this.pose, T = this.spec, t = this.t;
    const sh = this.shown;
    if (this.snapNext) { Object.assign(sh, { x: target.x, y: target.y, lift: target.lift, sx: target.sx, sy: target.sy, lean: target.lean, face: target.face, faceK: 1 }); Object.assign(this.motion, { px: target.x, lean: 0, land: 0, prevLift: target.lift, ear: 0 }); this.snapNext = false; }
    // exponential ease toward target; squash/lean are quick, position a touch slower (follow-through)
    const kq = 1 - Math.pow(0.0005, dt), kp = 1 - Math.pow(0.002, dt);
    sh.x += (target.x - sh.x) * kp; sh.y += (target.y - sh.y) * kp;
    sh.lift += (target.lift - sh.lift) * kq; sh.sx += (target.sx - sh.sx) * kq; sh.sy += (target.sy - sh.sy) * kq; sh.lean += (target.lean - sh.lean) * kq;
    // turning: scale x through zero rather than flipping
    if (sh.face !== target.face) { sh.faceK -= dt * 9; if (sh.faceK <= 0) { sh.face = target.face; sh.faceK = 0.01; } } else sh.faceK = Math.max(0.01, Math.min(1, sh.faceK + dt * 9));
    const m = this.motion;
    if (!this.reducedMotion && dt > 0) {
      const vx = (sh.x - m.px) / dt, vLift = (sh.lift - m.prevLift) / dt;
      // lean a little into horizontal travel, eased so starts and stops read as weight
      m.lean += (Math.max(-0.11, Math.min(0.11, vx * 0.0016)) - m.lean) * (1 - Math.pow(0.002, dt));
      // touching down from a hop or jump: a quick squash that springs back
      if (m.prevLift > 5 && sh.lift <= 1.5) m.land = Math.min(1, m.prevLift / 22 + 0.35);
      m.land = Math.max(0, m.land - dt * 5.5);
      // ears lag behind vertical motion (follow-through), then settle
      m.ear += (Math.max(-1, Math.min(1, -vLift * 0.012)) - m.ear) * (1 - Math.pow(0.0008, dt));
    }
    m.px = sh.x; m.prevLift = sh.lift;
    const landK = Math.sin(Math.PI * Math.min(1, m.land)) * m.land;
    const a = { ...target, x: sh.x, y: sh.y, lift: sh.lift, sx: sh.sx * Math.max(0.15, sh.faceK) * (1 + 0.1 * landK), sy: sh.sy * (1 - 0.13 * landK), lean: sh.lean + m.lean, face: sh.face };
    this.container.position.set(a.x, a.y);
    this.container.zIndex = 1e6; // player sets a proper depth; this is a fallback

    const shadowK = 1 - Math.min(0.6, a.lift / 90);
    this.shadow.clear().ellipse(0, 0, 11 * shadowK, 5 * shadowK).fill({ color: 0x000000, alpha: 0.28 });
    this.shadow.ellipse(0, 0, 14 * shadowK, 7 * shadowK).fill({ color: 0x000000, alpha: 0.1 });

    const g = this.body;
    g.clear();
    g.position.set(0, -a.lift);
    g.rotation = a.lean;
    g.scale.set(a.sx, a.sy);

    // breathing when still (alive, but quiet)
    const breathe = a.moving || this.reducedMotion ? 0 : Math.sin(t * 2.2) * 0.012;
    g.scale.set(a.sx * (1 - breathe), a.sy * (1 + breathe));

    // feet
    const fo = a.moving ? Math.sin(t * 11) * 3 : 0;
    g.ellipse(-5 + fo, -1.5, 4.2, 2.6).fill(T.ear);
    g.ellipse(5 - fo, -1.5, 4.2, 2.6).fill(T.ear);
    // body silhouette by shape; two tones to fake the gradient
    switch (T.shape) {
      case "tall": g.ellipse(0, -16, 9.5, 16.5).fill(T.body); g.ellipse(-1.5, -21, 7.5, 9).fill({ color: T.bodyLight, alpha: 0.55 }); break;
      case "boxy": g.roundRect(-11, -26, 22, 26, 6).fill(T.body); g.roundRect(-9, -24, 12, 10, 4).fill({ color: T.bodyLight, alpha: 0.5 }); break;
      case "teardrop": g.moveTo(0, -30).quadraticCurveTo(13, -16, 11, -6).quadraticCurveTo(0, 2, -11, -6).quadraticCurveTo(-13, -16, 0, -30).fill(T.body); g.ellipse(-2, -16, 6, 7).fill({ color: T.bodyLight, alpha: 0.5 }); break;
      case "bean": g.ellipse(0, -12, 12.5, 11.5).fill(T.body); g.ellipse(-2, -18, 8, 6).fill({ color: T.bodyLight, alpha: 0.55 }); break;
      default: g.ellipse(0, -13.5, 11.5, 13.5).fill(T.body); g.ellipse(-1.5, -17, 9.5, 9).fill({ color: T.bodyLight, alpha: 0.55 });
    }
    // rim light (sun upper-left) and a cool bounce from the ground on the far side: the body reads as round, not flat
    const bodyR = T.shape === "tall" ? 9.5 : T.shape === "boxy" ? 11 : T.shape === "bean" ? 12.5 : 11.5, bodyY = T.shape === "tall" ? -16 : T.shape === "boxy" ? -13 : T.shape === "bean" ? -12 : -13.5;
    g.moveTo(-bodyR * 0.9, bodyY - bodyR * 0.2).quadraticCurveTo(-bodyR * 0.75, bodyY - bodyR * 0.95, bodyR * 0.1, bodyY - bodyR * 1.02).stroke({ width: 2.2, color: 0xffffff, alpha: 0.5, cap: "round" });
    g.moveTo(bodyR * 0.95, bodyY + bodyR * 0.1).quadraticCurveTo(bodyR * 0.8, bodyY + bodyR * 0.8, bodyR * 0.1, bodyY + bodyR * 0.98).stroke({ width: 2.4, color: this.theme.sky[0], alpha: 0.28, cap: "round" });
    g.ellipse(a.face * 1.2, -7.5, 6.5, 5.5).fill({ color: T.belly, alpha: 0.92 });
    // cheeks
    g.ellipse(-8 + a.face * 1.5, -11, 2.4, 1.5).fill({ color: T.cheek, alpha: 0.45 });
    g.ellipse(8 + a.face * 1.5, -11, 2.4, 1.5).fill({ color: T.cheek, alpha: 0.45 });
    // topper
    const flap = a.moving ? Math.sin(t * 14) * 0.25 : 0, lag = m.ear * 3;
    const crown = T.shape === "tall" ? -33 : T.shape === "teardrop" ? -30 : -27;
    switch (T.topper) {
      case "ears": g.ellipse(-9, crown + 4 + flap * 6 + lag, 3.2, 5 - lag * 0.3).fill(T.ear); g.ellipse(9, crown + 4 - flap * 6 + lag, 3.2, 5 - lag * 0.3).fill(T.ear); break;
      case "tuft": g.moveTo(-3, crown + 1).quadraticCurveTo(-6, crown - 9, 1, crown - 12).moveTo(0, crown).quadraticCurveTo(4, crown - 10, 8, crown - 8).stroke({ width: 2.2, color: T.ear, cap: "round" }); break;
      case "leaf": g.moveTo(0, crown).quadraticCurveTo(2 + flap * 10, crown - 8, 8, crown - 12).quadraticCurveTo(4, crown - 4, 0, crown).fill(T.ear); g.moveTo(0, crown).lineTo(5, crown - 7).stroke({ width: 1, color: T.belly, alpha: 0.7 }); break;
      case "crest": for (const k of [-6, -2, 2, 6]) g.moveTo(k, crown + 1).lineTo(k * 1.4, crown - 7 - Math.abs(k) * 0.3).stroke({ width: 2.4, color: T.ear, cap: "round" }); break;
      case "halo": g.ellipse(0, crown - 7, 9, 2.6).stroke({ width: 1.8, color: this.theme.mood[a.mood], alpha: 0.9 }); break;
      case "antenna": g.ellipse(-9, crown + 4 + flap * 6 + lag, 3.2, 5 - lag * 0.3).fill(T.ear); g.ellipse(9, crown + 4 - flap * 6 + lag, 3.2, 5 - lag * 0.3).fill(T.ear); break;
    }

    // eyes
    const ex = a.face * 1.8, ey = -16;
    const blink = !this.reducedMotion && (t % 3.3) < 0.13 && a.mood !== "happy";
    for (const s of [-1, 1] as const) {
      const x = ex + s * 4.6;
      if (a.mood === "happy") { g.beginPath(); g.arc(x, ey + 1.5, 2.8, Math.PI * 1.1, Math.PI * 1.9).stroke({ width: 1.6, color: T.ink, cap: "round" }); continue; }
      if (blink) { g.moveTo(x - 2.6, ey).lineTo(x + 2.6, ey).stroke({ width: 1.6, color: T.ink, cap: "round" }); continue; }
      if (T.eyes === "visor") { if (s < 0) { g.roundRect(ex - 8.5, ey - 3, 17, 6, 3).fill(0xffffff); g.roundRect(ex - 7 + (a.look === "up" ? 0 : 1), ey - 1.5, 5, 3, 1.5).fill(T.ink); g.roundRect(ex + 2 + (a.look === "up" ? 0 : 1), ey - 1.5, 5, 3, 1.5).fill(T.ink); } continue; }
      const ry = T.eyes === "dot" ? 2.6 : T.eyes === "sleepy" ? 2.4 : a.mood === "focused" ? 3 : 4.3;
      g.ellipse(x, ey, T.eyes === "dot" ? 2.6 : 3.4, ry).fill(0xffffff);
      if (T.eyes === "sleepy") g.moveTo(x - 3.4, ey - 2.2).lineTo(x + 3.4, ey - 2.2).stroke({ width: 2, color: T.body });
      const glance = !a.moving && !this.reducedMotion && (t % 4.1) > 3.3 ? Math.sin(((t % 4.1) - 3.3) / 0.8 * Math.PI) : 0;
      let px = a.face * 1.1 + glance * 1.6, py = (a.look === "up" ? -1.6 : a.look === "down" ? 1.4 : 0.3) - glance * 0.8;
      if (a.mood === "lost") { px = Math.sin(t * 3) * 1.4; py = -1.2; }
      g.ellipse(x + px, ey + py, 1.9, a.mood === "focused" ? 1.8 : 2.2).fill(T.ink);
      g.ellipse(x + px + 0.7, ey + py - 0.8, 0.6, 0.6).fill(0xffffff);
      if (a.mood === "lost") g.moveTo(x - 3, ey - 5.6 - (s > 0 ? 0 : 1.3)).lineTo(x + 3, ey - 5.6 - (s > 0 ? 1.3 : 0)).stroke({ width: 1.6, color: T.ink, cap: "round" });
      if (a.mood === "focused") g.moveTo(x - 3.2, ey - 3.7 - (s > 0 ? 1 : 0)).lineTo(x + 3.2, ey - 3.7 - (s > 0 ? 0 : 1)).stroke({ width: 1.6, color: T.ink, cap: "round" });
      if (a.mood === "uneasy") g.moveTo(x - 3, ey - 5).lineTo(x + 3, ey - 6 + (s > 0 ? 1.5 : -1.5)).stroke({ width: 1.4, color: T.ink, cap: "round" });
    }
    // mouth
    g.beginPath();
    if (a.mood === "happy") g.arc(ex, -10.5, 3.2, 0, Math.PI).fill(0x7a2e22);
    else if (a.mood === "lost" || a.mood === "uneasy") g.arc(ex, -8.4, 2.2, Math.PI * 1.15, Math.PI * 1.85).stroke({ width: 1.6, color: T.ink, cap: "round" });
    else g.arc(ex, -11.2, 1.9, Math.PI * 0.15, Math.PI * 0.85).stroke({ width: 1.6, color: T.ink, cap: "round" });

    // mood light: an antenna bulb for antenna characters, a small glow at the crown for the rest
    const sway = (this.reducedMotion ? 0 : Math.sin(t * 5) * 2) - a.lean * 10 + lag * 0.6;
    const bc = this.theme.mood[a.mood];
    if (T.topper === "antenna") {
      g.moveTo(0, crown + 0.5).quadraticCurveTo(sway * 0.5, crown - 5, sway + 1.5, crown - 9).stroke({ width: 1.4, color: T.ear });
      g.circle(sway + 1.5, crown - 10, 9).fill({ color: bc, alpha: 0.28 }); g.circle(sway + 1.5, crown - 10, 5.5).fill({ color: bc, alpha: 0.35 }); g.circle(sway + 1.5, crown - 10, 2.8).fill(bc);
    } else if (T.topper !== "halo") {
      g.circle(0, crown - 2, 7).fill({ color: bc, alpha: 0.22 }); g.circle(0, crown - 2, 2.2).fill({ color: bc, alpha: 0.9 });
    }

    // the tool in hand: drawn in front of the body at hand height, posed by toolPhase
    if (a.tool !== "none") this.drawTool(g, a, T);

    // hiding something: a nervous sideways glance, slightly hunched
    if (a.hiding > 0) {
      const k = bump((t * 0.5) % 1) * a.hiding;
      g.rotation = a.lean + k * 0.06;
    }
  }

  /** Props are drawn, never loaded: a handle and a head, posed by the beat's phase. */
  private drawTool(g: Graphics, a: CharacterPose, T: CharacterSpec): void {
    const f = a.face, hx = f * 9, hy = -10, p = a.toolPhase;
    const wood = 0x8a5a2b, steel = 0xd6dde8, dark = T.ink;
    // props are drawn 1.6x the hand scale so they read from the camera's distance
    g.scale.set(1, 1);
    const K = 1.6;
    const rot = (len: number, ang: number) => ({ x: hx + Math.cos(ang) * len * K * f, y: hy + Math.sin(ang) * len * K });
    switch (a.tool) {
      case "hammer": { // wind-up lifts it behind, strike brings it down in front
        const ang = -1.9 + p * 2.3; const tip = rot(15, ang);
        g.moveTo(hx, hy).lineTo(tip.x, tip.y).stroke({ width: 3.4, color: wood, cap: "round" });
        g.roundRect(tip.x - 6, tip.y - 4.5, 12, 9, 2).fill(steel); g.roundRect(tip.x - 6, tip.y - 4.5, 12, 3, 1.5).fill({ color: 0xffffff, alpha: 0.45 });
        break; }
      case "wrench": { const ang = -0.6 + Math.sin(p * Math.PI * 2) * 0.5; const tip = rot(13, ang), base = rot(3, ang);
        g.moveTo(base.x, base.y).lineTo(tip.x, tip.y).stroke({ width: 3.6, color: steel, cap: "round" });
        g.circle(tip.x, tip.y, 5).fill(steel); g.circle(tip.x + f * 3, tip.y - 2, 2.4).fill(0x1b2433);
        break; }
      case "book": { const y = hy - 2 - Math.sin(p * Math.PI) * 1.5;
        g.poly([hx - 11, y, hx, y + 3, hx, y - 11, hx - 11, y - 14]).fill(0xfff6d8); g.poly([hx, y + 3, hx + 11, y, hx + 11, y - 14, hx, y - 11]).fill(0xfff6d8);
        g.moveTo(hx - 11, y - 14).lineTo(hx, y - 11).lineTo(hx + 11, y - 14).stroke({ width: 1.6, color: 0xc8a96a });
        for (const k of [-8, -5, -2]) { g.moveTo(hx - 8, y + k).lineTo(hx - 2, y + k + 1).stroke({ width: 1, color: 0x9a8a6a }); g.moveTo(hx + 2, y + k + 1).lineTo(hx + 8, y + k).stroke({ width: 1, color: 0x9a8a6a }); }
        break; }
      case "lens": { const sx = hx + f * (4 + Math.sin(p * Math.PI * 2) * 4), sy = hy - 6 + Math.cos(p * Math.PI * 2) * 2;
        g.moveTo(sx - f * 5, sy + 5).lineTo(sx - f * 13, sy + 13).stroke({ width: 3, color: wood, cap: "round" });
        g.circle(sx, sy, 8).fill({ color: 0xbfe6ff, alpha: 0.5 }); g.circle(sx, sy, 8).stroke({ width: 2.2, color: steel }); g.circle(sx - 2.5, sy - 2.5, 2).fill({ color: 0xffffff, alpha: 0.75 });
        break; }
      case "trowel": { const lift = Math.sin(p * Math.PI) * 6; const ang = -0.4 - Math.sin(p * Math.PI) * 0.5; const tip = rot(9, ang);
        g.moveTo(hx, hy - lift).lineTo(tip.x, tip.y - lift).stroke({ width: 3, color: wood, cap: "round" });
        g.poly([tip.x, tip.y - lift - 6, tip.x + f * 14, tip.y - lift, tip.x, tip.y - lift + 6]).fill(steel);
        g.roundRect(hx + f * 3 - 6, hy - lift - 22, 12, 8, 1.5).fill(0xc9684a); // the block being set
        break; }
      case "clipboard": { g.roundRect(hx - 8, hy - 16, 16, 20, 2).fill(0xe8d9b5); g.rect(hx - 4, hy - 18, 8, 4).fill(dark);
        for (const k of [-10, -5, 0]) g.moveTo(hx - 5, hy + k).lineTo(hx + 5, hy + k).stroke({ width: 1.2, color: 0x9a8a6a });
        if (p > 0.5) g.moveTo(hx - 5.5, hy - 11).lineTo(hx - 3, hy - 8.5).lineTo(hx + 2, hy - 14).stroke({ width: 2, color: 0x2fa36b, cap: "round" });
        break; }
      case "net": { const ang = -1.2 + Math.sin(p * Math.PI * 2) * 0.9; const tip = rot(16, ang);
        g.moveTo(hx, hy).lineTo(tip.x, tip.y).stroke({ width: 3, color: wood, cap: "round" });
        g.ellipse(tip.x + f * 4, tip.y, 9, 6).stroke({ width: 2, color: steel }); g.ellipse(tip.x + f * 4, tip.y + 3, 8, 8).fill({ color: 0xffffff, alpha: 0.12 });
        break; }
      case "flag": { const top = { x: hx, y: hy - 28 }; const wave = Math.sin(p * Math.PI * 2) * 3;
        g.moveTo(hx, hy + 2).lineTo(top.x, top.y).stroke({ width: 2.2, color: wood });
        g.poly([top.x, top.y, top.x + f * 17, top.y + 5 + wave, top.x, top.y + 11]).fill(T.ear);
        break; }
      case "broom": { const ang = 0.9 + Math.sin(p * Math.PI * 2) * 0.25; const tip = rot(14, ang);
        g.moveTo(hx, hy - 4).lineTo(tip.x, tip.y).stroke({ width: 2, color: wood, cap: "round" });
        for (let k = -3; k <= 3; k += 1.5) g.moveTo(tip.x, tip.y).lineTo(tip.x + k * f, tip.y + 6).stroke({ width: 1.1, color: 0xd8b86a });
        break; }
    }
  }
}
