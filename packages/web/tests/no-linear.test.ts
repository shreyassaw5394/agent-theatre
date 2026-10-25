import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Motion bar: no linear tween anywhere. Easing lives in render/ease.ts only.
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
describe("motion", () => {
  it("no linear easing in scene or render code", () => {
    const src = new URL("../src", import.meta.url).pathname;
    const offenders = walk(src).filter((f) => /\.ts$/.test(f) && !f.endsWith("ease.ts") && /\b(linear|easeLinear)\b/.test(readFileSync(f, "utf8").replace(/\/\/.*$/gm, "")));
    expect(offenders).toEqual([]);
  });
});
