import type { Mood } from "@agent-theatre/core";
import type { SetTheme } from "../sets/types.js";
import type { AudioEngine } from "./engine.js";

/** One quiet synthesized bed per set, with a mood-tinted pad underneath. */
export class Ambience {
  private stops: Array<() => void> = [];
  private current: string | null = null;
  private padStop: (() => void) | null = null;
  private padMood: Mood | null = null;
  constructor(private readonly a: AudioEngine) {}

  start(theme: SetTheme): void {
    if (!this.a.ready) return;
    if (this.current === theme.id) return;
    this.stop();
    this.current = theme.id;
    if (theme.id === "island") { this.stops.push(this.a.wash(520, 0.6, 0.09, 0.11, 0.6)); this.stops.push(this.a.wash(240, 0.9, 0.05, 0.07, 0.8)); }
    else if (theme.id === "orbit") { this.stops.push(this.a.pad([55, 110, 164.8], 0.05, "sine")); this.stops.push(this.a.wash(900, 2, 0.015, 0.05, 0.9)); }
    else { this.stops.push(this.a.wash(380, 0.5, 0.07, 0.2, 0.5)); this.stops.push(this.a.pad([65.4, 98], 0.03, "triangle")); }
  }
  /** A barely-there chord that follows mood: major when happy, slightly sour when lost. */
  setMood(m: Mood): void {
    if (!this.a.ready || m === this.padMood) return;
    this.padMood = m;
    this.padStop?.();
    const chord = m === "happy" ? [261.6, 329.6, 392] : m === "lost" ? [261.6, 311.1, 370] : m === "uneasy" ? [261.6, 311.1, 392] : m === "focused" ? [261.6, 392] : [261.6, 329.6];
    this.padStop = this.a.pad(chord.map((f) => f / 2), 0.022, "sine");
  }
  stop(): void { for (const s of this.stops) s(); this.stops = []; this.padStop?.(); this.padStop = null; this.padMood = null; this.current = null; }
}
