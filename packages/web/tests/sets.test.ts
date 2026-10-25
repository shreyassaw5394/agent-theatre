import { describe, expect, it } from "vitest";
import { SETS, suggestSets } from "../src/sets/index.js";

describe("sets catalog", () => {
  it("has a real catalog, three flagships, every set fits something, ids unique", () => {
    expect(SETS.length).toBeGreaterThanOrEqual(20);
    expect(SETS.filter((s) => s.flagship).map((s) => s.id)).toEqual(["island", "orbit", "metropolis"]);
    for (const s of SETS) expect(s.fits.length, s.id).toBeGreaterThan(0);
    expect(new Set(SETS.map((s) => s.id)).size).toBe(SETS.length);
  });
  it("suggests by project kind and is deterministic for a seed", () => {
    const web = suggestSets({ kinds: ["web-frontend"], languages: ["TypeScript"], files: 50 }, 7);
    expect(web.slice(0, 3).map((s) => s.id)).toContain("metropolis");
    const ml = suggestSets({ kinds: ["data-ml"], languages: ["Python"], files: 50 }, 7);
    expect(ml.slice(0, 3).map((s) => s.id).some((id) => ["observatory", "greenhouse", "canopy"].includes(id))).toBe(true);
    expect(["arcade", "lanterns", "volcano", "reef"]).toContain(suggestSets({ kinds: ["game"], languages: [], files: 1 }, 1)[0]?.id);
    expect(suggestSets(undefined, 3).map((s) => s.id)).toEqual(suggestSets(undefined, 3).map((s) => s.id));
    expect(suggestSets({ kinds: ["unknown"], languages: [], files: 0 }, 3).length).toBeGreaterThanOrEqual(3);
  });
});
