import { describe, expect, it } from "vitest";
import { hasOurHooks, HOOK_EVENTS, patchSettings, unpatchSettings } from "../src/hooks/patch.js";

const SCRIPT = "/Users/dev/.agent-theatre/hooks/agent-theatre-hook.mjs";
const existing = JSON.stringify({
  permissions: { allow: ["Bash(pip install:*)"] },
  model: "claude-opus-5",
  hooks: {
    SessionStart: [{ hooks: [{ type: "command", command: 'node "/x/gsd.js"' }] }],
    PostToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: 'node "/x/debuganything-hook.mjs"', timeout: 10 }] }],
  },
}, null, 2);

describe("patchSettings", () => {
  it("adds one group per event, keeps everything else, and is idempotent", () => {
    const a = patchSettings(existing, SCRIPT);
    expect(a.changed).toBe(true);
    const obj = JSON.parse(a.next);
    expect(obj.permissions.allow).toEqual(["Bash(pip install:*)"]);
    expect(obj.model).toBe("claude-opus-5");
    expect(obj.hooks.SessionStart).toHaveLength(2);
    expect(obj.hooks.PostToolUse).toHaveLength(2);
    expect(obj.hooks.PostToolUse[0].matcher).toBe("Bash");
    for (const { event } of HOOK_EVENTS) expect(obj.hooks[event].some((g: any) => g.hooks[0].command === `node "${SCRIPT}"` && g.hooks[0].timeout === 5), event).toBe(true);
    const b = patchSettings(a.next, SCRIPT);
    expect(b.changed).toBe(false);
    expect(b.next).toBe(a.next);
  });
  it("updates our command path on reinstall elsewhere, without duplicating", () => {
    const a = patchSettings(existing, SCRIPT);
    const b = patchSettings(a.next, "/new/place/agent-theatre-hook.mjs");
    expect(b.changed).toBe(true);
    const obj = JSON.parse(b.next);
    expect(obj.hooks.Stop).toHaveLength(1);
    expect(obj.hooks.Stop[0].hooks[0].command).toBe('node "/new/place/agent-theatre-hook.mjs"');
  });
  it("handles a missing or empty file, and refuses invalid JSON", () => {
    expect(JSON.parse(patchSettings(null, SCRIPT).next).hooks.Stop).toHaveLength(1);
    expect(JSON.parse(patchSettings("  \n", SCRIPT).next).hooks.SessionEnd).toHaveLength(1);
    expect(() => patchSettings("{ not json", SCRIPT)).toThrow(/not valid JSON/);
    expect(() => patchSettings("[1,2]", SCRIPT)).toThrow(/not valid JSON/);
  });
});

describe("unpatchSettings", () => {
  it("removes only our groups and restores the original shape", () => {
    const patched = patchSettings(existing, SCRIPT).next;
    expect(hasOurHooks(patched)).toBe(true);
    const u = unpatchSettings(patched);
    expect(u.changed).toBe(true);
    expect(JSON.parse(u.next)).toEqual(JSON.parse(existing));
    expect(hasOurHooks(u.next)).toBe(false);
    expect(unpatchSettings(u.next).changed).toBe(false);
  });
  it("drops the hooks key entirely when nothing else is left", () => {
    const only = patchSettings("{}", SCRIPT).next;
    expect(JSON.parse(unpatchSettings(only).next)).toEqual({});
  });
});
