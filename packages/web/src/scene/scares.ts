import { Container, Graphics } from "pixi.js";
import type { AudioEngine } from "../audio/engine.js";
import { backOut, bump, easeIn, easeOut } from "../render/ease.js";

/**
 * Halloween jump scares: every minute or so, something leaps at the screen for a second or two — a ghost
 * swoops in, lightning cracks, a giant jack-o'-lantern rises from the bottom edge, a burst of bats.
 * Drawn in screen space above the stage, on a wall clock (they happen whether the story plays or not).
 * Never under reduced motion; switchable off from the stage toolbar.
 */
export type ScareKind = "ghost" | "lightning" | "pumpkin" | "bats";
export const SCARE_KINDS: readonly ScareKind[] = ["ghost", "lightning", "pumpkin", "bats"];
const DURATION: Record<ScareKind, number> = { ghost: 1700, lightning: 1000, pumpkin: 2300, bats: 1900 };
/** When, as a fraction of the scare, the camera should jolt. */
const PEAK: Record<ScareKind, number> = { ghost: 0.62, lightning: 0.02, pumpkin: 0.18, bats: 0.04 };

export class Scares {
  readonly container = new Container();
  private readonly g = new Graphics();
  private _enabled = true;
  private wall = 0;
  private next: number;
  private last: ScareKind | null = null;
  private active: { kind: ScareKind; t: number; dur: number; side: number; x: number; peaked: boolean } | null = null;

  constructor(private readonly audio: AudioEngine | null, private readonly reducedMotion: boolean, private readonly onPeak: (kind: ScareKind) => void = () => {}, private readonly rand: () => number = Math.random) {
    this.container.addChild(this.g);
    // the first one comes a little after the stage settles, then roughly once a minute
    this.next = 22000 + this.rand() * 16000;
  }

  get enabled(): boolean { return this._enabled; }
  set enabled(on: boolean) { this._enabled = on; if (!on) { this.active = null; this.g.clear(); } }
  /** The scare on screen now, if any (for tests and probes). */
  get current(): ScareKind | null { return this.active?.kind ?? null; }
  /** Milliseconds until the next scare is due. */
  get dueIn(): number { return Math.max(0, this.next - this.wall); }

  /** Start one now (also used by tests and the probe). */
  trigger(kind?: ScareKind): ScareKind | null {
    if (this.reducedMotion || !this._enabled) return null;
    const pool = SCARE_KINDS.filter((k) => k !== this.last);
    const k = kind ?? pool[Math.floor(this.rand() * pool.length)] ?? "ghost";
    this.active = { kind: k, t: 0, dur: DURATION[k], side: this.rand() < 0.5 ? -1 : 1, x: 0.2 + this.rand() * 0.6, peaked: false };
    this.last = k;
    this.next = this.wall + DURATION[k] + 45000 + this.rand() * 45000;
    this.sound(k);
    return k;
  }

  update(dtMs: number, w: number, h: number): void {
    const dt = Number.isFinite(dtMs) ? Math.max(0, Math.min(100, dtMs)) : 0;
    if (this.reducedMotion || !this._enabled) { if (this.active) { this.active = null; this.g.clear(); } return; }
    this.wall += dt;
    if (!this.active && this.wall >= this.next) this.trigger();
    const a = this.active;
    this.g.clear();
    if (!a) return;
    a.t += dt;
    const u = Math.min(1, a.t / a.dur);
    if (!a.peaked && u >= PEAK[a.kind]) { a.peaked = true; this.onPeak(a.kind); }
    switch (a.kind) {
      case "ghost": this.ghost(u, w, h, a.side); break;
      case "lightning": this.lightning(u, w, h, a.x); break;
      case "pumpkin": this.pumpkin(u, w, h, a.x); break;
      case "bats": this.bats(u, w, h, a.x); break;
    }
    if (u >= 1) { this.active = null; this.g.clear(); }
  }

