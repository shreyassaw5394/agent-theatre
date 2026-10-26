import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Theatre } from "./server.js";
import { repoIdFor, scanRepo } from "./scan.js";
import { listSessions } from "./sessions.js";
import { hooksStatus, installHooks } from "./hooks/install.js";

/**
 * MCP surface: lets any MCP client (Claude Desktop, Cursor, Claude Code) open the stage for a folder,
 * list and replay sessions, and read the stage's state. The stage itself stays a local web page;
 * these tools start it and hand back URLs. Nothing here returns file contents or prompts.
 */
const here = dirname(fileURLToPath(import.meta.url));
const webDir = [join(here, "..", "web"), join(here, "..", "..", "web", "dist")].find((d) => existsSync(join(d, "index.html")));
const stages = new Map<string, Theatre>();
const home = () => process.env.AGENT_THEATRE_HOME || join(homedir(), ".agent-theatre");

/** A stage already running for this folder (started by anyone), if there is one. */
function runningFor(cwd: string): string | null {
  try { for (const f of readdirSync(join(home(), "ports"))) { const folder = readFileSync(join(home(), "ports", f), "utf8").trim(); if (folder === cwd && Number(f) > 0) return `http://127.0.0.1:${f}/`; } } catch { /* none */ }
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

export async function serveMcp(): Promise<void> {
  const server = new McpServer({ name: "agent-theatre", version: JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8")).version });

  server.registerTool("open_stage", {
    description: "Open the live Agent Theatre stage for a repository folder: the repo becomes a stage and the running Claude Code session animates on it. Returns the URL to open. Reuses a stage that is already running for that folder.",
    inputSchema: { cwd: z.string().describe("Absolute path of the repository folder").optional(), set: z.string().describe("Stage set id, e.g. island, orbit, lanterns").optional() },
  }, async ({ cwd, set }) => {
    const folder = cwd ?? process.cwd();
    const { url, started } = await stageFor(folder);
    const st = hooksStatus();
    return text(`${url}?live=1${set ? `&set=${encodeURIComponent(set)}` : ""}\n${started ? "Stage started" : "Stage already running"} for ${folder}.${st.installed ? "" : " Hooks are not installed: call install_hooks (or install the Claude Code plugin) or the stage stays empty."}`);
  });

  server.registerTool("list_sessions", {
    description: "List past Claude Code sessions for a repository folder (newest first) that Agent Theatre can replay. Returns ids, titles and times only.",
    inputSchema: { cwd: z.string().optional(), limit: z.number().int().min(1).max(50).optional() },
  }, async ({ cwd, limit }) => {
    const folder = cwd ?? process.cwd();
    const s = listSessions(folder).slice(0, limit ?? 15);
    return text(s.length ? s.map((x) => `${x.id}\t${new Date(x.mtime).toISOString()}\t${(x.bytes / 1024).toFixed(0)} KB\t${x.title}`).join("\n") : `No Claude Code sessions found for ${folder}.`);
  });

  server.registerTool("replay_session", {
    description: "Open a replay of a past Claude Code session on the stage. Omit session_id for the newest. Returns the URL.",
    inputSchema: { cwd: z.string().optional(), session_id: z.string().optional(), set: z.string().optional() },
  }, async ({ cwd, session_id, set }) => {
    const folder = cwd ?? process.cwd();
    const id = session_id ?? listSessions(folder)[0]?.id;
    if (!id) return text(`No Claude Code sessions found for ${folder}.`);
    const { url } = await stageFor(folder);
    return text(`${url}?session=${encodeURIComponent(id)}${set ? `&set=${encodeURIComponent(set)}` : ""}`);
  });

  server.registerTool("stage_status", {
    description: "What the live stage for a folder has seen so far: event and beat counts, the last few event kinds, and whether hooks are installed. Never returns file contents.",
    inputSchema: { cwd: z.string().optional() },
  }, async ({ cwd }) => {
    const folder = cwd ?? process.cwd();
    const url = stages.get(folder)?.url ?? runningFor(folder);
    if (!url) return text(`No stage running for ${folder}. Call open_stage.`);
    const scene = await (await fetch(`${url}api/scene`)).json() as { events: Array<{ kind: string; path?: string; argv0?: string }>; beats: unknown[]; signal?: string };
    const tail = scene.events.slice(-8).map((e) => `${e.kind}${e.path ? " " + e.path : e.argv0 ? " " + e.argv0 : ""}`).join("\n");
    return text(`${url}?live=1\nevents=${scene.events.length} beats=${scene.beats.length} signal=${scene.signal ?? "ok"} hooks=${hooksStatus().installed ? "installed" : "missing"}\n${tail}`);
  });

  server.registerTool("install_hooks", {
    description: "Install the Agent Theatre hooks into ~/.claude/settings.json (non-destructive, keeps a backup). Not needed when the Claude Code plugin is installed.",
    inputSchema: {},
  }, async () => { const r = installHooks(); return text(r.changed ? `Hooks installed${r.backup ? ` (backup: ${r.backup})` : ""}. Claude Code picks them up without a restart.` : "Hooks were already installed."); });

  await server.connect(new StdioServerTransport());
}
