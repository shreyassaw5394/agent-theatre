/**
 * Tiny synth over the Web Audio API. Every sound in Agent Theatre is made
 * here at runtime — there are no audio files in the repo (tests/no-assets
 * enforces it). Starts only after a user gesture, as browsers require.
 */
export type Wave = OscillatorType;
export interface ToneOpts { type?: Wave; attack?: number; decay?: number; gain?: number; pan?: number; detune?: number; slideTo?: number; lowpass?: number }

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private ambBus: GainNode | null = null;
  private duck = 0;
  private _muted = false;
  private _volume = 0.6;
  private _ambience = true;
  get ambienceEnabled(): boolean { return this._ambience; }
  private quietGain = 1;
  setAmbienceEnabled(on: boolean): void { this._ambience = on; this.applyAmbience(); }
  /** 1 = full, 0.35 = thinking, 0.12 = quiet. Long ramp so it reads as the room settling, not a cut. */
  setQuietGain(g: number): void { this.quietGain = g; this.applyAmbience(3); }
  private applyAmbience(ramp = 0.1): void { if (this.ambBus && this.ctx) this.ambBus.gain.setTargetAtTime(this._ambience ? 0.35 * this.quietGain : 0, this.ctx.currentTime, ramp); }
  private noiseBuf: AudioBuffer | null = null;

  get ready(): boolean { return !!this.ctx && this.ctx.state === "running"; }
  get muted(): boolean { return this._muted; }
  get volume(): number { return this._volume; }

  /** Call from a user gesture. Idempotent. */
  async arm(): Promise<void> {
    if (!this.ctx) {
      const AC = globalThis.AudioContext ?? (globalThis as any).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.sfxBus = this.ctx.createGain();
      this.ambBus = this.ctx.createGain();
      this.sfxBus.connect(this.master); this.ambBus.connect(this.master); this.master.connect(this.ctx.destination);
      this.ambBus.gain.value = this._ambience ? 0.35 : 0;
      this.applyGain();
      const len = this.ctx.sampleRate * 2;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }
  setMuted(m: boolean): void { this._muted = m; this.applyGain(); }
  setVolume(v: number): void { this._volume = Math.max(0, Math.min(1, v)); this.applyGain(); }
  /** "Effects off" silences only the effects bus; ambience has its own toggle and keeps playing. */
  private applyGain(): void {
    if (!this.ctx) return;
    if (this.master) this.master.gain.setTargetAtTime(this._volume, this.ctx.currentTime, 0.02);
    if (this.sfxBus) this.sfxBus.gain.setTargetAtTime(this._muted ? 0 : 1, this.ctx.currentTime, 0.02);
  }

  /** Lower the ambience briefly so an effect reads clearly. */
  private duckAmbience(amount = 0.5, ms = 350): void {
    if (!this.ambBus || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.ambBus.gain.cancelScheduledValues(t);
    if (!this._ambience) return;
    this.ambBus.gain.setTargetAtTime(0.35 * (1 - amount), t, 0.01);
    this.ambBus.gain.setTargetAtTime(0.35, t + ms / 1000, 0.12);
    this.duck++;
  }

  tone(freq: number, dur: number, o: ToneOpts = {}): void {
    if (!this.ready || !this.ctx || !this.sfxBus) return;
    const c = this.ctx, t = c.currentTime;
    const osc = c.createOscillator(); osc.type = o.type ?? "sine"; osc.frequency.setValueAtTime(freq, t);
    if (o.detune) osc.detune.value = o.detune;
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slideTo), t + dur);
    const g = c.createGain(); const a = o.attack ?? 0.005, dcy = o.decay ?? dur;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.gain ?? 0.25, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dcy);
    let node: AudioNode = osc;
    if (o.lowpass) { const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = o.lowpass; osc.connect(f); node = f; }
    const p = c.createStereoPanner(); p.pan.value = o.pan ?? 0;
    node.connect(g); g.connect(p); p.connect(this.sfxBus);
    osc.start(t); osc.stop(t + a + dcy + 0.05);
    this.duckAmbience(0.35, (a + dcy) * 1000);
  }
  noise(dur: number, o: { gain?: number; filter?: BiquadFilterType; freq?: number; q?: number; sweepTo?: number; pan?: number; attack?: number } = {}): void {
    if (!this.ready || !this.ctx || !this.sfxBus || !this.noiseBuf) return;
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = o.filter ?? "bandpass"; f.frequency.setValueAtTime(o.freq ?? 1200, t); f.Q.value = o.q ?? 0.8;
    if (o.sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.sweepTo), t + dur);
    const g = c.createGain(); const a = o.attack ?? 0.004;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.gain ?? 0.12, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = c.createStereoPanner(); p.pan.value = o.pan ?? 0;
    src.connect(f); f.connect(g); g.connect(p); p.connect(this.sfxBus);
    src.start(t); src.stop(t + dur + 0.05);
  }
  /** A sustained pad (ambience); returns a stop function. */
  pad(freqs: number[], gain: number, type: Wave = "sine"): () => void {
    if (!this.ready || !this.ctx || !this.ambBus) return () => {};
    const c = this.ctx, t = c.currentTime, nodes: AudioScheduledSourceNode[] = [];
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 1.5); g.connect(this.ambBus);
    for (const f of freqs) { const o = c.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = (Math.random() - 0.5) * 6; o.connect(g); o.start(t); nodes.push(o); }
    return () => { const tt = c.currentTime; g.gain.cancelScheduledValues(tt); g.gain.setTargetAtTime(0.0001, tt, 0.4); for (const n of nodes) n.stop(tt + 2); };
  }
  /** Looping filtered noise (waves, traffic, hum); returns a stop function. */
  wash(freq: number, q: number, gain: number, lfoHz = 0.12, lfoDepth = 0.5): () => void {
    if (!this.ready || !this.ctx || !this.ambBus || !this.noiseBuf) return () => {};
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 2);
    const lfo = c.createOscillator(); lfo.frequency.value = lfoHz; const lg = c.createGain(); lg.gain.value = gain * lfoDepth; lfo.connect(lg); lg.connect(g.gain);
    src.connect(f); f.connect(g); g.connect(this.ambBus); src.start(t); lfo.start(t);
    return () => { const tt = c.currentTime; g.gain.setTargetAtTime(0.0001, tt, 0.5); src.stop(tt + 2.5); lfo.stop(tt + 2.5); };
  }
  now(): number { return this.ctx?.currentTime ?? 0; }
  /** A stream of everything the person hears, for recording. */
  captureStream(): MediaStream | null {
    if (!this.ctx || !this.master) return null;
    const dest = this.ctx.createMediaStreamDestination(); this.master.connect(dest); return dest.stream;
  }

  /** One soft melodic note on the ambience bus: gentle attack, long release, a touch of detuned shimmer. */
  note(freq: number, dur: number, gain: number, type: OscillatorType = "sine", pan = 0): void {
    if (!this.ready || !this.ctx || !this.ambBus) return;
    const c = this.ctx, t = c.currentTime;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.12, dur * 0.3)); g.gain.setTargetAtTime(0.0001, t + dur * 0.6, dur * 0.35);
    const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(this.ambBus);
    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = Math.min(6000, freq * 4); lp.connect(g);
    for (const det of [0, 4]) { const o = c.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = det; o.connect(lp); o.start(t); o.stop(t + dur * 1.6); }
    // a quiet octave for body
    const o2 = c.createOscillator(); o2.type = "sine"; o2.frequency.value = freq / 2; const g2 = c.createGain(); g2.gain.value = 0.35; o2.connect(g2); g2.connect(lp); o2.start(t); o2.stop(t + dur * 1.6);
  }

  /** Occasional scene details, all synthesized. Quiet by design; they live on the ambience bus. */
  extra(kind: string, pan = (Math.random() - 0.5) * 1.2): void {
    if (!this.ready || !this.ctx || !this.ambBus) return;
    const c = this.ctx, t = c.currentTime;
    const osc = (type: OscillatorType, f0: number, f1: number, dur: number, gain: number, attack = 0.01) => {
      const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const p = c.createStereoPanner(); p.pan.value = pan; o.connect(g); g.connect(p); p.connect(this.ambBus!); o.start(t); o.stop(t + dur + 0.05);
    };
    const noise = (hz: number, q: number, dur: number, gain: number, sweepTo?: number, type: BiquadFilterType = "bandpass") => {
      if (!this.noiseBuf) return;
      const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
      const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(hz, t); if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur); f.Q.value = q;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const p = c.createStereoPanner(); p.pan.value = pan; s.connect(f); f.connect(g); g.connect(p); p.connect(this.ambBus!); s.start(t); s.stop(t + dur + 0.05);
    };
    switch (kind) {
      case "gull": osc("sine", 1800, 1100, 0.35, 0.05, 0.03); setTimeout(() => osc("sine", 1700, 1250, 0.3, 0.04, 0.03), 260); return;
      case "cricket": for (let i = 0; i < 6; i++) setTimeout(() => osc("sine", 4200, 4100, 0.04, 0.02), i * 70); return;
      case "bell": osc("sine", 880, 870, 2.2, 0.06, 0.005); osc("sine", 1760, 1740, 1.4, 0.03, 0.005); osc("sine", 2640, 2600, 0.8, 0.015, 0.005); return;
      case "bubble": osc("sine", 300 + Math.random() * 300, 900 + Math.random() * 600, 0.18, 0.04, 0.01); return;
      case "wind": noise(500 + Math.random() * 400, 0.5, 2.5 + Math.random() * 2, 0.05, 300 + Math.random() * 300); return;
      case "horn": osc("sawtooth", 180, 176, 0.8, 0.03, 0.08); return;
      case "hum": osc("sine", 60, 60, 2.5, 0.03, 0.4); return;
      case "chime": [1046.5, 1318.5, 1568][Math.floor(Math.random() * 3)]!; osc("sine", 1318.5, 1316, 1.2, 0.035, 0.005); return;
      case "owl": osc("sine", 420, 380, 0.5, 0.04, 0.05); setTimeout(() => osc("sine", 400, 360, 0.6, 0.035, 0.05), 420); return;
      case "rumble": noise(90, 1.2, 2.5, 0.09, 60, "lowpass"); return;
      case "drip": osc("sine", 1200, 600, 0.12, 0.04, 0.003); return;
      case "market": for (let i = 0; i < 4; i++) setTimeout(() => noise(600 + Math.random() * 1200, 2, 0.12, 0.02), i * 120); return;
    }
  }
}
