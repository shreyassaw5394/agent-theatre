import type { Container } from "pixi.js";
import { easeOut } from "./ease.js";
import { lerp } from "./iso.js";

/**
 * Eased camera: follows a target with lag, pushes in on moments, drifts a few
 * pixels in `lost`. Never moves without a reason given by the player.
 */
export class Camera {
  private cx = 0; private cy = 0; private zoom = 1;
  private tx = 0; private ty = 0; private tz = 1;
  private punch = 0; private shakeT = 0; private drift = 0;
  private t = 0;
  constructor(private readonly stage: Container, private reducedMotion: boolean) {}
  /** Fit a world box (in world px) into the viewport. */
  fit(w: number, h: number, viewW: number, viewH: number, pad = 1.08): void {
    this.tz = Math.min(viewW / (w * pad), viewH / (h * pad));
  }
  follow(x: number, y: number, weight = 1): void { this.tx = lerp(this.tx, x, weight); this.ty = lerp(this.ty, y, weight); }
  setZoomFactor(f: number): void { this.tz = f; }
  pushIn(amount = 0.08): void { if (!this.reducedMotion) this.punch = Math.max(this.punch, amount); }
  shake(ms = 220): void { if (!this.reducedMotion) this.shakeT = ms / 1000; }
  setDrift(on: boolean): void { this.drift = this.reducedMotion ? 0 : on ? 1 : 0; }
  snap(): void { this.cx = this.tx; this.cy = this.ty; this.zoom = this.tz; }
  update(dtMs: number, viewW: number, viewH: number): void {
    const dt = Math.min(0.05, dtMs / 1000);
    this.t += dt;
    const k = 1 - Math.pow(0.001, dt); // exponential ease toward target, frame-rate independent
    this.cx += (this.tx - this.cx) * k * 0.9;
    this.cy += (this.ty - this.cy) * k * 0.9;
    this.punch = Math.max(0, this.punch - dt * 0.12);
    this.zoom += (this.tz * (1 + easeOut(this.punch / 0.08) * this.punch) - this.zoom) * k;
    let ox = 0, oy = 0;
    if (this.shakeT > 0) { this.shakeT -= dt; const a = this.shakeT * 18; ox = Math.sin(this.t * 60) * a; oy = Math.cos(this.t * 47) * a; }
    if (this.drift) { ox += Math.sin(this.t * 0.7) * 2.2; oy += Math.cos(this.t * 0.5) * 1.6; }
    this.stage.scale.set(this.zoom);
    this.stage.position.set(viewW / 2 - (this.cx + ox) * this.zoom, viewH / 2 - (this.cy + oy) * this.zoom);
  }
  toScreen(x: number, y: number): { x: number; y: number } {
    return { x: this.stage.position.x + x * this.zoom, y: this.stage.position.y + y * this.zoom };
  }
  get scale(): number { return this.zoom; }
}
