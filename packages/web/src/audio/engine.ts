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
  setAmbienceEnabled(on: boolean): void { this._ambience = on; if (this.ambBus && this.ctx) this.ambBus.gain.setTargetAtTime(on ? 0.35 : 0, this.ctx.currentTime, 0.1); }
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
  private applyGain(): void { if (this.master) this.master.gain.setTargetAtTime(this._muted ? 0 : this._volume, this.ctx!.currentTime, 0.02); }

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
}
