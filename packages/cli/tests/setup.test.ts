import { describe, expect, it } from "vitest";
import { mergeJson, mergeToml, targets } from "../src/setup.js";
describe("init merges", () => {
  it("adds our entry to an existing JSON config without touching the rest", () => {
    const { next, changed } = mergeJson('{"mcpServers":{"other":{"command":"x"}},"theme":"dark"}', "mcpServers");
    expect(changed).toBe(true); const j = JSON.parse(next); expect(j.theme).toBe("dark"); expect(j.mcpServers.other.command).toBe("x"); expect(j.mcpServers["agent-theatre"].args).toContain("serve");
  });
  it("is idempotent", () => { const a = mergeJson(null, "servers"); expect(mergeJson(a.next, "servers").changed).toBe(false); });
  it("refuses invalid JSON", () => { expect(() => mergeJson("{nope", "mcpServers")).toThrow(); });
  it("appends a TOML block once", () => { const a = mergeToml("[x]\ny = 1\n"); expect(a.next).toContain("[mcp_servers.agent-theatre]"); expect(mergeToml(a.next).changed).toBe(false); });
  it("covers the agents we promise", () => { expect(targets("user", "/r").map((t) => t.agent)).toEqual(["Claude Code", "Claude Desktop", "Cursor", "Windsurf", "Codex", "Gemini CLI"]); expect(targets("repo", "/r").map((t) => t.file)).toEqual(["/r/.mcp.json", "/r/.cursor/mcp.json", "/r/.vscode/mcp.json"]); });
});
