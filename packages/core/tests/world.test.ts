import { describe, expect, it } from "vitest";
import { generateWorld } from "../src/world/generate.js";
import { worldToAscii } from "../src/world/ascii.js";
import type { FileNode, Place } from "../src/world/types.js";

const synth = (n: number): FileNode[] => {
  const dirs = ["src", "src/api", "src/auth", "lib", "docs", "tests", "db"];
  const out: FileNode[] = [];
  for (let i = 0; i < n; i++) {
    const d = dirs[i % dirs.length]!;
    const isTest = d === "tests" || i % 11 === 0;
    const name = isTest ? `t${i}.test.ts` : d === "db" ? `m${i}.sql` : `f${i}.ts`;
    out.push({ path: `${d}/${name}`, loc: ((i * 7919) % 900) + 5, churn: i % 13 });
  }
  out.push({ path: "README.md", loc: 40 }, { path: "package.json", loc: 30 });
  return out;
};
const overlapping = (places: Place[]) => {
  const seen = new Set<string>();
  for (const p of places) for (let dx = 0; dx < p.footprint; dx++) for (let dy = 0; dy < p.footprint; dy++) {
    const k = `${p.gx + dx},${p.gy + dy}`;
    if (seen.has(k)) return k;
    seen.add(k);
  }
  return null;
};

describe("generateWorld", () => {
  it("is deterministic: same repo + files → identical world", () => {
    const files = synth(300);
    const a = generateWorld({ repoId: "github.com/acme/shop", files, touched: ["src/api/f1.ts"] });
    const b = generateWorld({ repoId: "github.com/acme/shop", files: [...files].reverse(), touched: ["src/api/f1.ts"] });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = generateWorld({ repoId: "github.com/acme/other", files });
    expect(JSON.stringify(c)).not.toBe(JSON.stringify(a));
  });
  it("caps buildings at ~60 and beacons at 8, always has forge + dock", () => {
    const w = generateWorld({ repoId: "r", files: synth(1000) });
    const kinds = w.places.map((p) => p.kind);
    expect(kinds.filter((k) => k === "building" || k === "archive").length).toBeLessThanOrEqual(60);
    expect(kinds.filter((k) => k === "beacon").length).toBeLessThanOrEqual(8);
    expect(kinds).toContain("forge");
    expect(kinds).toContain("dock");
    expect(w.stats.capped).toBe(true);
  });
  it("force-includes every touched file even below the cap", () => {
    const files = synth(1000);
    const tiny = { path: "lib/tiny.ts", loc: 1 };
    files.push(tiny);
    const w = generateWorld({ repoId: "r", files, touched: ["lib/tiny.ts", "src/api/f1.ts"] });
    const ids = w.places.map((p) => p.id);
    expect(ids).toContain("p:lib/tiny.ts");
    expect(w.places.find((p) => p.id === "p:lib/tiny.ts")?.touched).toBe(true);
  });
  it("classifies tests as beacons and schema/migrations as archives", () => {
    const w = generateWorld({ repoId: "r", files: synth(60) });
    expect(w.places.find((p) => p.path.startsWith("tests/"))?.kind).toBe("beacon");
    expect(w.places.find((p) => p.path.startsWith("db/"))?.kind).toBe("archive");
  });
  it("never overlaps footprints, keeps every place inside bounds, and the world stays compact", () => {
    for (const n of [5, 60, 400]) {
      const w = generateWorld({ repoId: `r${n}`, files: synth(n) });
      expect(overlapping(w.places), `n=${n}`).toBeNull();
      // ~60 buildings must fit a readable screen: no straight-line walks to nowhere
      expect(w.bounds.w, `width n=${n}`).toBeLessThanOrEqual(48);
      expect(w.bounds.h, `height n=${n}`).toBeLessThanOrEqual(48);
      for (const p of w.places) expect(Math.hypot(p.gx, p.gy), `${p.id} too far`).toBeLessThanOrEqual(26);
      for (const p of w.places) {
        expect(p.gx).toBeGreaterThanOrEqual(w.bounds.x);
        expect(p.gy).toBeGreaterThanOrEqual(w.bounds.y);
        expect(p.gx + p.footprint).toBeLessThanOrEqual(w.bounds.x + w.bounds.w);
        expect(p.gy + p.footprint).toBeLessThanOrEqual(w.bounds.y + w.bounds.h);
      }
    }
  });
  it("one district per top-level folder, root files in '/', each path ends at the hub", () => {
    const w = generateWorld({ repoId: "r", files: synth(60) });
    const labels = w.districts.map((d) => d.label).sort();
    expect(labels).toEqual(["/", "db/", "docs/", "lib/", "src/"]);
    for (const d of w.districts) expect(d.placeIds.length).toBeGreaterThan(0);
    for (const p of w.paths) expect(p.points.at(-1)).toEqual([0, 0]);
    expect(w.paths.map((p) => p.from)).toContain("dock");
  });
  it("ignores build output and dotfiles; empty repo still yields forge + dock", () => {
    const w = generateWorld({ repoId: "r", files: [{ path: "node_modules/x/index.js", loc: 999 }, { path: ".env", loc: 3 }, { path: "dist/a.js", loc: 500 }] });
    expect(w.places.map((p) => p.kind).sort()).toEqual(["dock", "forge"]);
    expect(w.stats.files).toBe(0);
  });
  it("renders an ascii plan with every place visible", () => {
    const w = generateWorld({ repoId: "r", files: synth(30), touched: ["src/f7.ts"] });
    const art = worldToAscii(w);
    expect(art).toMatch(/F/);
    expect(art).toMatch(/D/);
    expect(art).toMatch(/L/);
    expect(art).toMatch(/#/);
    expect(art.split("\n")).toHaveLength(w.bounds.h);
  });
});
