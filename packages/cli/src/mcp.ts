import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Theatre, isWithin } from "./server.js";
import { gitRoot } from "./git.js";
import { readRegistry } from "./registry.js";
import { repoIdFor, scanRepo } from "./scan.js";
import { listSessions } from "./sessions.js";
import { hooksStatus, installHooks } from "./hooks/install.js";

/**
 * MCP surface: lets any MCP client (Claude Desktop, Cursor, Claude Code) open the stage for a folder,
 * list and replay sessions, and read the stage's state. The stage itself stays a local web page;
 * these tools start it and hand back URLs, or report what the agent changed. Nothing here returns file contents or prompts.
 */
const here = dirname(fileURLToPath(import.meta.url));
const webDir = [join(here, "..", "web"), join(here, "..", "..", "web", "dist")].find((d) => existsSync(join(d, "index.html")));
const stages = new Map<string, Theatre>();
const home = () => process.env.AGENT_THEATRE_HOME || join(homedir(), ".agent-theatre");

/** A stage already running for this folder (started by anyone), if there is one. */
function runningFor(cwd: string): string | null {
  for (const e of readRegistry(home())) if (e.cwd === cwd) return `http://127.0.0.1:${e.port}/`;
  return null;
}
async function stageFor(cwd: string): Promise<{ url: string; started: boolean }> {
  const existing = stages.get(cwd); if (existing) return { url: existing.url, started: false };
  const running = runningFor(cwd); if (running) return { url: running, started: false };
  const t = new Theatre({ cwd, repoId: repoIdFor(cwd), files: scanRepo(cwd), ...(webDir ? { webDir } : {}) });
  await t.listen(0); stages.set(cwd, t);
  return { url: t.url, started: true };
}
const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });

// Tool inputs are bounded and shaped; anything else is refused before any work starts.
const CWD = z.string().max(1024).describe("Absolute path of the repository folder");
const SET = z.string().regex(/^[a-z0-9-]{1,32}$/).describe("Stage set id, e.g. island, orbit, lanterns");
const SESSION = z.string().regex(/^[0-9a-f-]{8,64}$/).describe("A session id from list_sessions");
/** The folder a tool works on: an existing directory that is a git repo or inside the folder the server was started in. */
function folderFor(cwd: string | undefined): { folder: string } | { error: string } {
  const folder = resolve(cwd ?? process.cwd());
  try { if (!statSync(folder).isDirectory()) return { error: `${folder} is not a folder.` }; } catch { return { error: `${folder} does not exist.` }; }
  const base = resolve(process.cwd());
  // the server's own folder counts only when it is a real project folder, not / or the home folder an app may start it in
  if (gitRoot(folder) || (base !== resolve("/") && base !== resolve(homedir()) && isWithin(folder, base))) return { folder };
  return { error: `${folder} is not a git repository; Agent Theatre only opens stages for project folders.` };
}

