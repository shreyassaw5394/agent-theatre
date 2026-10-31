import { describe, expect, it } from "vitest";
import { SETS, inSeason, setById, suggestSets } from "../src/sets/index.js";

const JUNE = new Date(2026, 5, 1), HALLOWEEN = new Date(2026, 9, 31);

describe("sets catalog", () => {
  it("has a real catalog, three flagships, every set fits something, ids unique", () => {
    expect(SETS.length).toBeGreaterThanOrEqual(20);
    expect(SETS.filter((s) => s.flagship).map((s) => s.id)).toEqual(["island", "orbit", "metropolis"]);
    for (const s of SETS) expect(s.fits.length, s.id).toBeGreaterThan(0);
    expect(new Set(SETS.map((s) => s.id)).size).toBe(SETS.length);
  });
  it("suggests by project kind and is deterministic for a seed", () => {
    const web = suggestSets({ kinds: ["web-frontend"], languages: ["TypeScript"], files: 50 }, 7, JUNE);
    expect(web.slice(0, 3).map((s) => s.id)).toContain("metropolis");
    const ml = suggestSets({ kinds: ["data-ml"], languages: ["Python"], files: 50 }, 7, JUNE);
    expect(ml.slice(0, 3).map((s) => s.id).some((id) => ["observatory", "greenhouse", "canopy"].includes(id))).toBe(true);
    expect(["arcade", "lanterns", "volcano", "reef"]).toContain(suggestSets({ kinds: ["game"], languages: [], files: 1 }, 1, JUNE)[0]?.id);
    expect(suggestSets(undefined, 3, JUNE).map((s) => s.id)).toEqual(suggestSets(undefined, 3, JUNE).map((s) => s.id));
    expect(suggestSets({ kinds: ["unknown"], languages: [], files: 0 }, 3, JUNE).length).toBeGreaterThanOrEqual(3);
  });
});

describe("seasonal stages", () => {
  const h = setById("halloween");
  it("Halloween is a real set with its own props, bats and a ghost-white gremlin", () => {
    expect(h.id).toBe("halloween");
    expect(h.prop).toBe("pumpkin");
    expect(h.ambient).toBe("bats");
    expect(h.flagship).toBe(false);
  });
  it("is in season from 17 October to 2 November, inclusive", () => {
    expect(inSeason(h, new Date(2026, 9, 16))).toBe(false);
    expect(inSeason(h, new Date(2026, 9, 17))).toBe(true);
    expect(inSeason(h, HALLOWEEN)).toBe(true);
    expect(inSeason(h, new Date(2026, 10, 2, 23, 59))).toBe(true);
    expect(inSeason(h, new Date(2026, 10, 3))).toBe(false);
  });
  it("leads the suggestions in season for any repo, and is never suggested out of season", () => {
    for (const kinds of [["backend-api"], ["data-ml"], ["unknown"]] as const) {
      expect(suggestSets({ kinds: [...kinds], languages: [], files: 9 }, 4, HALLOWEEN)[0]?.id).toBe("halloween");
      expect(suggestSets({ kinds: [...kinds], languages: [], files: 9 }, 4, JUNE).map((s) => s.id)).not.toContain("halloween");
    }
    // the rest of the order is unchanged by the season
    const off = suggestSets(undefined, 9, JUNE).map((s) => s.id), on = suggestSets(undefined, 9, HALLOWEEN).map((s) => s.id);
    expect(on.slice(1)).toEqual(off);
  });
});

import { ARCHITECTURE } from "../src/sets/architecture.js";
describe("architecture", () => {
  it("every set has a silhouette and at least five rooflines are in use", () => {
    for (const s of SETS) expect(ARCHITECTURE[s.id], s.id).toBeTruthy();
    expect(new Set(SETS.map((s) => ARCHITECTURE[s.id].roof)).size).toBeGreaterThanOrEqual(5);
  });
});
