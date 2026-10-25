import type { Beat, Mood } from "@agent-theatre/core";
import type { SetTheme } from "../sets/types.js";
import type { AudioEngine } from "./engine.js";

/**
 * Every beat kind has a sound. tests/sfx.test.ts fails if one is missing.
 * Density drops at high replay rates so 4× isn't a wall of pings.
 */
export type SfxName = Beat["kind"] | "footstep" | "hammer" | "spark";
const KEY_AT_SPEED = new Set<SfxName>(["curtain_up", "curtain_down", "test_outcome", "celebrate", "blocked_on_you", "unverified_claim", "spawn_gremlin", "banish"]);

const MAJ = [523.25, 659.25, 783.99, 1046.5];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export class Sfx {
  constructor(private readonly a: AudioEngine) {}

  /** Should this sound play at the given playback rate? */
  static plays(name: SfxName, rate: number): boolean { return rate <= 1.01 || KEY_AT_SPEED.has(name as SfxName); }

  play(name: SfxName, ctx: { theme: SetTheme; intensity?: number; mood?: Mood; pan?: number; outcome?: "pass" | "fail" | "unknown"; count?: number } ): void {
    const a = this.a, pan = ctx.pan ?? 0, inten = ctx.intensity ?? 0.5;
    switch (name) {
      case "curtain_up": a.tone(392, 1.2, { attack: 0.3, gain: 0.14 }); a.tone(587.3, 1.3, { attack: 0.5, gain: 0.1 }); a.tone(784, 1.4, { attack: 0.7, gain: 0.08 }); return;
      case "curtain_down": a.tone(523.25, 1.6, { attack: 0.2, gain: 0.12 }); a.tone(392, 1.8, { attack: 0.4, gain: 0.1 }); return;
      case "footstep": a.noise(0.05, { filter: "bandpass", freq: rnd(900, 1300), q: 1.2, gain: 0.05, pan }); return;
      case "walk_to": return; // footsteps are driven by the walk cycle
      case "read": a.noise(0.14, { filter: "highpass", freq: 2500, sweepTo: 6000, gain: 0.07, pan }); a.tone(2200, 0.05, { gain: 0.04, pan }); return;
      case "hammer": a.tone(rnd(180, 240) * (1 + inten * 0.4), 0.06, { type: "triangle", gain: 0.12 + inten * 0.1, slideTo: 90, pan }); a.noise(0.03, { filter: "bandpass", freq: 3000, q: 2, gain: 0.05, pan }); return;
      case "build": return; // hammers are driven by the build rhythm
      case "raise": a.tone(220, 0.7, { type: "sawtooth", slideTo: 660, gain: 0.08, lowpass: 1800, pan }); a.tone(440, 0.3, { gain: 0.06, pan, attack: 0.3 }); return;
      case "forge": a.tone(620, 0.25, { type: "square", gain: 0.06, slideTo: 580, lowpass: 2400, pan }); a.tone(1240, 0.18, { type: "triangle", gain: 0.05, detune: 30, pan }); a.noise(0.08, { filter: "highpass", freq: 4000, gain: 0.04, pan }); return;
      case "spark": a.tone(rnd(2500, 4200), 0.04, { gain: 0.03, pan }); return;
      case "search": a.noise(0.35, { filter: "bandpass", freq: 700, sweepTo: 2600, q: 1.5, gain: 0.08, pan }); a.tone(1568, 0.12, { gain: 0.05, pan, attack: 0.02 }); return;
      case "run_tests": a.tone(330, 0.9, { attack: 0.15, gain: 0.06, type: "triangle", lowpass: 1200, pan }); a.tone(495, 0.9, { attack: 0.25, gain: 0.04, type: "triangle", lowpass: 1200, pan }); return;
      case "test_outcome":
        if (ctx.outcome === "pass") { MAJ.forEach((f, i) => setTimeout(() => a.tone(f, 0.5, { gain: 0.12, attack: 0.01, pan }), i * 70)); }
        else { a.tone(311, 0.35, { type: "sawtooth", gain: 0.09, lowpass: 900, slideTo: 262, pan }); setTimeout(() => a.tone(233, 0.5, { type: "sawtooth", gain: 0.09, lowpass: 700, slideTo: 196, pan }), 170); }
        return;
      case "spawn_gremlin": for (let i = 0; i < 4; i++) setTimeout(() => a.tone(rnd(900, 1300) + i * 80, 0.07, { type: "square", gain: 0.05, lowpass: 2600, slideTo: rnd(700, 1100), pan }), i * 60); return;
      case "chase": for (let i = 0; i < 3; i++) setTimeout(() => a.tone(600 + i * 120, 0.08, { type: "triangle", gain: 0.06, pan }), i * 90); return;
      case "banish": a.noise(0.06, { filter: "lowpass", freq: 1500, gain: 0.14, pan }); setTimeout(() => a.tone(2093, 0.25, { gain: 0.07, pan }), 40); setTimeout(() => a.tone(2637, 0.3, { gain: 0.05, pan }), 90); return;
      case "celebrate": [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => setTimeout(() => a.tone(f, 0.45, { gain: 0.11, attack: 0.01, pan }), i * 60)); for (let i = 0; i < 10; i++) setTimeout(() => a.tone(rnd(1800, 4000), 0.05, { gain: 0.03, pan: rnd(-0.8, 0.8) }), 200 + i * 55); return;
      case "summon_helper":
        if (ctx.theme.id === "orbit") a.noise(0.7, { filter: "bandpass", freq: 300, sweepTo: 1800, q: 1.2, gain: 0.1, pan });
        else if (ctx.theme.id === "metropolis") { a.tone(880, 0.12, { type: "square", gain: 0.06, lowpass: 2500, pan }); setTimeout(() => a.tone(880, 0.12, { type: "square", gain: 0.06, lowpass: 2500, pan }), 180); }
        else { a.tone(146.8, 0.8, { type: "triangle", attack: 0.08, gain: 0.12, lowpass: 800, pan }); a.tone(147.5, 0.8, { type: "triangle", attack: 0.08, gain: 0.08, lowpass: 800, pan }); }
        return;
      case "dismiss_helper": a.noise(0.5, { filter: "bandpass", freq: 1800, sweepTo: 300, q: 1.2, gain: 0.07, pan }); return;
      case "blocked_on_you": a.tone(880, 0.35, { gain: 0.16, attack: 0.01 }); setTimeout(() => a.tone(659.25, 0.6, { gain: 0.16, attack: 0.01 }), 220); return;
      case "your_turn": a.tone(1046.5, 0.5, { gain: 0.07, attack: 0.02 }); return;
      case "stumble": a.noise(0.12, { filter: "lowpass", freq: 400, gain: 0.14, pan }); a.tone(120, 0.25, { type: "triangle", gain: 0.1, slideTo: 70, pan }); return;
      case "unverified_claim": a.tone(196, 0.14, { type: "triangle", gain: 0.07, lowpass: 900, pan }); setTimeout(() => a.tone(185, 0.14, { type: "triangle", gain: 0.07, lowpass: 900, pan }), 240); setTimeout(() => a.tone(174.6, 0.24, { type: "triangle", gain: 0.06, lowpass: 900, pan }), 480); return;
      case "idle": return; // silence is part of the design
    }
  }
}
