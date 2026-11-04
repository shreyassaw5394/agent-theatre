import { describe, expect, it } from "vitest";
import { slotOffset } from "../src/scene/slots.js";

describe("standing slots", () => {
  it("the first actor stays on the spot", () => {
    for (const n of [1, 2, 5, 9]) expect(slotOffset(0, n)).toEqual({ dx: 0, dy: 0 });
  });
  it("nine actors on one spot all stand somewhere different", () => {
    const seen = new Set(Array.from({ length: 9 }, (_, i) => { const o = slotOffset(i, 9); return `${o.dx},${o.dy}`; }));
    expect(seen.size).toBe(9);
  });
  it("is deterministic", () => {
    for (let i = 0; i < 9; i++) expect(slotOffset(i, 9)).toEqual(slotOffset(i, 9));
  });
});
