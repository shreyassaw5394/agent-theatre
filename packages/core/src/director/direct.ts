import type { AgentEvent } from "../events/types.js";
import { isTestPath } from "../adapters/paths.js";
import type { Place, PlaceId, World } from "../world/types.js";
import { kindOf } from "../world/relevance.js";
import { MoodTracker } from "./mood.js";
import type { ActorId, Beat, BeatBody, DirectorOptions, TestOutcome } from "./types.js";

/**
 * Turns AgentEvents into a Beat timeline against a World. Incremental: `feed`
 * returns only the new beats, so live mode streams and replay pre-computes.
 *
 * Honesty rules: every beat traces to events (`sourceEventIds`); nothing is
 * invented to look busy; the claim check is deterministic and test-gated.
 */
export class Director {
  private readonly places = new Map<PlaceId, Place>();
  private readonly byPath = new Map<string, Place>();
  private readonly beacons: Place[];
  private readonly forge: Place;
  private readonly dock: Place;
  private readonly maxGap: number;
  private readonly msPerCell: number;
  private readonly mood: MoodTracker;

  private beats: Beat[] = [];
  private sceneMs = 0;
  private lastRealTs: number | null = null;
  private seq = 0;
  private readonly actorAt = new Map<ActorId, PlaceId>();
  private readonly helpers = new Map<string, { label?: string }>();
  private readonly gremlins = new Map<string, PlaceId>(); // gremlinId -> place
  private lastEdited: Place | null = null;
  private pendingBeacon: Place | null = null;
  private editedSinceTurn = false;
  private verifiedSinceEdit = false;
  private everVerified = false;
  private claimGremlin: string | null = null;

  constructor(private readonly world: World, opts: DirectorOptions = {}) {
    for (const p of world.places) {
      this.places.set(p.id, p);
      if (p.path) this.byPath.set(p.path, p);
    }
    this.beacons = world.places.filter((p) => p.kind === "beacon");
    this.forge = world.places.find((p) => p.kind === "forge") ?? world.places[0]!;
    this.dock = world.places.find((p) => p.kind === "dock") ?? this.forge;
    this.maxGap = opts.maxGapMs ?? 2500;
    this.msPerCell = opts.walkMsPerCell ?? 150; // a stroll, not a glide: ~6-7 cells per second
    this.mood = new MoodTracker(opts.lostWindowMs ?? 90_000);
    this.actorAt.set("pip", this.forge.id);
  }

  get timeline(): readonly Beat[] { return this.beats; }

