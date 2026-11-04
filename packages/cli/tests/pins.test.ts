import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));
const FILES = [".claude-plugin/plugin.json", "commands/theatre.md", "skills/agent-theatre/SKILL.md", "README.md", "packages/cli/README.md", "packages/vscode/README.md", "site/index.html"];

describe("install snippets agents run are pinned to this release (node scripts/pin-version.mjs)", () => {
  const version = (JSON.parse(readFileSync(root("packages/cli/package.json"), "utf8")) as { version: string }).version;
  it("every agent-theatre@<x> names this version, never latest", () => {
    for (const f of FILES) for (const m of readFileSync(root(f), "utf8").matchAll(/agent-theatre@([\w.-]+)/g)) expect(m[1], f).toBe(version);
  });
  it("the one-click MCP links install this version", () => {
    const text = FILES.map((f) => readFileSync(root(f), "utf8")).join("\n");
    const cursor = [...text.matchAll(/install-mcp\?name=agent-theatre&(?:amp;)?config=([A-Za-z0-9+/=]+)/g)].map((m) => JSON.parse(Buffer.from(m[1]!, "base64").toString()));
    const vscode = [...text.matchAll(/mcp\/install\?name=agent-theatre&(?:amp;)?config=([^)"'\s]+)/g)].map((m) => JSON.parse(decodeURIComponent(m[1]!)));
    expect(cursor.length).toBeGreaterThan(0); expect(vscode.length).toBeGreaterThan(0);
    for (const c of [...cursor, ...vscode]) expect(c.args).toEqual(["-y", `agent-theatre@${version}`, "serve"]);
  });
});
