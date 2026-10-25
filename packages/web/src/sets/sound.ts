import type { SetId } from "./types.js";

/**
 * Each stage has its own sound: a voice for effects (wave, pitch, decay, the
 * surface underfoot) and an ambience recipe (beds + occasional synthesized
 * extras). All synthesized; nothing shipped. Keyed by set id so the art and
 * the sound of a stage are defined side by side without coupling files.
 */
export type Surface = "grass" | "stone" | "metal" | "sand" | "snow" | "wood" | "water" | "neon";
export type Extra = "gull" | "cricket" | "bell" | "bubble" | "wind" | "horn" | "hum" | "chime" | "owl" | "rumble" | "drip" | "market";

export interface SetVoice {
  /** Oscillator family for melodic effects. */
  wave: OscillatorType;
  /** Multiplies every effect's pitch (0.8 = warmer, 1.25 = brighter). */
  pitch: number;
  /** Multiplies decays (1.6 = roomy, 0.7 = tight). */
  decay: number;
  /** Lowpass ceiling for effects, Hz. */
  tone: number;
  surface: Surface;
}
export interface SetAmbience {
  washes: Array<{ hz: number; q: number; gain: number; lfoHz: number; depth: number }>;
  pad?: { chord: number[]; gain: number; wave: OscillatorType };
  extras: Extra[];
  /** Mean seconds between extras. */
  every: number;
}
export interface SetSound { voice: SetVoice; ambience: SetAmbience }

const organic: SetVoice = { wave: "triangle", pitch: 1, decay: 1, tone: 3200, surface: "grass" };
const electric: SetVoice = { wave: "square", pitch: 1.18, decay: 0.8, tone: 2600, surface: "metal" };
const urban: SetVoice = { wave: "sawtooth", pitch: 0.95, decay: 1.1, tone: 2200, surface: "stone" };

