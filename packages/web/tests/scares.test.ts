import { describe, expect, it } from "vitest";
import { Scares, SCARE_KINDS, type ScareKind } from "../src/scene/scares.js";

// a fixed sequence instead of Math.random, so timing is exact
const seq = (...xs: number[]) => { let i = 0; return () => xs[i++ % xs.length]!; };
const run = (s: Scares, ms: number, step = 50) => { for (let t = 0; t < ms; t += step) s.update(step, 800, 450); };

describe("Halloween jump scares", () => {
  it("wait a while before the first one, then come roughly once a minute", () => {
    const s = new Scares(null, false, () => {}, seq(0.5));
    expect(s.dueIn).toBe(30000);
    run(s, 29000); expect(s.current).toBeNull();
    run(s, 1100); expect(s.current).not.toBeNull();
    // after one, the next is 45–90 s away
    expect(s.dueIn).toBeGreaterThan(45000); expect(s.dueIn).toBeLessThan(95000);
  });
  it("each scare ends by itself, jolts the camera once, and the same kind never plays twice in a row", () => {
    const peaks: ScareKind[] = [];
    const s = new Scares(null, false, (k) => peaks.push(k));
    let prev: ScareKind | null = null;
    for (let i = 0; i < 12; i++) {
      const k = s.trigger()!;
      expect(SCARE_KINDS).toContain(k);
      if (prev) expect(k).not.toBe(prev);
      prev = k;
      run(s, 2500);
      expect(s.current).toBeNull();
    }
    expect(peaks).toHaveLength(12);
  });
  it("never happen under reduced motion", () => {
    const s = new Scares(null, true, () => {}, seq(0));
    expect(s.trigger("ghost")).toBeNull();
    run(s, 200000); expect(s.current).toBeNull();
  });
  it("the toggle stops one mid-scare and keeps them off", () => {
    const s = new Scares(null, false);
    s.trigger("pumpkin"); run(s, 300); expect(s.current).toBe("pumpkin");
    s.enabled = false; expect(s.current).toBeNull();
    expect(s.trigger()).toBeNull(); run(s, 200000); expect(s.current).toBeNull();
    s.enabled = true; expect(s.trigger("bats")).toBe("bats");
  });
  it("time never runs backwards (a seek's negative delta is ignored)", () => {
    const s = new Scares(null, false, () => {}, seq(0.5));
    const due = s.dueIn; s.update(-5000, 800, 450); s.update(Number.NaN, 800, 450);
    expect(s.dueIn).toBe(due);
  });
});