  feed(e: AgentEvent): Beat[] {
    const start = this.beats.length;
    this.advanceClock(e.ts, e.id);
    const actor: ActorId = e.agentId && this.helpers.has(e.agentId) ? e.agentId : "pip";
    switch (e.kind) {
      case "session_start":
        this.emit(e, actor, { kind: "curtain_up", repoId: e.repoId }, 1200);
        break;
      case "read_file": {
        const p = this.placeFor(e.path, e, actor);
        this.walk(e, actor, p);
        this.emit(e, actor, { kind: "read", target: p.id }, clamp(700 + (e.bytes ?? 400) / 4, 900, 1800), this.mood.onRead());
        break;
      }
      case "edit_file":
      case "write_file": {
        const p = this.placeFor(e.path, e, actor);
        this.walk(e, actor, p);
        const lines = e.kind === "edit_file" ? e.added + e.removed : e.added;
        const intensity = clamp(Math.sqrt(lines / 50), 0.15, 1);
        const g = [...this.gremlins].find(([, at]) => at === p.id);
        if (g) this.emit(e, actor, { kind: "chase", gremlinId: g[0], target: p.id }, 900, this.mood.mood);
        if (e.kind === "write_file" && e.created) this.emit(e, actor, { kind: "raise", target: p.id }, 900, this.mood.onBuild());
        this.emit(e, actor, { kind: "build", target: p.id, intensity }, clamp(600 + intensity * 1900, 800, 2500), this.mood.onBuild());
        this.lastEdited = p;
        this.editedSinceTurn = true;
        this.verifiedSinceEdit = false;
        break;
      }
      case "run_command": {
        if (e.intent === "test") {
          const beacon = this.beaconFor(e.touched);
          this.walk(e, actor, beacon);
          this.pendingBeacon = beacon;
          this.emit(e, actor, { kind: "run_tests", target: beacon.id }, clamp(e.durationMs ?? 1200, 900, 3000), this.mood.mood);
        } else if (e.intent === "search") {
          this.emit(e, actor, { kind: "search", scope: "repo" }, 700, this.mood.onRead());
        } else if (e.touched.length === 0 || e.intent === "git" || e.intent === "install" || e.intent === "build") {
          this.walk(e, actor, this.forge);
          const intensity = e.intent === "build" || e.intent === "install" ? 0.8 : e.intent === "git" ? 0.4 : 0.5;
          this.emit(e, actor, { kind: "forge", intensity }, clamp(e.durationMs ?? 800, 700, 2000), this.mood.mood);
        }
        // write_file / read_file intents are followed by their own file events; no extra beat.
        if (!e.ok && e.intent !== "test") this.emit(e, actor, { kind: "stumble", retrying: false }, 600, this.mood.onError(e.ts));
        break;
      }
      case "test_result": {
        const beacon = this.pendingBeacon ?? this.beaconFor([]);
        this.pendingBeacon = null;
        // unknown runner with no counts: a non-zero exit is a fail; a zero exit is unknown (no celebration, no evidence)
        const outcome: TestOutcome = e.framework === "unknown" && e.passed === 0 && e.failed === 0 ? (e.ok ? "unknown" : "fail") : e.ok ? "pass" : "fail";
        if (outcome === "pass") {
          this.emit(e, actor, { kind: "test_outcome", target: beacon.id, outcome, passed: e.passed, failed: e.failed }, 800, this.mood.onPass());
          if (e.passed > 0) { this.verifiedSinceEdit = true; this.everVerified = true; } // evidence is a counted pass, never a bare zero exit
          for (const [gid] of this.gremlins) this.emit(e, actor, { kind: "banish", gremlinId: gid }, 700, "happy");
          this.gremlins.clear();
          if (this.claimGremlin) { this.emit(e, actor, { kind: "banish", gremlinId: this.claimGremlin }, 700, "happy"); this.claimGremlin = null; }
          this.emit(e, actor, { kind: "celebrate", target: beacon.id }, 1600, "happy");
        } else {
          this.emit(e, actor, { kind: "test_outcome", target: beacon.id, outcome, passed: e.passed, failed: e.failed }, 800, this.mood.onFail(e.ts));
          const at = this.lastEdited ?? beacon;
          const gid = `g:${e.id}`;
          this.gremlins.set(gid, at.id);
          this.emit(e, actor, { kind: "spawn_gremlin", gremlinId: gid, target: at.id }, 900, this.mood.mood);
        }
        break;
      }
      case "search":
        this.emit(e, actor, { kind: "search", scope: e.scope }, 700, this.mood.onRead());
        break;
      case "subagent_start":
        this.helpers.set(e.childId, e.label ? { label: e.label } : {});
        this.actorAt.set(e.childId, this.dock.id);
        this.emit(e, "pip", { kind: "summon_helper", helperId: e.childId, ...(e.label ? { label: e.label } : {}) }, 1400, this.mood.mood);
        break;
      case "subagent_stop":
        if (this.helpers.has(e.childId)) {
          this.emit(e, e.childId, { kind: "dismiss_helper", helperId: e.childId, ok: e.ok }, 1000, this.mood.mood);
          this.helpers.delete(e.childId);
          this.actorAt.delete(e.childId);
        }
        break;
      case "waiting_for_user":
        if (e.reason === "idle") this.emit(e, actor, { kind: "your_turn" }, 1000, this.mood.mood);
        else this.emit(e, actor, { kind: "blocked_on_you", reason: e.reason }, 1200, this.mood.mood);
        break;
      case "error":
        this.emit(e, actor, { kind: "stumble", retrying: e.retrying }, 700, this.mood.onError(e.ts));
        break;
      case "turn_end": {
        if (e.claimedSuccess && this.editedSinceTurn && !this.verifiedSinceEdit) {
          const gid = `claim:${e.id}`;
          this.claimGremlin = gid;
          this.emit(e, actor, { kind: "unverified_claim", gremlinId: gid }, 1400, this.mood.onClaimUnverified());
        }
        this.editedSinceTurn = false;
        this.emit(e, actor, { kind: "your_turn", ...(e.note ? { note: e.note } : {}) }, 1000, this.mood.mood);
        break;
      }
      case "session_end":
        this.emit(e, actor, { kind: "curtain_down", verified: this.everVerified && !this.claimGremlin }, 1500, this.mood.mood);
        break;
    }
    return this.beats.slice(start);
  }

