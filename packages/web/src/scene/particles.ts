import { Graphics } from "pixi.js";

interface P { x: number; y: number; vx: number; vy: number; life: number; max: number; c: number; r: number }

/** Pooled confetti/sparks/dust. One Graphics, redrawn per frame; cheap at a few hundred. */
export class Particles {
  readonly g = new Graphics();
  private parts: P[] = [];
  constructor(private reducedMotion: boolean) {}
  burst(x: number, y: number, n: number, colors: number[], speed: number, lift = 0): void {
    if (this.reducedMotion) n = Math.ceil(n / 4);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.8);
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - lift * (0.5 + Math.random()), life: 0, max: 0.7 + Math.random() * 0.8, c: colors[i % colors.length]!, r: 1.4 + Math.random() * 2.4 });
    }
  }
  clear(): void { this.parts = []; this.g.clear(); }
  get count(): number { return this.parts.length; }
  update(dtMs: number): void {
    const dt = dtMs / 1000;
    this.parts = this.parts.filter((p) => (p.life += dt) < p.max);
    this.g.clear();
    for (const p of this.parts) {
      p.vy += 140 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      this.g.rect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r * 1.3).fill({ color: p.c, alpha: 1 - p.life / p.max });
    }
  }
}
