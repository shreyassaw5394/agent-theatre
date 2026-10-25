import { Container, Graphics } from "pixi.js";
import type { Mood } from "@agent-theatre/core";
import type { SetTheme } from "../sets/types.js";
import { bump } from "../render/ease.js";

/**
 * Pip, drawn procedurally every frame. Kept behind this small interface so a
 * Rive or sprite character can replace it without touching the player.
 */
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
  /** 0..1 how much Pip is hiding something (claim gremlin behind). */
  hiding: number;
}

export class Pip {
  readonly container = new Container();
  private readonly shadow = new Graphics();
  private readonly body = new Graphics();
  private t = 0;
  pose: CharacterPose = { x: 0, y: 0, lift: 0, sx: 1, sy: 1, lean: 0, face: 1, moving: false, look: "fwd", mood: "curious", hiding: 0 };

  constructor(private theme: SetTheme, private reducedMotion: boolean) {
    this.container.addChild(this.shadow, this.body);
    this.container.scale.set(1.18);
  }
  setTheme(t: SetTheme): void { this.theme = t; }

  update(dtMs: number): void {
    this.t += dtMs / 1000;
    const a = this.pose, T = this.theme.pip, t = this.t;
    this.container.position.set(a.x, a.y);
    this.container.zIndex = 1e6; // player sets a proper depth; this is a fallback

    const sh = 1 - Math.min(0.6, a.lift / 90);
    this.shadow.clear().ellipse(0, 0, 11 * sh, 5 * sh).fill({ color: 0x0f2d28, alpha: 0.3 });

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
    // body: two tones to fake the gradient
    g.ellipse(0, -13.5, 11.5, 13.5).fill(T.body);
    g.ellipse(-1.5, -17, 9.5, 9).fill({ color: T.bodyLight, alpha: 0.55 });
    g.ellipse(a.face * 1.2, -7.5, 6.5, 5.5).fill({ color: T.belly, alpha: 0.92 });
    // cheeks
    g.ellipse(-8 + a.face * 1.5, -11, 2.4, 1.5).fill({ color: T.cheek, alpha: 0.45 });
    g.ellipse(8 + a.face * 1.5, -11, 2.4, 1.5).fill({ color: T.cheek, alpha: 0.45 });
    // ears flap while walking
    const flap = a.moving ? Math.sin(t * 14) * 0.25 : 0;
    g.ellipse(-9, -23 + flap * 6, 3.2, 5).fill(T.ear);
    g.ellipse(9, -23 - flap * 6, 3.2, 5).fill(T.ear);

    // eyes
    const ex = a.face * 1.8, ey = -16;
    const blink = !this.reducedMotion && (t % 3.3) < 0.13 && a.mood !== "happy";
    for (const s of [-1, 1] as const) {
      const x = ex + s * 4.6;
      if (a.mood === "happy") { g.arc(x, ey + 1.5, 2.8, Math.PI * 1.1, Math.PI * 1.9).stroke({ width: 1.6, color: T.ink, cap: "round" }); continue; }
      if (blink) { g.moveTo(x - 2.6, ey).lineTo(x + 2.6, ey).stroke({ width: 1.6, color: T.ink, cap: "round" }); continue; }
      const ry = a.mood === "focused" ? 3 : 4.3;
      g.ellipse(x, ey, 3.4, ry).fill(0xffffff);
      let px = a.face * 1.1, py = a.look === "up" ? -1.6 : a.look === "down" ? 1.4 : 0.3;
      if (a.mood === "lost") { px = Math.sin(t * 3) * 1.4; py = -1.2; }
      g.ellipse(x + px, ey + py, 1.9, a.mood === "focused" ? 1.8 : 2.2).fill(T.ink);
      g.ellipse(x + px + 0.7, ey + py - 0.8, 0.6, 0.6).fill(0xffffff);
      if (a.mood === "lost") g.moveTo(x - 3, ey - 5.6 - (s > 0 ? 0 : 1.3)).lineTo(x + 3, ey - 5.6 - (s > 0 ? 1.3 : 0)).stroke({ width: 1.6, color: T.ink, cap: "round" });
      if (a.mood === "focused") g.moveTo(x - 3.2, ey - 3.7 - (s > 0 ? 1 : 0)).lineTo(x + 3.2, ey - 3.7 - (s > 0 ? 0 : 1)).stroke({ width: 1.6, color: T.ink, cap: "round" });
      if (a.mood === "uneasy") g.moveTo(x - 3, ey - 5).lineTo(x + 3, ey - 6 + (s > 0 ? 1.5 : -1.5)).stroke({ width: 1.4, color: T.ink, cap: "round" });
    }
    // mouth
    if (a.mood === "happy") g.arc(ex, -10.5, 3.2, 0, Math.PI).fill(0x7a2e22);
    else if (a.mood === "lost" || a.mood === "uneasy") g.arc(ex, -8.4, 2.2, Math.PI * 1.15, Math.PI * 1.85).stroke({ width: 1.6, color: T.ink, cap: "round" });
    else g.arc(ex, -11.2, 1.9, Math.PI * 0.15, Math.PI * 0.85).stroke({ width: 1.6, color: T.ink, cap: "round" });

    // antenna with mood-coloured bulb and glow
    const sway = (this.reducedMotion ? 0 : Math.sin(t * 5) * 2) - a.lean * 10;
    g.moveTo(0, -26.5).quadraticCurveTo(sway * 0.5, -32, sway + 1.5, -36).stroke({ width: 1.4, color: T.ear });
    const bc = this.theme.mood[a.mood];
    g.circle(sway + 1.5, -37, 9).fill({ color: bc, alpha: 0.28 });
    g.circle(sway + 1.5, -37, 5.5).fill({ color: bc, alpha: 0.35 });
    g.circle(sway + 1.5, -37, 2.8).fill(bc);

    // hiding something: a nervous sideways glance, slightly hunched
    if (a.hiding > 0) {
      const k = bump((t * 0.5) % 1) * a.hiding;
      g.rotation = a.lean + k * 0.06;
    }
  }
}
