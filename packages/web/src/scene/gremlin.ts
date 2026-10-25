import { Container, Graphics } from "pixi.js";
import type { SetTheme } from "../sets/types.js";

export class Gremlin {
  readonly container = new Container();
  private readonly g = new Graphics();
  private t = Math.random() * 10;
  x = 0; y = 0; scale = 1; alpha = 1; lift = 0;
  /** 0 = calm bounce, 1 = fleeing. */
  panic = 0;
  /** When hiding behind Pip: peek amount 0..1. */
  peek = 0;
  constructor(public readonly id: string, private theme: SetTheme, private reducedMotion: boolean) { this.container.addChild(this.g); }
  update(dtMs: number): void {
    this.t += dtMs / 1000;
    const t = this.t, g = this.g, C = this.theme.gremlin;
    const bounce = this.reducedMotion ? 0 : Math.abs(Math.sin(t * (7 + this.panic * 5))) * (6 + this.panic * 3);
    this.container.position.set(this.x, this.y);
    this.container.alpha = this.alpha;
    g.clear();
    g.ellipse(0, 0, 7 * this.scale, 3 * this.scale).fill({ color: 0x0f2d28, alpha: 0.25 });
    g.position.set(0, 0);
    const s = this.scale;
    // spiky body
    const n = 9, pts: number[] = [];
    for (let i = 0; i <= n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2;
      const r = (i % 2 ? 7.2 : 9.6 + Math.sin(t * 20 + i) * 0.7) * s;
      pts.push(Math.cos(a) * r, -9 * s - bounce - this.lift + Math.sin(a) * r * 0.9);
    }
    g.poly(pts).fill(C.body);
    const ey = -10 * s - bounce - this.lift;
    g.ellipse(-3 * s, ey, 2.4 * s, 2.6 * s).fill(0xffffff);
    g.ellipse(3 * s, ey, 2.4 * s, 2.6 * s).fill(0xffffff);
    const look = this.panic ? Math.sin(t * 9) * 0.8 : 0.4;
    g.ellipse(-2.6 * s + look, ey + 0.4, 1.2 * s, 1.3 * s).fill(C.eye);
    g.ellipse(3.4 * s + look, ey + 0.4, 1.2 * s, 1.3 * s).fill(C.eye);
    // angry brows + jagged mouth
    g.moveTo(-5.5 * s, ey - 4).lineTo(-1.2 * s, ey - 2.4).moveTo(5.5 * s, ey - 4).lineTo(1.2 * s, ey - 2.4).stroke({ width: 1.3, color: C.eye, cap: "round" });
    g.moveTo(-2.6 * s, ey + 4.4).lineTo(-1.2 * s, ey + 3.4).lineTo(0.2 * s, ey + 4.4).lineTo(1.6 * s, ey + 3.4).lineTo(2.9 * s, ey + 4.4).stroke({ width: 1.3, color: C.eye, cap: "round" });
  }
}
