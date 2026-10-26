import { Command } from "commander";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import pc from "picocolors";
import { Theatre } from "./server.js";
import { repoIdFor, scanRepo } from "./scan.js";
import { listSessions } from "./sessions.js";
import { hooksStatus, installHooks, uninstallHooks } from "./hooks/install.js";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8")) as { version: string };
const webDir = [join(here, "..", "web"), join(here, "..", "..", "web", "dist")].find((d) => existsSync(join(d, "index.html")));

async function openBrowser(url: string): Promise<void> {
  try { const { default: open } = await import("open"); await open(url); } catch { /* print the URL instead */ }
}

const program = new Command().name("agent-theatre").description("Watch your coding agent work — as a film, not a log.").version(pkg.version);

program
  .option("-p, --port <n>", "port to listen on (default: a free one)", "0")
  .option("--no-open", "don't open the browser")
  .option("--set <id>", "stage set: island | orbit | metropolis")
  .action(async (o: { port: string; open: boolean; set?: string }) => {
    const cwd = process.cwd();
    const st = hooksStatus();
    if (!st.installed && !pluginInstalled()) console.log(pc.yellow("Hooks are not installed — the scene will stay empty until you run:"), pc.bold("agent-theatre hooks install"), pc.dim("(or install the Claude Code plugin)"));
    const files = scanRepo(cwd);
    const theatre = new Theatre({ cwd, repoId: repoIdFor(cwd), files, ...(webDir ? { webDir } : {}) });
    await theatre.listen(Number(o.port) || 0);
    const url = `${theatre.url}?live=1${o.set ? `&set=${o.set}` : ""}`;
    console.log(`${pc.bold("Agent Theatre")} · ${pc.dim(theatre.name)} · ${files.length} files`);
    console.log(`${pc.green("▶")} ${url}`);
    if (!webDir) console.log(pc.yellow("web bundle not found — API only. Run `pnpm -F @agent-theatre/web build` or use the Vite dev server with a proxy."));
    if (o.open) await openBrowser(url);
    const bye = async () => { await theatre.close(); process.exit(0); };
    process.on("SIGINT", bye); process.on("SIGTERM", bye);
  });

program
  .command("replay [session]")
  .description("replay a past Claude Code session for this repo (default: pick from a list)")
  .option("--latest", "replay the newest session without asking")
  .option("--no-open", "don't open the browser")
  .option("--set <id>", "stage set")
  .action(async (session: string | undefined, o: { latest?: boolean; open: boolean; set?: string }) => {
    const cwd = process.cwd();
    const sessions = listSessions(cwd);
    if (!sessions.length) { console.log(pc.yellow(`No Claude Code sessions found for ${cwd}.`)); process.exit(1); }
    let id = session;
    if (!id && (o.latest || !process.stdin.isTTY)) id = sessions[0]!.id;
    if (!id) {
      console.log(pc.bold("Sessions for this repo, newest first:\n"));
      sessions.slice(0, 15).forEach((s, i) => console.log(`  ${pc.dim(String(i + 1).padStart(2))}  ${new Date(s.mtime).toLocaleString()}  ${pc.dim((s.bytes / 1024).toFixed(0).padStart(6) + " KB")}  ${s.title || pc.dim(s.id)}`));
      const { createInterface } = await import("node:readline/promises");
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const ans = (await rl.question(`\nWhich one? [1] `)).trim() || "1";
      rl.close();
      const pick = sessions[Math.max(0, Math.min(sessions.length - 1, (parseInt(ans, 10) || 1) - 1))]!;
      id = pick.id;
    }
    const found = sessions.find((s) => s.id === id || s.id.startsWith(id!));
    if (!found) { console.log(pc.red(`No session ${id}`)); process.exit(1); }
    const files = scanRepo(cwd);
    const theatre = new Theatre({ cwd, repoId: repoIdFor(cwd), files, ...(webDir ? { webDir } : {}) });
    await theatre.listen(0);
    const url = `${theatre.url}?session=${found.id}${o.set ? `&set=${o.set}` : ""}`;
    console.log(`${pc.bold("Agent Theatre")} · replay · ${found.title || found.id}`);
    console.log(`${pc.green("▶")} ${url}`);
    if (o.open) await openBrowser(url);
    const bye = async () => { await theatre.close(); process.exit(0); };
    process.on("SIGINT", bye); process.on("SIGTERM", bye);
  });

program
  .command("serve")
  .alias("mcp")
  .description("run the MCP server over stdio (tools: open_stage, list_sessions, replay_session, stage_status, install_hooks)")
  .action(async () => { const { serveMcp } = await import("./mcp.js"); await serveMcp(); });

program
  .command("init")
  .description("register the MCP server with your agents: Claude Code, Claude Desktop, Cursor, Windsurf, Codex, Gemini CLI (user scope) or this repo's .mcp.json / .cursor / .vscode (--repo)")
  .option("--repo", "write repo-level config files in the current folder instead of user-level ones")
  .option("--only <agents>", "comma-separated subset, e.g. cursor,windsurf")
  .option("--all", "user scope: also write configs for agents that are not installed yet")
  .option("--dry-run", "show what would change")
  .action(async (o: { repo?: boolean; only?: string; all?: boolean; dryRun?: boolean }) => {
    const { init } = await import("./setup.js");
    const rows = init({ scope: o.repo ? "repo" : "user", dir: process.cwd(), ...(o.only ? { only: o.only.split(",") } : {}), ...(o.all ? { all: true } : {}), ...(o.dryRun ? { dryRun: true } : {}) });
    for (const r of rows) console.log(`${(r.result.startsWith("written") || r.result === "would write" ? pc.green("✓") : r.result === "unchanged" ? pc.dim("=") : pc.dim("·"))} ${r.agent.padEnd(20)} ${pc.dim(r.file)}  ${r.result}`);
    console.log(pc.dim("Restart the agent to pick up the new MCP server. Tools: open_stage, list_sessions, replay_session, stage_status, install_hooks."));
  });

const hooks = program.command("hooks").description("install, remove or inspect the Claude Code hooks");
hooks.command("install").description("merge our hooks into ~/.claude/settings.json (backup kept, nothing else touched)").action(() => {
  const r = installHooks();
  console.log(r.changed ? pc.green("Hooks installed.") : pc.dim("Hooks were already installed."), r.backup ? pc.dim(`backup: ${r.backup}`) : "");
  console.log(pc.dim("Claude Code picks up settings changes automatically; no restart needed."));
});
hooks.command("uninstall").description("remove only our hook entries").action(() => {
  const r = uninstallHooks();
  console.log(r.changed ? pc.green("Hooks removed.") : pc.dim("Nothing to remove."));
});
hooks.command("status").action(() => {
  const s = hooksStatus();
  console.log(`settings: ${s.settings}\ninstalled: ${s.installed ? pc.green("yes") : pc.yellow("no")}\nscript present: ${s.scriptPresent ? "yes" : "no"}`);
});

program.parseAsync(process.argv).catch((err) => { console.error(pc.red(String(err?.message ?? err))); process.exit(1); });

/** The Claude Code plugin brings its own hooks; don't nag about `hooks install` when it is present. */
function pluginInstalled(): boolean {
  try { const p = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "plugins", "installed_plugins.json"); return readFileSync(p, "utf8").includes("agent-theatre"); } catch { return false; }
}