export const SOUND: Record<SetId, SetSound> = {
  island:      { voice: organic, ambience: { washes: [{ hz: 520, q: 0.6, gain: 0.09, lfoHz: 0.11, depth: 0.6 }, { hz: 240, q: 0.9, gain: 0.05, lfoHz: 0.07, depth: 0.8 }], extras: ["gull", "cricket"], every: 9 } },
  orbit:       { voice: electric, ambience: { washes: [{ hz: 900, q: 2, gain: 0.015, lfoHz: 0.05, depth: 0.9 }], pad: { chord: [55, 110, 164.8], gain: 0.05, wave: "sine" }, extras: ["hum", "chime"], every: 11 } },
  metropolis:  { voice: urban, ambience: { washes: [{ hz: 380, q: 0.5, gain: 0.07, lfoHz: 0.2, depth: 0.5 }], pad: { chord: [65.4, 98], gain: 0.03, wave: "triangle" }, extras: ["horn", "hum"], every: 10 } },
  harbour:     { voice: { ...organic, surface: "wood", decay: 1.3 }, ambience: { washes: [{ hz: 420, q: 0.6, gain: 0.1, lfoHz: 0.09, depth: 0.7 }], extras: ["gull", "bell", "horn"], every: 8 } },
  observatory: { voice: { ...electric, wave: "sine", pitch: 1.3, decay: 1.6, tone: 4000, surface: "stone" }, ambience: { washes: [{ hz: 300, q: 0.8, gain: 0.04, lfoHz: 0.04, depth: 0.9 }], pad: { chord: [49, 98, 146.8], gain: 0.04, wave: "sine" }, extras: ["wind", "chime"], every: 12 } },
  greenhouse:  { voice: { ...organic, pitch: 1.1, decay: 1.2 }, ambience: { washes: [{ hz: 600, q: 0.6, gain: 0.05, lfoHz: 0.1, depth: 0.5 }], extras: ["cricket", "drip", "bell"], every: 7 } },
  workshop:    { voice: { ...organic, wave: "triangle", pitch: 0.9, decay: 0.8, tone: 2800, surface: "wood" }, ambience: { washes: [{ hz: 500, q: 0.6, gain: 0.05, lfoHz: 0.12, depth: 0.5 }], extras: ["cricket", "bell"], every: 9 } },
  arcade:      { voice: { wave: "square", pitch: 1.35, decay: 0.6, tone: 3600, surface: "neon" }, ambience: { washes: [{ hz: 300, q: 0.5, gain: 0.05, lfoHz: 0.25, depth: 0.4 }], pad: { chord: [65.4, 82.4, 98], gain: 0.03, wave: "square" }, extras: ["chime", "horn"], every: 6 } },
  kingdom:     { voice: { ...organic, wave: "triangle", pitch: 0.85, decay: 1.5, tone: 2400, surface: "stone" }, ambience: { washes: [{ hz: 450, q: 0.6, gain: 0.07, lfoHz: 0.1, depth: 0.6 }], extras: ["bell", "wind", "owl"], every: 10 } },
  outpost:     { voice: { ...organic, pitch: 0.92, decay: 1.4, tone: 2600, surface: "sand" }, ambience: { washes: [{ hz: 700, q: 0.4, gain: 0.08, lfoHz: 0.06, depth: 0.9 }], extras: ["wind", "hum"], every: 9 } },
  snowfield:   { voice: { ...organic, wave: "sine", pitch: 1.15, decay: 1.7, tone: 3400, surface: "snow" }, ambience: { washes: [{ hz: 800, q: 0.4, gain: 0.05, lfoHz: 0.05, depth: 0.9 }], extras: ["wind", "chime", "owl"], every: 11 } },
  canopy:      { voice: { ...organic, pitch: 1.05, decay: 1.2, tone: 3000, surface: "wood" }, ambience: { washes: [{ hz: 650, q: 0.7, gain: 0.07, lfoHz: 0.09, depth: 0.5 }], extras: ["cricket", "owl", "drip"], every: 6 } },
  lagoon:      { voice: { ...organic, wave: "sine", pitch: 1.2, decay: 1.3, tone: 3600, surface: "sand" }, ambience: { washes: [{ hz: 480, q: 0.6, gain: 0.1, lfoHz: 0.1, depth: 0.7 }], extras: ["gull", "bubble"], every: 8 } },
  volcano:     { voice: { wave: "sawtooth", pitch: 0.75, decay: 1.6, tone: 1600, surface: "stone" }, ambience: { washes: [{ hz: 160, q: 1, gain: 0.1, lfoHz: 0.08, depth: 0.8 }], pad: { chord: [41.2, 61.7], gain: 0.04, wave: "sawtooth" }, extras: ["rumble", "wind"], every: 8 } },
  cloudtop:    { voice: { ...organic, wave: "sine", pitch: 1.25, decay: 1.8, tone: 4200, surface: "grass" }, ambience: { washes: [{ hz: 900, q: 0.4, gain: 0.05, lfoHz: 0.04, depth: 0.9 }], pad: { chord: [130.8, 196, 261.6], gain: 0.025, wave: "sine" }, extras: ["wind", "chime"], every: 12 } },
  reef:        { voice: { wave: "sine", pitch: 0.9, decay: 1.9, tone: 1400, surface: "water" }, ambience: { washes: [{ hz: 220, q: 1.2, gain: 0.09, lfoHz: 0.09, depth: 0.7 }], extras: ["bubble", "drip"], every: 5 } },
  bazaar:      { voice: { ...organic, pitch: 1.05, decay: 0.9, tone: 3000, surface: "sand" }, ambience: { washes: [{ hz: 500, q: 0.5, gain: 0.06, lfoHz: 0.3, depth: 0.4 }], extras: ["market", "bell", "chime"], every: 6 } },
  monastery:   { voice: { ...organic, wave: "sine", pitch: 0.95, decay: 2, tone: 2600, surface: "stone" }, ambience: { washes: [{ hz: 420, q: 0.5, gain: 0.05, lfoHz: 0.05, depth: 0.8 }], extras: ["bell", "wind", "owl"], every: 12 } },
  moonbase:    { voice: { ...electric, pitch: 1.05, decay: 1.2, tone: 2200 }, ambience: { washes: [{ hz: 240, q: 1.5, gain: 0.03, lfoHz: 0.03, depth: 0.9 }], pad: { chord: [55, 82.4], gain: 0.04, wave: "sine" }, extras: ["hum", "chime"], every: 13 } },
  lanterns:    { voice: { ...urban, wave: "triangle", pitch: 1.1, decay: 1.2, tone: 3000, surface: "stone" }, ambience: { washes: [{ hz: 400, q: 0.5, gain: 0.05, lfoHz: 0.2, depth: 0.5 }], extras: ["market", "chime", "bell"], every: 6 } },
};
