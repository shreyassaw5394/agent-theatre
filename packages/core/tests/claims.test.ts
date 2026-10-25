import { describe, expect, it } from "vitest";
import { claimsSuccess } from "../src/director/claims.js";

describe("claimsSuccess", () => {
  it("recognises conservative success claims", () => {
    expect(claimsSuccess("Fixed the refresh window. All 24 tests pass.")).toBe(true);
    expect(claimsSuccess("Done.")).toBe(true);
    expect(claimsSuccess("Refactored the handler ✅")).toBe(true);
    expect(claimsSuccess("It should now work as expected.")).toBe(true);
  });
  it("hedges override claims", () => {
    expect(claimsSuccess("I've made the change but haven't run the tests yet. Done.")).toBe(false);
    expect(claimsSuccess("Two tests still fail; the fix is complete otherwise.")).toBe(false);
    expect(claimsSuccess("Couldn't reproduce it. Done for now.")).toBe(false);
  });
  it("empty / neutral text is not a claim", () => {
    expect(claimsSuccess("")).toBe(false);
    expect(claimsSuccess(undefined)).toBe(false);
    expect(claimsSuccess("Here is what the file contains.")).toBe(false);
  });
  it("only the tail counts", () => {
    expect(claimsSuccess("Done.".padEnd(2000, " ") + "Now let me look at the next problem")).toBe(false);
  });
});
