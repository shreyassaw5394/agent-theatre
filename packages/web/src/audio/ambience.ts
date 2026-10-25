import type { Mood } from "@agent-theatre/core";
import type { SetTheme } from "../sets/types.js";
import type { AudioEngine } from "./engine.js";
import { SOUND } from "../sets/sound.js";

/** One quiet synthesized bed per set, with a mood-tinted pad underneath. */
export class Ambience {
  private stops: Array<() => void> = [];
  private current: string | null = null;
  private padStop: (() => void) | null = null;
  private padMood: Mood | null = null;
  private extraTimer: ReturnType<typeof setTimeout> | null = null;
  private tuneTimer: ReturnType<typeof setTimeout> | null = null;
  constructor(private readonly a: AudioEngine) {}

  start(theme: SetTheme): void {
    if (!this.a.ready) return;
    if (this.current === theme.id) return;
    this.stop();
    this.current = theme.id;
    const r = SOUND[theme.id].ambience;
    for (const w of r.washes) this.stops.push(this.a.wash(w.hz, w.q, w.gain, w.lfoHz, w.depth));
    if (r.pad) this.stops.push(this.a.pad(r.pad.chord, r.pad.gain, r.pad.wave));
    // occasional details, Poisson-ish spaced so they never feel looped
    const tick = () => { if (this.current !== theme.id) return; const k = r.extras[Math.floor(Math.random() * r.extras.length)]; if (k) this.a.extra(k); this.extraTimer = setTimeout(tick, r.every * 1000 * (0.5 + Math.random())); };
    this.extraTimer = setTimeout(tick, 2000 + Math.random() * 3000);
    // the stage's jingle: a short phrase on its scale, a random walk with a resting note at the end — never the same twice
    const tune = SOUND[theme.id].tune;
    const phrase = () => {
      if (this.current !== theme.id) return;
      const n = 4 + Math.floor(Math.random() * 4);
      let deg = Math.floor(Math.random() * tune.scale.length), oct = Math.random() < 0.3 ? 1 : 0, at = 0;
      for (let i = 0; i < n; i++) {
        const step = i === n - 1 ? -(deg % 3) : Math.round((Math.random() - 0.5) * 4);
        deg += step; if (deg < 0) { deg += tune.scale.length; oct = Math.max(0, oct - 1); } if (deg >= tune.scale.length) { deg -= tune.scale.length; oct = Math.min(1, oct + 1); }
        const freq = tune.root * Math.pow(2, (tune.scale[deg]! + 12 * oct) / 12);
        const len = tune.len[0] + Math.random() * (tune.len[1] - tune.len[0]);
        const dur = i === n - 1 ? len * 2.2 : len;
        setTimeout(() => { if (this.current === theme.id) this.a.note(freq, dur, tune.gain * (0.8 + Math.random() * 0.4), tune.wave, (Math.random() - 0.5) * 0.8); }, at * 1000);
        at += len * (Math.random() < 0.2 ? 1.5 : 1);
      }
      this.tuneTimer = setTimeout(phrase, (at + tune.every * (0.6 + Math.random() * 0.9)) * 1000);
    };
    this.tuneTimer = setTimeout(phrase, 4000 + Math.random() * 4000);
  }
  /** A barely-there chord that follows mood: major when happy, slightly sour when lost. */
  setMood(m: Mood): void {
    if (!this.a.ready || m === this.padMood) return;
    this.padMood = m;
    this.padStop?.();
    const chord = m === "happy" ? [261.6, 329.6, 392] : m === "lost" ? [261.6, 311.1, 370] : m === "uneasy" ? [261.6, 311.1, 392] : m === "focused" ? [261.6, 392] : [261.6, 329.6];
    this.padStop = this.a.pad(chord.map((f) => f / 2), 0.022, "sine");
  }
  stop(): void { if (this.extraTimer) clearTimeout(this.extraTimer); this.extraTimer = null; if (this.tuneTimer) clearTimeout(this.tuneTimer); this.tuneTimer = null; for (const s of this.stops) s(); this.stops = []; this.padStop?.(); this.padStop = null; this.padMood = null; this.current = null; }
}
