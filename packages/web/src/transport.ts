import type { AgentEvent, Beat, World } from "@agent-theatre/core";

/**
 * The one seam between the renderer and its host. The CLI supplies a
 * WebSocket transport; the VS Code extension supplies one over postMessage.
 * Nothing in web/ knows which it is talking to.
 */
export interface ScenePayload { world: World; events: AgentEvent[]; beats: Beat[]; repoId: string; cwd?: string; elsewhere?: string | null }
export interface Transport {
  readonly mode: "live" | "replay";
  /** Fires once with the initial world/events/beats (replay: everything; live: what exists so far). */
  onReady(cb: (p: ScenePayload) => void): void;
  /** Live mode: new beats as they are directed. */
  onBeats(cb: (beats: Beat[], events: AgentEvent[]) => void): void;
  /** Live mode: the host hasn't heard from the agent for a while. */
  onSignal?(cb: (state: "ok" | "lost") => void): void;
  /** Live only: a Claude Code session is running in another folder. */
  onElsewhere?(cb: (cwd: string) => void): void;
}

export class StaticTransport implements Transport {
  readonly mode = "replay" as const;
  constructor(private readonly payload: ScenePayload) {}
  onReady(cb: (p: ScenePayload) => void): void { queueMicrotask(() => cb(this.payload)); }
  onBeats(): void { /* replay has nothing new */ }
}

/** Live mode over the CLI's WebSocket, with the initial payload from /api/scene. */
export class WsTransport implements Transport {
  readonly mode = "live" as const;
  private readyCb: ((p: ScenePayload) => void) | null = null;
  private beatsCb: ((beats: Beat[], events: AgentEvent[]) => void) | null = null;
  private signalCb: ((s: "ok" | "lost") => void) | null = null;
  private pending: ScenePayload | null = null;
  constructor(private readonly base = "") { void this.connect(); }
  private async connect(): Promise<void> {
    const scene = await (await fetch(`${this.base}/api/scene`)).json() as ScenePayload & { signal?: "ok" | "lost" };
    const payload = { world: scene.world, events: scene.events, beats: scene.beats, repoId: scene.repoId, ...(scene.cwd ? { cwd: scene.cwd } : {}), elsewhere: scene.elsewhere ?? null };
    // the page may still be initialising its renderer when this lands; hold it until onReady is registered
    if (this.readyCb) this.readyCb(payload); else this.pending = payload;
    if (scene.signal) this.signalCb?.(scene.signal);
    const open = () => {
      const origin = /^https?:/.test(this.base) ? this.base : location.origin + this.base;
      const ws = new WebSocket(`${origin.replace(/^http/, "ws")}/live`);
      ws.onmessage = (m) => {
        const msg = JSON.parse(String(m.data)) as { type: string; beats?: Beat[]; events?: AgentEvent[]; state?: "ok" | "lost"; cwd?: string };
        if (msg.type === "beats" && msg.beats) this.beatsCb?.(msg.beats, msg.events ?? []);
        if (msg.type === "signal" && msg.state) this.signalCb?.(msg.state);
        if (msg.type === "elsewhere" && msg.cwd) this.elsewhereCb?.(msg.cwd);
      };
      ws.onclose = () => { this.signalCb?.("lost"); setTimeout(open, 2000); };
    };
    open();
  }
  onReady(cb: (p: ScenePayload) => void): void { this.readyCb = cb; if (this.pending) { const p = this.pending; this.pending = null; cb(p); } }
  onBeats(cb: (beats: Beat[], events: AgentEvent[]) => void): void { this.beatsCb = cb; }
  onSignal(cb: (s: "ok" | "lost") => void): void { this.signalCb = cb; }
  private elsewhereCb: ((cwd: string) => void) | null = null;
  onElsewhere(cb: (cwd: string) => void): void { this.elsewhereCb = cb; }
}

/** Inside a VS Code webview: the extension host fetches from the local server and relays its broadcasts. */
export interface HostApi { postMessage(m: unknown): void }
export class HostTransport implements Transport {
  readonly mode = "live" as const;
  private readyCb: ((p: ScenePayload) => void) | null = null;
  private beatsCb: ((beats: Beat[], events: AgentEvent[]) => void) | null = null;
  private signalCb: ((s: "ok" | "lost") => void) | null = null;
  private pending: ScenePayload | null = null;
  constructor(private readonly host: HostApi, private readonly session: string | null) {
    addEventListener("message", (ev: MessageEvent) => {
      const m = ev.data as { type?: string; payload?: ScenePayload & { signal?: "ok" | "lost"; title?: string }; beats?: Beat[]; events?: AgentEvent[]; state?: "ok" | "lost"; cwd?: string };
      if (m?.type === "elsewhere" && m.cwd) this.elsewhereCb?.(m.cwd);
      if (m?.type === "scene" && m.payload) {
        const p = m.payload, payload = { world: p.world, events: p.events, beats: p.beats, repoId: p.title ? `${p.repoId} — ${p.title}` : p.repoId, ...(p.cwd ? { cwd: p.cwd } : {}), elsewhere: p.elsewhere ?? null };
        if (this.readyCb) this.readyCb(payload); else this.pending = payload;
        if (p.signal) this.signalCb?.(p.signal);
      }
      if (m?.type === "beats" && m.beats) this.beatsCb?.(m.beats, m.events ?? []);
      if (m?.type === "signal" && m.state) this.signalCb?.(m.state);
    });
    host.postMessage(session ? { type: "replay", id: session } : { type: "scene" });
  }
  onReady(cb: (p: ScenePayload) => void): void { this.readyCb = cb; if (this.pending) { const p = this.pending; this.pending = null; cb(p); } }
  onBeats(cb: (beats: Beat[], events: AgentEvent[]) => void): void { this.beatsCb = cb; }
  onSignal(cb: (s: "ok" | "lost") => void): void { this.signalCb = cb; }
  private elsewhereCb: ((cwd: string) => void) | null = null;
  onElsewhere(cb: (cwd: string) => void): void { this.elsewhereCb = cb; }
}

/** Replay of a real session served by the CLI. */
export async function replayTransport(sessionId: string, base = ""): Promise<Transport> {
  const r = await fetch(`${base}/api/replay/${encodeURIComponent(sessionId)}`);
  if (!r.ok) throw new Error(`session not found: ${sessionId}`);
  const p = await r.json() as ScenePayload & { title?: string };
  return new StaticTransport({ world: p.world, events: p.events, beats: p.beats, repoId: p.title ? `${p.repoId} — ${p.title}` : p.repoId });
}