  // ---------- the four scares ----------
  /** A sheet ghost swoops in from one side, rushing at the camera, then vanishes. */
  private ghost(u: number, w: number, h: number, side: number): void {
    const g = this.g, m = Math.min(w, h);
    const k = easeIn(Math.min(1, u / 0.7));
    const s = m * (0.08 + 0.55 * k);
    const x = w / 2 + side * (w * 0.62) * (1 - easeOut(Math.min(1, u / 0.7))) + Math.sin(u * 14) * m * 0.02 * (1 - k);
    const y = h * 0.5 + Math.sin(u * 9) * m * 0.03;
    const alpha = Math.min(1, u / 0.12) * (u > 0.72 ? Math.max(0, 1 - (u - 0.72) / 0.28) : 1);
    if (alpha <= 0) return;
    // darken the room a touch as it arrives
    g.rect(0, 0, w, h).fill({ color: 0x05020a, alpha: 0.35 * alpha * k });
    // body: a domed head flowing into a wavy hem
    const top = y - s, hem = y + s * 0.9;
    g.moveTo(x - s * 0.8, hem).lineTo(x - s * 0.8, y - s * 0.1).bezierCurveTo(x - s * 0.8, top - s * 0.15, x + s * 0.8, top - s * 0.15, x + s * 0.8, y - s * 0.1).lineTo(x + s * 0.8, hem);
    for (let i = 4; i >= 0; i--) { const xi = x - s * 0.8 + (s * 1.6 * i) / 4, wave = Math.sin(u * 30 + i * 1.7) * s * 0.06; g.quadraticCurveTo(xi + s * 0.2, hem - s * 0.22 + wave, xi, hem + wave); }
    g.closePath().fill({ color: 0xf4f1ff, alpha: 0.92 * alpha });
    g.circle(x, y - s * 0.2, s * 1.25).fill({ color: 0xd9d2ff, alpha: 0.08 * alpha });
    // hollow eyes and a howling mouth
    g.ellipse(x - s * 0.3, y - s * 0.35, s * 0.15, s * 0.22).fill({ color: 0x14081f, alpha });
    g.ellipse(x + s * 0.3, y - s * 0.35, s * 0.15, s * 0.22).fill({ color: 0x14081f, alpha });
    g.ellipse(x, y + s * 0.18, s * 0.17, s * (0.2 + 0.1 * Math.sin(u * 40)) ).fill({ color: 0x14081f, alpha });
  }

  /** Two flashes of lightning and a forked bolt; the thunder follows. */
  private lightning(u: number, w: number, h: number, fx: number): void {
    const g = this.g;
    const flash = u < 0.06 ? 0.8 : u < 0.12 ? 0.08 : u < 0.2 ? 0.6 : Math.max(0, 0.45 * (1 - (u - 0.2) / 0.8));
    g.rect(0, 0, w, h).fill({ color: 0xf2eeff, alpha: flash * 0.75 });
    if (u < 0.5) {
      // a seeded zig-zag from the sky
      let x = w * fx, y = 0; const steps = 9, a = 1 - u / 0.5;
      g.moveTo(x, y);
      for (let i = 1; i <= steps; i++) { x += (i % 2 ? 1 : -1) * w * (0.025 + 0.02 * Math.abs(Math.sin(i * 12.9898 + fx * 78.233))); y = (h * 0.7 * i) / steps; g.lineTo(x, y); }
      g.stroke({ width: 14, color: 0x6b4dff, alpha: 0.45 * a }).stroke({ width: 6, color: 0x9d86ff, alpha: 0.8 * a }).stroke({ width: 2.5, color: 0xffffff, alpha: a });
    }
  }

  /** A giant jack-o'-lantern rises from the bottom edge, grins, flickers and sinks back. */
  private pumpkin(u: number, w: number, h: number, fx: number): void {
    const g = this.g, R = Math.min(w, h) * 0.34;
    const up = u < 0.25 ? backOut(u / 0.25) : u > 0.78 ? 1 - easeIn((u - 0.78) / 0.22) : 1;
    const x = w * (0.3 + fx * 0.4), y = h + R * 1.05 - up * R * 1.75;
    const flick = 0.75 + 0.25 * Math.sin(u * 60) * Math.sin(u * 23);
    g.rect(0, 0, w, h).fill({ color: 0x05020a, alpha: 0.3 * up });
    g.circle(x, y, R * 1.6).fill({ color: 0xff8a1a, alpha: 0.1 * up * flick });
    // ribs
    g.ellipse(x - R * 0.55, y, R * 0.62, R * 0.86).fill(0xd65c0c);
    g.ellipse(x + R * 0.55, y, R * 0.62, R * 0.86).fill(0xc9520a);
    g.ellipse(x, y, R * 0.66, R * 0.92).fill(0xff7a1a);
    g.ellipse(x - R * 0.28, y - R * 0.55, R * 0.2, R * 0.1).fill({ color: 0xffffff, alpha: 0.18 });
    g.roundRect(x - R * 0.07, y - R * 1.08, R * 0.14, R * 0.26, R * 0.04).fill(0x4a6a2a);
    // carved face, lit from inside
    const lit = { color: 0xffd66b, alpha: flick };
    g.poly([x - R * 0.55, y - R * 0.12, x - R * 0.15, y - R * 0.12, x - R * 0.36, y - R * 0.5]).fill(lit);
    g.poly([x + R * 0.15, y - R * 0.12, x + R * 0.55, y - R * 0.12, x + R * 0.36, y - R * 0.5]).fill(lit);
    g.poly([x - R * 0.12, y + R * 0.08, x + R * 0.12, y + R * 0.08, x, y - R * 0.12]).fill(lit);
    const my = y + R * 0.3, grin = 0.6 + 0.4 * bump(Math.min(1, u * 1.6));
    g.poly([x - R * 0.6, my - R * 0.08, x - R * 0.4, my + R * 0.06, x - R * 0.25, my - R * 0.04, x - R * 0.1, my + R * 0.1, x + R * 0.1, my - R * 0.02, x + R * 0.25, my + R * 0.1, x + R * 0.4, my - R * 0.04, x + R * 0.6, my - R * 0.08, x + R * 0.38, my + R * 0.32 * grin, x - R * 0.38, my + R * 0.32 * grin]).fill(lit);
  }