export async function serveMcp(): Promise<void> {
  const server = new McpServer({ name: "agent-theatre", version: JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8")).version });

  server.registerTool("open_stage", {
    description: "Open the live Agent Theatre stage for a repository folder: the repo becomes a stage and the running Claude Code session animates on it. Returns the URL to open. Reuses a stage that is already running for that folder.",
    inputSchema: z.object({ cwd: CWD.optional(), set: SET.optional() }).strict(),
  }, async ({ cwd, set }) => {
    const f = folderFor(cwd); if ("error" in f) return text(f.error);
    const folder = f.folder;
    const { url, started } = await stageFor(folder);
    const st = hooksStatus();
    return text(`${url}?live=1${set ? `&set=${encodeURIComponent(set)}` : ""}\n${started ? "Stage started" : "Stage already running"} for ${folder}.${st.installed ? "" : " Hooks are not installed: call install_hooks (or install the Claude Code plugin) or the stage stays empty."}`);
  });

  server.registerTool("list_sessions", {
    description: "List past Claude Code sessions for a repository folder (newest first) that Agent Theatre can replay. Returns ids, titles and times only.",
    inputSchema: z.object({ cwd: CWD.optional(), limit: z.number().int().min(1).max(50).optional() }).strict(),
  }, async ({ cwd, limit }) => {
    const f = folderFor(cwd); if ("error" in f) return text(f.error);
    const folder = f.folder;
    const s = listSessions(folder).slice(0, limit ?? 15);
    return text(s.length ? s.map((x) => `${x.id}\t${new Date(x.mtime).toISOString()}\t${(x.bytes / 1024).toFixed(0)} KB\t${x.title}`).join("\n") : `No Claude Code sessions found for ${folder}.`);
  });

  server.registerTool("replay_session", {
    description: "Open a replay of a past Claude Code session on the stage. Omit session_id for the newest. Returns the URL.",
    inputSchema: z.object({ cwd: CWD.optional(), session_id: SESSION.optional(), set: SET.optional() }).strict(),
  }, async ({ cwd, session_id, set }) => {
    const f = folderFor(cwd); if ("error" in f) return text(f.error);
    const folder = f.folder;
    const id = session_id ?? listSessions(folder)[0]?.id;
    if (!id) return text(`No Claude Code sessions found for ${folder}.`);
    const { url } = await stageFor(folder);
    return text(`${url}?session=${encodeURIComponent(id)}${set ? `&set=${encodeURIComponent(set)}` : ""}`);
  });

  server.registerTool("stage_status", {
    description: "What the live stage for a folder has seen so far: event and beat counts, the last few event kinds, and whether hooks are installed. Never returns file contents.",
    inputSchema: z.object({ cwd: CWD.optional() }).strict(),
  }, async ({ cwd }) => {
    const f = folderFor(cwd); if ("error" in f) return text(f.error);
    const folder = f.folder;
    const url = stages.get(folder)?.url ?? runningFor(folder);
    if (!url) return text(`No stage running for ${folder}. Call open_stage.`);
    const scene = await (await fetch(`${url}api/scene`)).json() as { events: Array<{ kind: string; path?: string; argv0?: string }>; beats: unknown[]; signal?: string };
    const tail = scene.events.slice(-8).map((e) => `${e.kind}${e.path ? " " + e.path : e.argv0 ? " " + e.argv0 : ""}`).join("\n");
    return text(`${url}?live=1\nevents=${scene.events.length} beats=${scene.beats.length} signal=${scene.signal ?? "ok"} hooks=${hooksStatus().installed ? "installed" : "missing"}\n${tail}`);
  });

  server.registerTool("what_changed", {
    description: "The change map: which files the agent read, edited, created or deleted (in the live stage for a folder, else the newest session), with line counts, files changed during the session but not by the agent, and a Markdown version for a pull request. Paths and counts only; never file contents.",
    inputSchema: z.object({ cwd: CWD.optional(), session_id: SESSION.optional(), markdown: z.boolean().describe("Return Markdown for a pull request instead of a plain list").optional() }).strict(),
  }, async ({ cwd, session_id, markdown }) => {
    const f = folderFor(cwd); if ("error" in f) return text(f.error);
    const folder = f.folder;
    const { changesForRepo } = await import("./changes.js");
    const { headline, toMarkdown, toTree } = await import("@agent-theatre/core");
    const r = await changesForRepo(folder, session_id ? { sessionId: session_id } : {});
    if (r.source === "none") return text(`No Claude Code sessions found for ${folder}.`);
    if (markdown) return text(toMarkdown(r.cs, { marker: false }));
    const tree = toTree(r.cs).map((l) => "  ".repeat(l.depth) + l.text).join("\n");
    return text(`${headline(r.cs) || "No files changed."} (${r.source === "live" ? "live stage" : `session ${r.sessionId}`})${r.cs.totals.read ? ` · ${r.cs.totals.read} only read` : ""}${r.cs.totals.outside ? ` · ${r.cs.totals.outside} changed not by the agent` : ""}\n${tree}${r.mapUrl ? `\nmap: ${r.mapUrl}` : ""}`);
  });

  server.registerTool("install_hooks", {
    description: "Install the Agent Theatre hooks into ~/.claude/settings.json (non-destructive, keeps a backup). Not needed when the Claude Code plugin is installed.",
    inputSchema: z.object({}).strict(),
  }, async () => { const r = installHooks(); return text(r.changed ? `Hooks installed${r.backup ? ` (backup: ${r.backup})` : ""}. Claude Code picks them up without a restart.` : "Hooks were already installed."); });

  await server.connect(new StdioServerTransport());
}
