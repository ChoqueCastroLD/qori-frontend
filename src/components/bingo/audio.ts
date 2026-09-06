// AUDIO ------------------------------------------------------------------------
// Voice calls ("B", "doce", "B doce") stay stubbed until the pre-generated
// ElevenLabs clips land. SFX are synthesized on the fly with the Web Audio API
// (no assets, tiny, satisfying) so daubs/marks/hits already feel good. The
// AudioContext is created lazily and resumes on the first user gesture (browsers
// block autoplay until then), so click-driven sounds always work.

import type { BingoLetter } from "./types";

let ctx: AudioContext | null = null;
let muted = false;
let volume = 0.7; // master 0..1

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

/** Play a short envelope of tones (an arpeggio when more than one freq). */
function blip(freqs: number[], dur = 0.12, type: OscillatorType = "sine", gain = 0.06): void {
  const c = ac();
  if (!c || muted || volume <= 0) return;
  const t0 = c.currentTime;
  const peak = Math.max(0.0002, gain * volume);
  freqs.forEach((f, i) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = f;
    const start = t0 + i * 0.05;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g);
    g.connect(c.destination);
    o.start(start);
    o.stop(start + dur + 0.03);
  });
}

export function setMuted(m: boolean): void {
  muted = m;
}
export function isMuted(): boolean {
  return muted;
}
/** Master volume 0..1 (applied to every SFX; 0 = silent). */
export function setVolume(v: number): void {
  volume = Math.max(0, Math.min(1, v));
}

/** Play a pre-generated voice clip (ElevenLabs), respecting mute + master volume. */
function playClip(src: string, gain = 1): void {
  if (typeof window === "undefined" || muted || volume <= 0) return;
  try {
    const a = new Audio(src);
    a.volume = Math.max(0, Math.min(1, volume * gain));
    a.play().catch(() => {});
  } catch { /* ignore */ }
}

/** Beat 1 - the letter is revealed alone (visual only; the voice is the call). */
export function playLetter(letter: BingoLetter): void {
  void letter;
}

/** Beat 2 - the number joins the letter (visual only). */
export function playNumber(number: number): void {
  void number;
}

/** Beat 3 - the full spoken call ("Be, veintiocho") from /audio/bingo/{letter}{n}.mp3. */
export function playCall(letter: BingoLetter, number: number): void {
  playClip(`/audio/bingo/${letter.toLowerCase()}${number}.mp3`);
}

/** Spoken end-of-game line: you won / single winner / tie. */
export function playWin(kind: "you" | "single" | "tie"): void {
  playClip(`/audio/bingo/win-${kind}.mp3`);
}

export type Sfx =
  | "pop" | "mark" | "whoosh" | "bingo" | "tick"
  | "click" | "daub" | "undaub" | "circle" | "hit";

/** Short synthesized SFX. `hit` is the little dopamine arpeggio for "salio tu numero". */
export function playSfx(name: Sfx): void {
  switch (name) {
    case "pop": blip([440], 0.08, "triangle", 0.05); break;
    case "mark": blip([660], 0.07, "sine", 0.05); break;
    case "tick": blip([880], 0.03, "square", 0.03); break;
    case "whoosh": blip([260], 0.1, "sawtooth", 0.03); break;
    case "click": blip([520], 0.045, "square", 0.035); break;
    case "daub": blip([700, 950], 0.09, "sine", 0.05); break;
    case "undaub": blip([460, 320], 0.08, "sine", 0.04); break;
    case "circle": blip([600, 480], 0.07, "triangle", 0.04); break;
    case "hit": blip([660, 880, 1320], 0.16, "sine", 0.06); break; // dopamine
    case "bingo": blip([523, 659, 784, 1046], 0.22, "triangle", 0.07); break;
  }
}