  /** A colony bursts out of the stage, wings filling the screen. */
  private bats(u: number, w: number, h: number, fx: number): void {
    const g = this.g, m = Math.min(w, h), ox = w * (0.3 + fx * 0.4), oy = h * 0.62;
    const fade = u > 0.75 ? Math.max(0, 1 - (u - 0.75) / 0.25) : 1;
    for (let i = 0; i < 28; i++) {
      const ang = -Math.PI * (0.08 + 0.84 * ((i * 0.618) % 1)) + Math.sin(i) * 0.2;
      const speed = 0.6 + ((i * 0.37) % 1) * 0.6, d = easeOut(u) * m * 0.78 * speed;
      const x = ox + Math.cos(ang) * d * (w / m) * 0.8, y = oy + Math.sin(ang) * d;
      const k = (0.9 + 2.8 * easeIn(u)) * (0.8 + ((i * 0.53) % 1) * 0.5), flap = Math.sin(u * (60 + i * 3) + i);
      const wy = -6 * flap * k, ww = 14 * k;
      g.moveTo(x, y).quadraticCurveTo(x - ww * 0.5, y + wy - 4 * k, x - ww, y + wy).quadraticCurveTo(x - ww * 0.55, y + wy * 0.3 + 2 * k, x - ww * 0.3, y + 3 * k).lineTo(x, y + 2 * k)
        .lineTo(x + ww * 0.3, y + 3 * k).quadraticCurveTo(x + ww * 0.55, y + wy * 0.3 + 2 * k, x + ww, y + wy).quadraticCurveTo(x + ww * 0.5, y + wy - 4 * k, x, y).fill({ color: 0x0b0612, alpha: 0.92 * fade });
      g.circle(x - 1.2 * k, y + 0.6 * k, 0.7 * k).fill({ color: 0xff5a4e, alpha: fade });
      g.circle(x + 1.2 * k, y + 0.6 * k, 0.7 * k).fill({ color: 0xff5a4e, alpha: fade });
    }
  }

  // ---------- sound (only heard when effects are on; the engine handles mute) ----------
  private sound(k: ScareKind): void {
    const a = this.audio; if (!a?.ready) return;
    const later = (ms: number, f: () => void) => setTimeout(f, ms);
    switch (k) {
      case "ghost":
        a.noise(1.1, { filter: "bandpass", freq: 300, sweepTo: 2600, q: 1.2, gain: 0.12, attack: 0.4 });
        later(950, () => { a.tone(660, 0.5, { type: "sawtooth", gain: 0.06, slideTo: 1320, lowpass: 2600 }); a.tone(990, 0.45, { type: "sine", gain: 0.05, slideTo: 1760 }); });
        return;
      case "lightning":
        a.noise(0.08, { filter: "highpass", freq: 2000, gain: 0.12 });
        later(180, () => a.noise(1.8, { filter: "lowpass", freq: 180, gain: 0.3, attack: 0.05 }));
        return;
      case "pumpkin":
        a.tone(70, 0.6, { type: "sine", gain: 0.22, slideTo: 45 });
        [0, 230, 460].forEach((ms, i) => later(500 + ms, () => a.tone(330 - i * 40, 0.18, { type: "triangle", gain: 0.08, slideTo: 260 - i * 40, lowpass: 1600 })));
        return;
      case "bats":
        for (let i = 0; i < 9; i++) later(i * 70, () => a.noise(0.06, { filter: "bandpass", freq: 900 + i * 120, q: 3, gain: 0.07 }));
        later(120, () => a.tone(2400, 0.12, { type: "square", gain: 0.02, slideTo: 3200, lowpass: 4000 }));
        return;
    }
  }
}
