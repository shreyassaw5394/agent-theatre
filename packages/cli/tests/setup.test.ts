import { describe, expect, it } from "vitest";
import { VERSION, mergeJson, mergeToml, targets } from "../src/setup.js";
describe("init merges", () => {
  it("adds our entry to an existing JSON config without touching the rest", () => {
    const { next, changed } = mergeJson('{"mcpServers":{"other":{"command":"x"}},"theme":"dark"}', "mcpServers");
    expect(changed).toBe(true); const j = JSON.parse(next); expect(j.theme).toBe("dark"); expect(j.mcpServers.other.command).toBe("x"); expect(j.mcpServers["agent-theatre"].args).toContain("serve");
  });
  it("is idempotent", () => { const a = mergeJson(null, "servers"); expect(mergeJson(a.next, "servers").changed).toBe(false); });
  it("refuses invalid JSON", () => { expect(() => mergeJson("{nope", "mcpServers")).toThrow(); });
  it("appends a TOML block once", () => { const a = mergeToml("[x]\ny = 1\n"); expect(a.next).toContain("[mcp_servers.agent-theatre]"); expect(mergeToml(a.next).changed).toBe(false); });
  it("pins this exact version, and re-running init moves the pin", () => {
    const pin = `agent-theatre@${VERSION}`;
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    const j = mergeJson('{"mcpServers":{"agent-theatre":{"command":"npx","args":["-y","agent-theatre@latest","serve"]}}}', "mcpServers");
    expect(j.changed).toBe(true); expect(JSON.parse(j.next).mcpServers["agent-theatre"].args).toEqual(["-y", pin, "serve"]);
    const old = '[x]\ny = 1\n\n[mcp_servers.agent-theatre]\ncommand = "npx"\nargs = ["-y", "agent-theatre@latest", "serve"]\n\n[other]\nargs = ["keep"]\n';
    const t = mergeToml(old);
    expect(t.changed).toBe(true); expect(t.next).toContain(`args = ["-y", "${pin}", "serve"]`); expect(t.next).toContain('[other]\nargs = ["keep"]'); expect(t.next).not.toContain("@latest");
    expect(mergeToml(t.next).changed).toBe(false);
  });
  it("covers the agents we promise", () => { expect(targets("user", "/r").map((t) => t.agent)).toEqual(["Claude Code", "Claude Desktop", "Cursor", "Windsurf", "Codex", "Gemini CLI"]); expect(targets("repo", "/r").map((t) => t.file.split(/[\\/]/).filter(Boolean).join("/"))).toEqual(["r/.mcp.json", "r/.cursor/mcp.json", "r/.vscode/mcp.json"]); });
});
