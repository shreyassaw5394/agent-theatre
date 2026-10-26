import { describe, expect, it } from "vitest";
import { noteOf } from "../src/adapters/hook.js";
describe("closing note", () => {
  it("prefers the agent's question", () => {
    expect(noteOf("I looked at both files.\n\nTwo options here: A or B. Which endpoint should I wire the new field into: /browse/answer or /browse/stream?").note).toBe("Which endpoint should I wire the new field into: /browse/answer or /browse/stream?");
  });
  it("otherwise the first sentence or two of the wrap-up, markdown stripped", () => {
    expect(noteOf("**Done.** Added `MAX_SOURCES` to [constants](x). All 12 tests pass.\n\n- a\n- b").note).toBe("Done. Added MAX_SOURCES to constants. All 12 tests pass.");
  });
  it("never ends on a cut-off fragment", () => {
    const n = noteOf("Here is a very long explanation " + "of many things that go on and on ".repeat(20) + "and it ends here.").note!;
    expect(n.length).toBeLessThanOrEqual(200); expect(n.endsWith("…") || /[.!?]$/.test(n)).toBe(true);
  });
  it("empty in, nothing out", () => { expect(noteOf("")).toEqual({}); expect(noteOf(undefined)).toEqual({}); });
});
