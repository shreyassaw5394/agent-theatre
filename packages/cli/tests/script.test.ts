import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HOOK_SCRIPT } from "../src/hooks/script.js";

describe("hook script", () => {
  const shipped = readFileSync(new URL("../hooks/agent-theatre-hook.mjs", import.meta.url), "utf8");
  it("shipped file is byte-identical to the source constant", () => { expect(shipped).toBe(HOOK_SCRIPT); });
  it("never blocks: no stdout writes, no decision field, hard timeouts, exits 0 on every path", () => {
    expect(HOOK_SCRIPT).not.toMatch(/stdout\.write|console\.log|"decision"/);
    expect(HOOK_SCRIPT).toMatch(/AbortSignal\.timeout\(300\)/);
    expect(HOOK_SCRIPT).toMatch(/setTimeout\(\(\) => process\.exit\(0\), 600\)/);
    expect(HOOK_SCRIPT).not.toMatch(/process\.exit\([1-9]/);
    expect(HOOK_SCRIPT).not.toMatch(/\bimport .* from "(?!node:)/); // no third-party imports
  });
});
