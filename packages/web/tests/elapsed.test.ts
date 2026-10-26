import { describe, expect, it } from "vitest";
import { ENDED_REST_MS, elapsed } from "../src/ui/panel.js";

describe("elapsed", () => {
  it("reads like a person says it, at every scale", () => {
    expect(elapsed(12_000)).toBe("12 s");
    expect(elapsed(184_000)).toBe("3 min 4 s");
    expect(elapsed(2 * 3_600_000 + 14 * 60_000)).toBe("2 h 14 min");
    expect(elapsed(3 * 86_400_000 + 2 * 3_600_000)).toBe("3 d 2 h");
  });
  it("rests an ended session after five minutes", () => { expect(ENDED_REST_MS).toBe(300_000); });
});
