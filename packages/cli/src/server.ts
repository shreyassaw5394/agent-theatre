import { createServer, type Server } from "node:http";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, basename } from "node:path";
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
      const { events } = hookPayloadToEvents(payload, { home: homedir() });
      if (events.length) this.ingest(events);
      return c.body(null, 204);
    });
    a.get("/api/scene", (c) => c.json({ mode: "live", repoId: this.opts.repoId, world: this.live.world, events: this.live.events, beats: this.live.beats, signal: this.signal }));
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

  private broadcast(msg: unknown): void {
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
    writeFileSync(join(home, "port"), String(this.port));
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
    for (const ws of this.wss?.clients ?? []) ws.close();
    this.wss?.close();
    await new Promise<void>((res) => (this.server ? this.server.close(() => res()) : res()));
  }

  get url(): string { return `http://127.0.0.1:${this.port}/`; }
  get name(): string { return basename(this.opts.cwd); }
}
