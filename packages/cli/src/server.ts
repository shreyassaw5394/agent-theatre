import { createServer, type Server } from "node:http";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, basename, resolve, sep } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { Hono } from "hono";
import { getRequestListener } from "@hono/node-server";
import { WebSocketServer, type WebSocket } from "ws";
import { Director, direct, filesFromEvents, generateWorld, hookPayloadToEvents, parseTranscript, type AgentEvent, type Beat, type FileNode, type World } from "@agent-theatre/core";
import { listSessions } from "./sessions.js";

export interface TheatreOptions {
  cwd: string;
  repoId: string;
  files: FileNode[];
  /** Directory of the built web bundle (index.html + assets). Optional in tests. */
  webDir?: string;
  /** Where to write the port file. Default ~/.agent-theatre */
  home?: string;
  /** No hook events for this long while a session is open → "lost" signal. */
  lostAfterMs?: number;
}

interface Live { world: World; director: Director; events: AgentEvent[]; beats: Beat[]; lastEventAt: number; sessionOpen: boolean }

/**
 * The local theatre. Loopback only. Receives hook payloads, directs them into
 * beats, and streams events + beats to the browser. Serves the web bundle and
 * replay payloads. Never logs or forwards tool input/output: the hook payload
 * is reduced to AgentEvents at the door and discarded.
 */
export class Theatre {
  readonly app = new Hono();
  private server: Server | null = null;
  private wss: WebSocketServer | null = null;
  private live: Live;
  private signal: "ok" | "lost" = "ok";
  /** The most recent Claude Code session that spoke to this stage; what a prompt from the stage resumes. */
  private lastSessionId: string | null = null;
  /** The most recent cwd of a Claude Code session that is NOT this repo (so an empty stage can point the person there). */
  private elsewhere: string | null = null;
  private readonly openSessions = new Set<string>();
  private timer: NodeJS.Timeout | null = null;
  port = 0;

  constructor(private readonly opts: TheatreOptions) {
    const world = generateWorld({ repoId: opts.repoId, files: opts.files });
    this.live = { world, director: new Director(world), events: [], beats: [], lastEventAt: 0, sessionOpen: false };
    this.routes();
  }

