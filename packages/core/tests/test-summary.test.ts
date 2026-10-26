import { describe, expect, it } from "vitest";
import { parseTestSummary } from "../src/adapters/test-summary.js";

describe("parseTestSummary", () => {
  it("vitest", () => {
    expect(parseTestSummary("      Tests  24 passed (24)\n")).toEqual({ failed: 0, passed: 24, framework: "vitest" });
    expect(parseTestSummary("      Tests  2 failed | 22 passed (24)\n")).toEqual({ failed: 2, passed: 22, framework: "vitest" });
    expect(parseTestSummary("      Tests  1 failed | 5 passed | 2 skipped (8)\n")).toEqual({ failed: 1, passed: 5, skipped: 2, framework: "vitest" });
  });
  it("jest", () => {
    expect(parseTestSummary("Tests:       2 failed, 22 passed, 24 total\n")).toEqual({ failed: 2, passed: 22, framework: "jest" });
    expect(parseTestSummary("Tests:       10 passed, 10 total\n")).toEqual({ failed: 0, passed: 10, framework: "jest" });
    expect(parseTestSummary("Tests:       1 skipped, 9 passed, 10 total\n")).toEqual({ failed: 0, passed: 9, skipped: 1, framework: "jest" });
  });
  it("pytest", () => {
    expect(parseTestSummary("===== 2 failed, 22 passed, 1 skipped in 1.23s =====")).toEqual({ failed: 2, passed: 22, skipped: 1, framework: "pytest" });
    expect(parseTestSummary("===== 24 passed in 0.50s =====")).toEqual({ failed: 0, passed: 24, framework: "pytest" });
    expect(parseTestSummary("===== 3 passed, 2 warnings in 0.50s =====")).toEqual({ failed: 0, passed: 3, framework: "pytest" });
  });
  it("go", () => {
    expect(parseTestSummary("--- PASS: TestA (0.00s)\n--- FAIL: TestB (0.01s)\nFAIL\nFAIL\tpkg\t0.012s\n")).toEqual({ failed: 1, passed: 1, framework: "go" });
    expect(parseTestSummary("ok  \tgithub.com/x/y\t0.123s\n")).toEqual({ failed: 0, passed: 1, framework: "go" });
  });
  it("cargo", () => {
    expect(parseTestSummary("test result: ok. 24 passed; 0 failed; 1 ignored; 0 measured")).toEqual({ passed: 24, failed: 0, skipped: 1, framework: "cargo" });
  });
  it("mocha and playwright", () => {
    expect(parseTestSummary("\n  24 passing (1s)\n  2 failing\n")).toEqual({ passed: 24, failed: 2, framework: "mocha" });
    expect(parseTestSummary("  24 passed (12.3s)\n")).toEqual({ passed: 24, failed: 0, framework: "playwright" });
  });
  it("unknown output → null", () => {
    expect(parseTestSummary("Initialized empty Git repository")).toBeNull();
    expect(parseTestSummary("")).toBeNull();
  });
});

import { parseTestSummary as pts } from "../src/adapters/test-summary.js";
describe("failures without a summary line", () => {
  it("counts × lines and 'Failed Tests N' when the output was cut by a pipe", () => {
    expect(pts("   × quiet heartbeat > broadcasts how long since the last event 6ms\n⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯\n")).toEqual({ passed: 0, failed: 1, framework: "markers" });
    expect(pts(" × a\n × b\n")).toMatchObject({ failed: 2 });
    expect(pts("AssertionError: expected false to be true")).toMatchObject({ failed: 1 });
  });
  it("never infers a pass from markers alone", () => { expect(pts("  ✓ a\n  ✓ b\n")).toBeNull(); });
});
