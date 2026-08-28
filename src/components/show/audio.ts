// Web Audio synthesis for the show — no audio files. All sounds are built
// from oscillators + seeded noise buffers. The AudioContext is only created
// after a user gesture (ensure()); every call is guarded so a missing/blocked
// audio stack can never break the show.

import { mulberry32 } from "./shared";

export class ShowAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  muted = false;

  ensure() {
    try {
      if (!this.ctx) {
        const AC: typeof AudioContext | undefined = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.5;
        this.master.connect(this.ctx.destination);
        // 1s noise buffer from a deterministic PRNG (no Math.random anywhere).
        const n = this.ctx.sampleRate;
        this.noise = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        const r = mulberry32(0xc0ffee);
        for (let i = 0; i < n; i++) d[i] = r() * 2 - 1;
      }
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    } catch { /* audio unavailable: stay silent */ }
  }

  setMuted(m: boolean) {
    this.muted = m;
    try { if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.02); } catch {}
  }

  private ready(): boolean {
    return !!this.ctx && !!this.master && !this.muted && this.ctx.state === "running";
  }

  private tone(freq0: number, freq1: number, dur: number, type: OscillatorType, gain: number, when = 0) {
    try {
      if (!this.ready()) return;
      const t = this.ctx!.currentTime + when;
      const o = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(1, freq1), t + dur);
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.master!);
      o.start(t); o.stop(t + dur + 0.02);
    } catch {}
  }

  private hiss(dur: number, gain: number, filterFreq: number, type: BiquadFilterType = "lowpass", when = 0, sweepTo?: number) {
    try {
      if (!this.ready() || !this.noise) return;
      const t = this.ctx!.currentTime + when;
      const src = this.ctx!.createBufferSource();
      src.buffer = this.noise; src.loop = true;
      const f = this.ctx!.createBiquadFilter();
      f.type = type;
      f.frequency.setValueAtTime(filterFreq, t);
      if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
      const g = this.ctx!.createGain();
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(this.master!);
      src.start(t); src.stop(t + dur + 0.02);
    } catch {}
  }

  blip() { this.tone(660, 990, 0.08, "square", 0.12); }
  tick() { this.tone(1400, 900, 0.045, "square", 0.07); }
  zap() { this.tone(1800, 120, 0.16, "sawtooth", 0.16); this.hiss(0.1, 0.1, 4000, "highpass"); }
  whoosh() { this.hiss(0.35, 0.22, 300, "bandpass", 0, 2400); }
  thud() { this.tone(160, 45, 0.22, "sine", 0.4); this.hiss(0.12, 0.12, 500); }
  boom(big = false) {
    this.tone(big ? 130 : 100, 28, big ? 0.6 : 0.35, "sine", big ? 0.7 : 0.45);
    this.hiss(big ? 0.7 : 0.4, big ? 0.4 : 0.25, big ? 900 : 700, "lowpass", 0, 90);
  }
  alarm() { this.tone(620, 620, 0.12, "square", 0.12); this.tone(470, 470, 0.12, "square", 0.12, 0.14); }
  ding() { this.tone(1320, 1320, 0.35, "sine", 0.2); this.tone(1980, 1980, 0.3, "sine", 0.08, 0.01); }
  gallop() { this.tone(220, 140, 0.05, "triangle", 0.12); this.tone(180, 120, 0.05, "triangle", 0.1, 0.09); }
  heartbeat() { this.tone(95, 55, 0.13, "sine", 0.5); this.tone(85, 50, 0.16, "sine", 0.42, 0.17); }
  riser(dur = 1.2) { this.tone(120, 1000, dur, "sawtooth", 0.13); this.hiss(dur, 0.1, 400, "bandpass", 0, 3200); }
  chime() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => { this.tone(f, f, 0.7, "sine", 0.16, i * 0.13); this.tone(f * 2, f * 2, 0.4, "sine", 0.05, i * 0.13); });
    this.hiss(0.9, 0.06, 6000, "highpass", 0.1);
  }
}

let bus: ShowAudio | null = null;
export function getShowAudio(): ShowAudio {
  if (!bus) bus = new ShowAudio();
  return bus;
}