  private routes(): void {
    const a = this.app;
    a.post("/hook", async (c) => {
      let payload: unknown;
      try { payload = await c.req.json(); } catch { return c.body(null, 204); }
      // hooks are global to Claude Code: only this repo's sessions belong on this stage
      const cwd = typeof (payload as { cwd?: unknown })?.cwd === "string" ? (payload as { cwd: string }).cwd : "";
      if (cwd && !isWithin(cwd, this.opts.cwd)) {
        // not this stage's repo — but tell the stage where the action is, so an empty stage can say so
        if (this.elsewhere !== cwd) { this.elsewhere = cwd; this.broadcast({ type: "elsewhere", cwd }); }
        return c.body(null, 204);
      }
      const sid = (payload as { session_id?: unknown }).session_id; if (typeof sid === "string" && sid) this.lastSessionId = sid;
      const hookName = (payload as { hook_event_name?: unknown }).hook_event_name;
      // any session that speaks to this stage is open until its SessionEnd (a stage started mid-session never saw the SessionStart)
      if (typeof sid === "string" && sid) { if (hookName === "SessionEnd") this.openSessions.delete(sid); else this.openSessions.add(sid); }
      let { events } = hookPayloadToEvents(payload, { home: homedir() });
      // several Claude Code sessions can share a repo (a terminal, VS Code, a headless resume): the curtain falls only when the last one ends
      if (this.openSessions.size > 0) events = events.filter((e) => e.kind !== "session_end");
      if (events.length) this.ingest(events);
      return c.body(null, 204);
    });
    // The VS Code webview is another origin, and Chromium treats a loopback target from it as a "private network"
    // request: it preflights and requires Access-Control-Allow-Private-Network. Loopback only; nothing sensitive.
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-private-network": "true" };
    a.use("/api/*", async (c, next) => { await next(); for (const [k, v] of Object.entries(cors)) c.res.headers.set(k, v); });
    a.options("/api/*", (c) => c.body(null, 204, cors));
    a.get("/api/scene", (c) => c.json(this.scene()));
    a.get("/api/sessions", (c) => c.json(listSessions(this.opts.cwd).map((s) => ({ id: s.id, title: s.title, mtime: s.mtime, bytes: s.bytes }))));
    a.get("/api/replay/:id", (c) => {
      const id = c.req.param("id");
      const s = listSessions(this.opts.cwd).find((x) => x.id === id);
      if (!s) return c.json({ error: "no such session" }, 404);
      const { events, warnings } = parseTranscript(readFileSync(s.path, "utf8"), { home: homedir() });
      const inferred = filesFromEvents(events);
      const known = new Set(this.opts.files.map((f) => f.path));
      const files = [...this.opts.files, ...inferred.files.filter((f) => !known.has(f.path))];
      const world = generateWorld({ repoId: this.opts.repoId, files, touched: inferred.touched });
      const beats = direct(events, world);
      return c.json({ mode: "replay", repoId: this.opts.repoId, title: s.title, world, events, beats, warnings: warnings.length });
    });
    // Prompt from the stage: resumes the last session headlessly (`claude -p --resume <id>`); its hooks feed the stage.
    a.get("/api/prompt", (c) => c.json({ available: !!claudeBinary() && !!this.lastSessionId, session: this.lastSessionId }));
    a.post("/api/prompt", async (c) => {
      const body = await c.req.json().catch(() => ({})) as { text?: unknown };
      const text = typeof body.text === "string" ? body.text.trim() : "";
      const bin = claudeBinary();
      if (!text) return c.json({ ok: false, error: "empty prompt" }, 400);
      if (!bin) return c.json({ ok: false, error: "Claude Code 2.x not found on PATH" }, 503);
      if (!this.lastSessionId) return c.json({ ok: false, error: "no session to resume yet" }, 409);
      const logPath = join(this.opts.home ?? join(homedir(), ".agent-theatre"), "prompt.log");
      const child = spawn(bin, ["-p", "--resume", this.lastSessionId, text], { cwd: this.opts.cwd, stdio: ["ignore", "pipe", "pipe"], detached: true, env: process.env });
      let err = "";
      child.stdout?.on("data", (d: Buffer) => { try { writeFileSync(logPath, `[${new Date().toISOString()}] out: ${String(d).slice(0, 2000)}\n`, { flag: "a" }); } catch { /* fine */ } });
      child.stderr?.on("data", (d: Buffer) => { err += String(d); try { writeFileSync(logPath, `[${new Date().toISOString()}] err: ${String(d).slice(0, 2000)}\n`, { flag: "a" }); } catch { /* fine */ } });
      child.unref();
      // an early exit means it never started (bad session id, auth, flags): say so instead of pretending
      const early = await new Promise<number | null>((res) => { const t = setTimeout(() => res(null), 2500); child.once("exit", (code) => { clearTimeout(t); res(code ?? 1); }); });
      if (early !== null && early !== 0) return c.json({ ok: false, error: `Claude Code exited ${early}: ${err.trim().split("\n").pop() ?? "see ~/.agent-theatre/prompt.log"}` }, 502);
      return c.json({ ok: true, session: this.lastSessionId });
    });
    a.get("/healthz", (c) => c.json({ ok: true, port: this.port, events: this.live.events.length }));
    if (this.opts.webDir) {
      const dir = this.opts.webDir;
      a.get("/*", (c) => {
        const p = c.req.path === "/" ? "/index.html" : c.req.path;
        const file = join(dir, p);
        if (!file.startsWith(dir) || !existsSync(file)) return c.text("not found", 404);
        const ext = p.slice(p.lastIndexOf(".") + 1);
        const type: Record<string, string> = { html: "text/html; charset=utf-8", js: "text/javascript", css: "text/css", json: "application/json", jsonl: "application/x-ndjson", svg: "image/svg+xml", png: "image/png", woff2: "font/woff2", webp: "image/webp" };
        return c.body(readFileSync(file), 200, { "content-type": type[ext] ?? "application/octet-stream", "cache-control": p.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache" });
      });
    }
  }

  /** Append events to the live session, direct them, and broadcast. */
  ingest(events: AgentEvent[]): Beat[] {
    const l = this.live;
    const out: Beat[] = [];
    for (const e of events) {
      if (e.kind === "session_start") l.sessionOpen = true;
      if (e.kind === "session_end") l.sessionOpen = false;
      l.events.push(e);
      out.push(...l.director.feed(e));
    }
    l.beats.push(...out);
    l.lastEventAt = Date.now();
    if (this.signal !== "ok") { this.signal = "ok"; this.broadcast({ type: "signal", state: "ok" }); }
    this.broadcast({ type: "beats", beats: out, events });
    return out;
  }

  /** In-process subscribers (the VS Code extension relays these to its webview). */
  readonly listeners = new Set<(msg: unknown) => void>();
  private broadcast(msg: unknown): void {
    for (const l of this.listeners) { try { l(msg); } catch { /* listener's problem */ } }
    const data = JSON.stringify(msg);
    for (const ws of this.wss?.clients ?? []) if (ws.readyState === 1) ws.send(data);
  }

  async listen(port = 0): Promise<number> {
    const listener = getRequestListener(this.app.fetch);
    this.server = createServer(listener);
    this.wss = new WebSocketServer({ noServer: true });
    this.server.on("upgrade", (req, socket, head) => {
      if (req.url?.startsWith("/live")) this.wss!.handleUpgrade(req, socket, head, (ws: WebSocket) => { this.wss!.emit("connection", ws, req); ws.send(JSON.stringify({ type: "hello", signal: this.signal })); });
      else socket.destroy();
    });
    await new Promise<void>((res) => this.server!.listen(port, "127.0.0.1", res));
    const addr = this.server.address();
    this.port = typeof addr === "object" && addr ? addr.port : port;
    const home = this.opts.home ?? join(homedir(), ".agent-theatre");
    mkdirSync(home, { recursive: true });
    // a stage started by an older build only wrote `port`: keep it reachable by adopting it into the registry first
    try { const old = parseInt(readFileSync(join(home, "port"), "utf8").trim(), 10); if (old > 0 && old !== this.port && portAlive(old) && !existsSync(join(home, "ports", String(old)))) { mkdirSync(join(home, "ports"), { recursive: true }); writeFileSync(join(home, "ports", String(old)), "(started by an older build)"); } } catch { /* no port file */ }
    writeFileSync(join(home, "port"), String(this.port));
    // registry for fan-out: one file per running stage, holding the repo it is for; stale entries (dead ports) are pruned
    mkdirSync(join(home, "ports"), { recursive: true });
    for (const f of readdirSync(join(home, "ports"))) { const n = parseInt(f, 10); if (n > 0 && n !== this.port && !portAlive(n)) { try { rmSync(join(home, "ports", f)); } catch { /* fine */ } } }
    writeFileSync(join(home, "ports", String(this.port)), this.opts.cwd);
    const lostAfter = this.opts.lostAfterMs ?? 90_000;
    this.timer = setInterval(() => {
      const l = this.live;
      if (l.sessionOpen && l.lastEventAt && Date.now() - l.lastEventAt > lostAfter && this.signal === "ok") { this.signal = "lost"; this.broadcast({ type: "signal", state: "lost" }); }
    }, 5_000);
    this.timer.unref();
    return this.port;
  }

  async close(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    const home = this.opts.home ?? join(homedir(), ".agent-theatre");
    try { if (readFileSync(join(home, "port"), "utf8").trim() === String(this.port)) rmSync(join(home, "port")); } catch { /* already gone */ }
    try { rmSync(join(home, "ports", String(this.port))); } catch { /* already gone */ }
    for (const ws of this.wss?.clients ?? []) ws.close();
    this.wss?.close();
    await new Promise<void>((res) => (this.server ? this.server.close(() => res()) : res()));
  }

  /** The live scene as /api/scene returns it. */
  scene(): unknown { return { mode: "live", repoId: this.opts.repoId, cwd: this.opts.cwd, elsewhere: this.elsewhere, world: this.live.world, events: this.live.events, beats: this.live.beats, signal: this.signal }; }
  get url(): string { return `http://127.0.0.1:${this.port}/`; }
  get name(): string { return basename(this.opts.cwd); }
}

/** True when `dir` is `root` or inside it (symlinks resolved when they exist). */
export function isWithin(dir: string, root: string): boolean {
  const norm = (p: string) => { try { return realpathSync(p); } catch { return resolve(p); } };
  const d = norm(dir), r = norm(root);
  return d === r || d.startsWith(r.endsWith(sep) ? r : r + sep);
}

/** Claude Code 2.x on PATH, or the binary the VS Code extension ships; null if neither. Overridable with AGENT_THEATRE_CLAUDE. */
export function claudeBinary(): string | null {
  const cands = [process.env.AGENT_THEATRE_CLAUDE, "claude"].filter((x): x is string => !!x);
  try {
    const ext = join(homedir(), ".vscode", "extensions");
    for (const d of (existsSync(ext) ? readdirSync(ext) : []).filter((n) => n.startsWith("anthropic.claude-code-")).sort().reverse()) cands.push(join(ext, d, "resources", "native-binary", "claude"));
  } catch { /* no VS Code */ }
  for (const c of cands) {
    try { const r = spawnSync(c, ["--version"], { encoding: "utf8", timeout: 4000 }); const m = /^(\d+)\./.exec(r.stdout.trim()); if (r.status === 0 && m && Number(m[1]) >= 2) return c; } catch { /* next */ }
  }
  return null;
}

/** Is something listening on this loopback port right now? (sync, bounded; used to prune the fan-out registry) */
function portAlive(port: number): boolean {
  const r = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8", timeout: 2000 });
  if (r.status === 0 && r.stdout.trim()) return true;
  if (r.error) return true; // lsof missing (Windows): keep the entry; the hook tolerates dead ports anyway
  return false;
}