  // ---- internals ----
  private advanceClock(ts: number, eventId: string): void {
    if (this.lastRealTs !== null) {
      const lastEnd = this.beats.length ? Math.max(...this.beats.slice(-3).map((b) => b.atMs + b.durationMs)) : this.sceneMs;
      const gap = Math.min(Math.max(0, ts - this.lastRealTs), this.maxGap);
      const target = Math.max(lastEnd, this.sceneMs) + gap;
      if (target - lastEnd >= 1000) {
        const idle: Beat = { id: `b${this.seq++}`, atMs: lastEnd, durationMs: target - lastEnd, realTs: this.lastRealTs, mood: this.mood.mood, actor: "pip", sourceEventIds: [eventId], kind: "idle" };
        this.beats.push(idle);
      }
      this.sceneMs = Math.max(this.sceneMs, target);
    }
    this.lastRealTs = ts;
  }

  private emit(e: AgentEvent, actor: ActorId, body: BeatBody, durationMs: number, mood = this.mood.mood): Beat {
    durationMs = Math.round(durationMs);
    if ("intensity" in body) body = { ...body, intensity: Math.round(body.intensity * 1000) / 1000 };
    const b: Beat = { id: `b${this.seq++}`, atMs: Math.round(this.sceneMs), durationMs, realTs: e.ts, mood, actor, sourceEventIds: [e.id], ...body };
    this.beats.push(b);
    this.sceneMs += durationMs;
    return b;
  }

  private walk(e: AgentEvent, actor: ActorId, to: Place): void {
    const fromId = this.actorAt.get(actor) ?? this.forge.id;
    if (fromId === to.id) return;
    const from = this.places.get(fromId) ?? this.forge;
    const cells = Math.hypot(to.gx - from.gx, to.gy - from.gy);
    this.emit(e, actor, { kind: "walk_to", target: to.id }, clamp(Math.round(cells * this.msPerCell), 700, 3500));
    this.actorAt.set(actor, to.id);
  }

  private raised = 0;
  /** Known place; else the district's overflow building; else (bounded) a new one raised for a file created mid-session. */
  private placeFor(path: string, e: AgentEvent, actor: ActorId): Place {
    const known = this.byPath.get(path);
    if (known) return known;
    const top = path.includes("/") ? path.slice(0, path.indexOf("/")) : "";
    const overflow = this.byPath.get(`${top ? top + "/" : ""}…`);
    if (overflow && (this.raised >= 24 || !this.world.stats.capped === false)) return overflow;
    if (this.raised >= 24) return overflow ?? this.forge;
    this.raised++;
    const district = this.world.districts.find((d) => d.id === `d:${top}`) ?? this.world.districts[0];
    const anchor = district ? { gx: district.cx, gy: district.cy } : { gx: this.forge.gx + 3, gy: this.forge.gy };
    const place: Place = { id: `p:${path}`, kind: kindOf(path), path, label: path.slice(path.lastIndexOf("/") + 1), district: district?.id ?? "", gx: anchor.gx, gy: anchor.gy, footprint: 1, height: 1, score: 0, touched: true };
    this.places.set(place.id, place);
    this.byPath.set(path, place);
    if (place.kind === "beacon") this.beacons.push(place);
    this.emit(e, actor, { kind: "raise", target: place.id, newPlace: { path, label: place.label, kind: place.kind, district: place.district } }, 900);
    return place;
  }

  /** The beacon a test run belongs to: an explicitly touched test file, else the last-edited district's, else the first, else the forge. */
  private beaconFor(touched: string[]): Place {
    const t = touched.find((p) => isTestPath(p));
    if (t) { const b = this.byPath.get(t); if (b) return b; }
    if (this.lastEdited) {
      const same = this.beacons.find((b) => b.district === this.lastEdited!.district);
      if (same) return same;
    }
    return this.beacons[0] ?? this.forge;
  }
}

/** Convenience for replay: the whole timeline at once. */
export function direct(events: AgentEvent[], world: World, opts?: DirectorOptions): Beat[] {
  const d = new Director(world, opts);
  for (const e of events) d.feed(e);
  return [...d.timeline];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
