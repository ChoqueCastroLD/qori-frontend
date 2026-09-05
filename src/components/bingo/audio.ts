// AUDIO HOOKS (stubs) ---------------------------------------------------------
// The real product will play pre-generated voice clips ("B...", "doce",
// "B doce") hosted as static assets. This module is the single integration
// point: the scene calls these at the exact reveal beats, so wiring audio
// later means implementing the bodies here and nothing else.

import type { BingoLetter } from "./types";

/** Beat 1 - the letter is revealed alone. Play e.g. /audio/bingo/letter-B.mp3 */
export function playLetter(letter: BingoLetter): void {
  // TODO(audio): new Audio(`/audio/bingo/letter-${letter}.mp3`).play()
  void letter;
}

/** Beat 2 - the number joins the letter. Play e.g. /audio/bingo/num-12.mp3 */
export function playNumber(number: number): void {
  // TODO(audio): new Audio(`/audio/bingo/num-${number}.mp3`).play()
  void number;
}

/** Beat 3 - the full call is repeated ("B, doce"). Play the combined clip. */
export function playCall(letter: BingoLetter, number: number): void {
  // TODO(audio): new Audio(`/audio/bingo/call-${letter}-${number}.mp3`).play()
  void letter;
  void number;
}

/** Ambience / SFX hook points (machine rumble, ball pop, mark tick, bingo). */
export function playSfx(name: "pop" | "mark" | "whoosh" | "bingo" | "tick"): void {
  // TODO(audio): map to short pre-generated SFX clips.
  void name;
}
