import type { Mood } from "./types.js";

/**
 * Mood is a small state machine driven only by events — never by a timer, so an
 * idle agent looks idle rather than busy. `lost` needs repeated trouble inside a
 * window; a single failure is `uneasy`.
 */
export class MoodTracker {
  mood: Mood = "curious";
  private trouble: number[] = [];
  constructor(private readonly windowMs: number) {}

  private recordTrouble(ts: number): boolean {
    this.trouble = this.trouble.filter((t) => ts - t <= this.windowMs);
    this.trouble.push(ts);
    return this.trouble.length >= 2;
  }
  onRead(): Mood { return (this.mood = this.mood === "lost" ? "lost" : "curious"); }
  onBuild(): Mood { return (this.mood = this.mood === "lost" ? "lost" : "focused"); }
  onFail(ts: number): Mood { return (this.mood = this.recordTrouble(ts) ? "lost" : "uneasy"); }
  onError(ts: number): Mood { return (this.mood = this.recordTrouble(ts) ? "lost" : "uneasy"); }
  onPass(): Mood { this.trouble = []; return (this.mood = "happy"); }
  onClaimUnverified(): Mood { return (this.mood = "uneasy"); }
}
