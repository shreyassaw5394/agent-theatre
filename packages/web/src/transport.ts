import type { AgentEvent, Beat, World } from "@agent-theatre/core";

/**
 * The one seam between the renderer and its host. The CLI supplies a
 * WebSocket transport; the VS Code extension supplies one over postMessage.
 * Nothing in web/ knows which it is talking to.
 */
export interface ScenePayload { world: World; events: AgentEvent[]; beats: Beat[]; repoId: string }
export interface Transport {
  readonly mode: "live" | "replay";
  /** Fires once with the initial world/events/beats (replay: everything; live: what exists so far). */
  onReady(cb: (p: ScenePayload) => void): void;
  /** Live mode: new beats as they are directed. */
  onBeats(cb: (beats: Beat[], events: AgentEvent[]) => void): void;
  /** Live mode: the host hasn't heard from the agent for a while. */
  onSignal?(cb: (state: "ok" | "lost") => void): void;
}

export class StaticTransport implements Transport {
  readonly mode = "replay" as const;
  constructor(private readonly payload: ScenePayload) {}
  onReady(cb: (p: ScenePayload) => void): void { queueMicrotask(() => cb(this.payload)); }
  onBeats(): void { /* replay has nothing new */ }
}
