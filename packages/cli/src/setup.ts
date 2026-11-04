import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * `agent-theatre init` — register the MCP server with every agent on this machine (or in this repo),
 * non-destructively: read the file, merge our one entry, back up, write. Nothing else in the file
 * is touched. Same shape for every agent; only the path and the key differ.
 */
/** Configs pin this exact version (re-running init moves the pin), so an agent never runs a release nobody installed. */
export const VERSION = (JSON.parse(readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8")) as { version: string }).version;
const ENTRY = { command: "npx", args: ["-y", `agent-theatre@${VERSION}`, "serve"] };
type Target = { agent: string; file: string; key: string; wrap?: (entry: object) => object };

export function targets(scope: "user" | "repo", dir: string, env = process.env): Target[] {
  const h = homedir();
  if (scope === "repo") return [
    { agent: "Claude Code (repo)", file: join(dir, ".mcp.json"), key: "mcpServers" },
    { agent: "Cursor (repo)", file: join(dir, ".cursor", "mcp.json"), key: "mcpServers" },
    { agent: "VS Code (repo)", file: join(dir, ".vscode", "mcp.json"), key: "servers" },
  ];
  return [
    { agent: "Claude Code", file: join(env.CLAUDE_CONFIG_DIR || join(h, ".claude"), ".mcp.json"), key: "mcpServers" },
    { agent: "Claude Desktop", file: process.platform === "darwin" ? join(h, "Library", "Application Support", "Claude", "claude_desktop_config.json") : join(env.APPDATA || join(h, ".config"), "Claude", "claude_desktop_config.json"), key: "mcpServers" },
    { agent: "Cursor", file: join(h, ".cursor", "mcp.json"), key: "mcpServers" },
    { agent: "Windsurf", file: join(h, ".codeium", "windsurf", "mcp_config.json"), key: "mcpServers" },
    { agent: "Codex", file: join(h, ".codex", "config.toml"), key: "toml" },
    { agent: "Gemini CLI", file: join(h, ".gemini", "settings.json"), key: "mcpServers" },
  ];
}

export function mergeJson(existing: string | null, key: string): { next: string; changed: boolean } {
  let obj: Record<string, unknown> = {};
  if (existing && existing.trim()) { try { obj = JSON.parse(existing) as Record<string, unknown>; } catch { throw new Error("not valid JSON; refusing to overwrite"); } }
  const section = ((obj[key] as Record<string, unknown> | undefined) ??= {});
  const same = JSON.stringify(section["agent-theatre"]) === JSON.stringify(ENTRY);
  if (same) return { next: existing ?? "", changed: false };
  section["agent-theatre"] = ENTRY;
  return { next: JSON.stringify(obj, null, 2) + "\n", changed: true };
}
export function mergeToml(existing: string | null): { next: string; changed: boolean } {
  const cur = existing ?? "";
  const args = `args = ["-y", "agent-theatre@${VERSION}", "serve"]`;
  if (/\[mcp_servers\.agent-theatre\]/.test(cur)) {
    // our block exists: only its args line may change (to move the version pin)
    const next = cur.replace(/(\[mcp_servers\.agent-theatre\][^[]*?)^args = .*$/m, `$1${args}`);
    return { next, changed: next !== cur };
  }
  const block = `\n[mcp_servers.agent-theatre]\ncommand = "npx"\n${args}\n`;
  return { next: cur.replace(/\s*$/, "\n") + block, changed: true };
}

export function init(opts: { scope: "user" | "repo"; dir: string; only?: string[]; dryRun?: boolean; all?: boolean }): Array<{ agent: string; file: string; result: "written" | "unchanged" | "skipped (not installed)" | "would write" | string }> {
  const out: Array<{ agent: string; file: string; result: string }> = [];
  for (const t of targets(opts.scope, opts.dir)) {
    if (opts.only && !opts.only.some((o) => t.agent.toLowerCase().startsWith(o.toLowerCase()))) continue;
    const exists = existsSync(t.file);
    // user scope: only touch agents that are actually installed (their config dir exists), unless --all
    if (opts.scope === "user" && !opts.all && !existsSync(join(t.file, ".."))) { out.push({ agent: t.agent, file: t.file, result: "skipped (not installed)" }); continue; }
    try {
      const existing = exists ? readFileSync(t.file, "utf8") : null;
      const { next, changed } = t.key === "toml" ? mergeToml(existing) : mergeJson(existing, t.key);
      if (!changed) { out.push({ agent: t.agent, file: t.file, result: "unchanged" }); continue; }
      if (opts.dryRun) { out.push({ agent: t.agent, file: t.file, result: "would write" }); continue; }
      mkdirSync(join(t.file, ".."), { recursive: true });
      if (exists) copyFileSync(t.file, `${t.file}.bak-agent-theatre`);
      writeFileSync(t.file, next);
      out.push({ agent: t.agent, file: t.file, result: "written" });
    } catch (e) { out.push({ agent: t.agent, file: t.file, result: `error: ${(e as Error).message}` }); }
  }
  return out;
}
