import type { PlaceId, PlaceKind } from "../world/types.js";

export type Mood = "curious" | "focused" | "lost" | "happy" | "uneasy";
export type TestOutcome = "pass" | "fail" | "unknown";

/** Who performs the beat: "pip" or a subagent's id. */
export type ActorId = "pip" | (string & {});

export interface BeatBase {
  id: string;
  /** Scene-clock milliseconds (real gaps compressed). */
  atMs: number;
  durationMs: number;
  /** Real epoch ms of the triggering event, for the event-log sync. */
  realTs: number;
  mood: Mood;
  actor: ActorId;
  sourceEventIds: string[];
}

export type BeatBody =
  | { kind: "curtain_up"; repoId: string }
  | { kind: "curtain_down"; verified: boolean }
  | { kind: "walk_to"; target: PlaceId }
  | { kind: "read"; target: PlaceId }
  | { kind: "build"; target: PlaceId; intensity: number }
  | { kind: "raise"; target: PlaceId; newPlace?: { path: string; label: string; kind: PlaceKind; district: string } }
  | { kind: "forge"; intensity: number }
  | { kind: "search"; scope: "repo" | "web" }
  | { kind: "run_tests"; target: PlaceId }
  | { kind: "test_outcome"; target: PlaceId; outcome: TestOutcome; passed: number; failed: number }
  | { kind: "spawn_gremlin"; gremlinId: string; target: PlaceId }
  | { kind: "chase"; gremlinId: string; target: PlaceId }
  | { kind: "banish"; gremlinId: string }
  | { kind: "summon_helper"; helperId: string; label?: string }
  | { kind: "dismiss_helper"; helperId: string; ok: boolean }
  | { kind: "blocked_on_you"; reason: "permission" | "question" }
  | { kind: "your_turn" }
  | { kind: "stumble"; retrying: boolean }
  | { kind: "celebrate"; target?: PlaceId }
  | { kind: "idle" }
  | { kind: "unverified_claim"; gremlinId: string };

export type Beat = BeatBase & BeatBody;
export type BeatKind = BeatBody["kind"];

export interface DirectorOptions {
  /** Longest real gap carried into the scene, ms. Default 2500. */
  maxGapMs?: number;
  /** ms per grid cell of walking. Default 90. */
  walkMsPerCell?: number;
  /** Errors / failing runs inside this window → `lost`. Default 90_000 ms real time. */
  lostWindowMs?: number;
}
