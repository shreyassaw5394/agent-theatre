import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { HOOK_SCRIPT } from "../src/hooks/script.js";
import { HOOK_EVENTS } from "../src/hooks/patch.js";

const root = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));

describe("Claude Code plugin", () => {
  it("ships the same hook script the CLI installs", () => {
    expect(readFileSync(root("hooks-plugin/agent-theatre-hook.mjs"), "utf8")).toBe(HOOK_SCRIPT);
  });
  it("hooks.json covers every event the CLI installs, with the plugin-root path", () => {
    const j = JSON.parse(readFileSync(root("hooks-plugin/hooks.json"), "utf8")) as { hooks: Record<string, Array<{ hooks: Array<{ command: string; timeout: number }> }>> };
    for (const { event } of HOOK_EVENTS) { expect(Object.keys(j.hooks), event).toContain(event); expect(j.hooks[event]![0]!.hooks[0]!.command).toContain("${CLAUDE_PLUGIN_ROOT}/hooks-plugin/agent-theatre-hook.mjs"); }
  });
  it("plugin and marketplace manifests agree on name and version with the CLI package", () => {
    const pkg = JSON.parse(readFileSync(root("packages/cli/package.json"), "utf8")) as { version: string };
    const plugin = JSON.parse(readFileSync(root(".claude-plugin/plugin.json"), "utf8")) as { name: string; version: string };
    const mp = JSON.parse(readFileSync(root(".claude-plugin/marketplace.json"), "utf8")) as { plugins: Array<{ name: string; version: string }> };
    expect(plugin.name).toBe("agent-theatre"); expect(plugin.version).toBe(pkg.version); expect(mp.plugins[0]!.version).toBe(pkg.version);
  });
});
