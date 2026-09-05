// Mock game-state provider + simulated draw loop for the standalone demo.
// The real product replaces this hook with a WebSocket-driven store that
// emits the exact same BingoState shape (see types.ts).

import { useEffect, useMemo, useRef, useState } from "react";
import {
  cardColumns,
  completedLetters,
  hasFullCard,
  letterForNumber,
  markedCount,
  type Ball,
  type BingoCard,
  type BingoLetter,
  type BingoState,
  type ChatMsg,
  type Participant,
} from "./types";
import { playCall, playLetter, playNumber, playSfx } from "./audio";

// Demo cadence: a ball every few seconds so the preview is lively.
// Production uses 18s between balls - only this constant changes.
export const DEMO_INTERVAL_SEC = 9;
export const REAL_INTERVAL_SEC = 18;

// How many tarjetas the demo player owns. Bump to ~30 to preview the
// scrolling grid in the "mis tarjetas" stack.
export const MY_CARDS_COUNT = 14;

export type RevealPhase = null | "flight" | "letter" | "number" | "call";

export type FloatingReaction = { id: number; emoji: string; x: number; userId?: string };

type Listener = (ev: SceneEvent) => void;
export type SceneEvent =
  | { type: "draw"; letter: BingoLetter; number: number }
  | { type: "bingo" }
  | { type: "reset" };

// --- deterministic-ish PRNG so every reload feels alive but coherent -------
function sfc32(a: number, b: number, c: number, d: number) {
  return () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    const r = (t + d) | 0;
    c = (c + r) | 0;
    return (r >>> 0) / 4294967296;
  };
}

function makeRng(seed: number) {
  return sfc32(0x9e3779b9 ^ seed, 0x243f6a88, 0xb7e15162, 0xdeadbeef ^ seed);
}

function shuffled<T>(arr: T[], rnd: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickN(min: number, max: number, n: number, rnd: () => number): number[] {
  const pool: number[] = [];
  for (let i = min; i <= max; i++) pool.push(i);
  return shuffled(pool, rnd).slice(0, n);
}

export function makeCard(rnd: () => number): BingoCard {
  const N = pickN(31, 45, 4, rnd) as (number | null)[];
  N.splice(2, 0, null); // FREE center
  return {
    B: pickN(1, 15, 5, rnd),
    I: pickN(16, 30, 5, rnd),
    N,
    G: pickN(46, 60, 5, rnd),
    O: pickN(61, 75, 5, rnd),
  };
}

// The 24 numbers on a card (FREE center excluded).
function cardNums(card: BingoCard): number[] {
  const out: number[] = [];
  for (const col of cardColumns(card)) for (const v of col) if (v !== null) out.push(v);
  return out;
}

// 0-based index in the ball order at which a card fills completely (its last
// missing number is drawn). Drives the pre-seed so every demo round reaches a
// carton lleno in a handful of suspenseful reveals.
function completionIdx(card: BingoCard, pos: Map<number, number>): number {
  let last = -1;
  for (const n of cardNums(card)) { const p = pos.get(n)!; if (p > last) last = p; }
  return last;
}

const FIRST = [
  "Luz", "Marco", "Vale", "Andres", "Camila", "Diego", "Fer", "Rosa", "Kevin", "Dani",
  "Pau", "Jhon", "Milagros", "Renzo", "Lucia", "Piero", "Ariana", "Gustavo", "Brenda", "Alex",
  "Yesenia", "Cesar", "Fabi", "Ronald", "Karla", "Mateo", "Nicole", "Hugo", "Tania", "Omar",
];
const LAST = [
  "PE", "MX", "CO", "CL", "AR", "BO", "EC", "21", "07", "88", "_x", "Gamer", "Fox", "Star",
  "Rey", "Sol", "Luna", "Pro", "10", "Full",
];

const BOT_LINES = [
  "vamos con ese N!!",
  "me falta uno para la G",
  "jajaja casi",
  "esa bola era mia",
  "suerte a todos",
  "primera vez que juego, esta buenazo",
  "dale dale dale",
  "necesito un 62 porfa",
  "que nervios",
  "el que gana invita",
  "mi tarjeta esta que arde",
  "uy casi canto",
  "vamos qori",
  "otra vez B, no puede ser",
  "yo con dos tarjetas y nada jaja",
  "se viene se viene",
];

const REACTION_EMOJIS = ["🎉", "🔥", "🍀", "😂", "😱", "👏", "💚", "🤞"];

export type MockApi = {
  state: BingoState;
  revealPhase: RevealPhase;
  intervalSec: number;
  reactions: FloatingReaction[];
  myBingo: boolean;
  setActiveCard: (i: number) => void;
  sendChat: (text: string) => void;
  sendReaction: (emoji: string) => void;
  subscribe: (fn: Listener) => () => void;
};

const PRIZE = {
  title: "Bingo en vivo - Consola de videojuegos",
  description:
    "Llena toda tu tarjeta (carton lleno) antes que nadie y llevate el premio. Si dos o mas jugadores cantan bingo en la misma bola, el premio se reparte en partes iguales.",
  valueUsd: 550,
  imageUrl: "/og.png",
};

const FAIRNESS = {
  commitment: "6b0c7f4b0e6d3a1c9f2e8b5a7d4c1f0e3a6b9c2d5e8f1a4b7c0d3e6f9a2b5c8d",
  drandRound: "14203677",
};

let uid = 1;

export function useMockBingo(participantCount = 348): MockApi {
  // Static world, built once per mount.
  const world = useMemo(() => {
    const rnd = makeRng(20260905);
    const cards = new Map<string, BingoCard[]>();
    const base: Omit<Participant, "bestLetters" | "marks">[] = [];

    for (let i = 0; i < participantCount; i++) {
      const id = `u${i + 1}`;
      const nick =
        FIRST[Math.floor(rnd() * FIRST.length)] + LAST[Math.floor(rnd() * LAST.length)] +
        (rnd() < 0.35 ? String(Math.floor(rnd() * 99)) : "");
      const nCards = rnd() < 0.75 ? 1 : rnd() < 0.7 ? 2 : 3;
      cards.set(id, Array.from({ length: nCards }, () => makeCard(rnd)));
      base.push({ userId: id, nickname: nick, avatarUrl: null, suertudo: rnd() < 0.02 });
    }

    const meId = "me";
    const meCards = Array.from({ length: MY_CARDS_COUNT }, () => makeCard(rnd));
    cards.set(meId, meCards);
    base.push({ userId: meId, nickname: "Tu", avatarUrl: null, suertudo: true });

    return { rnd, cards, base, meId, meCards };
  }, [participantCount]);

  const computeParticipants = (drawn: Set<number>): Participant[] =>
    world.base.map((p) => {
      const cs = world.cards.get(p.userId)!;
      let best = cs[0];
      let bestMarks = -1;
      for (const c of cs) {
        const m = markedCount(c, drawn);
        if (m > bestMarks) { bestMarks = m; best = c; }
      }
      return { ...p, bestLetters: completedLetters(best, drawn), marks: bestMarks, cards: cs.length };
    });

  // Static per-round: total tarjetas + how many contain each number (for toasts).
  const cardStats = useMemo(() => {
    const per: Record<number, number> = {};
    for (let n = 1; n <= 75; n++) per[n] = 0;
    let total = 0;
    for (const cs of world.cards.values()) {
      for (const c of cs) {
        total++;
        for (const n of cardNums(c)) per[n]++;
      }
    }
    return { total, per };
  }, [world]);

  // Global per-letter tarjeta counts: how many tarjetas (all players, all
  // tarjetas) already completed each column. The real API fills this field.
  const computeLettersDone = (drawn: Set<number>): Record<BingoLetter, number> => {
    const out: Record<BingoLetter, number> = { B: 0, I: 0, N: 0, G: 0, O: 0 };
    for (const cs of world.cards.values()) {
      for (const c of cs) for (const L of completedLetters(c, drawn)) out[L]++;
    }
    return out;
  };

  const [state, setState] = useState<BingoState>(() => {
    const drawn = new Set<number>();
    return {
      status: "drawing",
      drawnBalls: [],
      currentBall: null,
      nextBallInSec: DEMO_INTERVAL_SEC,
      prize: PRIZE,
      fairness: FAIRNESS,
      me: {
        userId: world.meId,
        nickname: "Tu",
        avatarUrl: null,
        suertudo: true,
        cards: world.meCards,
        activeCardIndex: 0,
      },
      participants: computeParticipants(drawn),
      lettersDone: computeLettersDone(drawn),
      totalCards: cardStats.total,
      cardsPerNumber: cardStats.per,
      viewers: Math.round((participantCount + 1) * 1.7) + 60, // players + spectators
      chat: seedChat(55), // an established backlog so pagination has history
      winners: undefined,
    };
  });

  const [revealPhase, setRevealPhase] = useState<RevealPhase>(null);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const listeners = useRef<Set<Listener>>(new Set());
  const timers = useRef<number[]>([]);
  const bagRef = useRef<number[]>([]);
  const stateRef = useRef(state);
  stateRef.current = state;

  const emit = (ev: SceneEvent) => listeners.current.forEach((fn) => fn(ev));

  function mkMsg(nickname: string, suertudo: boolean, text: string): ChatMsg {
    return { id: `m${uid++}`, nickname, avatarUrl: null, suertudo, text, at: new Date().toISOString() };
  }

  // A believable chat backlog so the "cargar 50 mas" pagination has real history.
  // Uses the deterministic world PRNG (NOT Math.random) so the SSR markup and the
  // client's first render match - otherwise React hydration mismatches (#418).
  function seedChat(n: number): ChatMsg[] {
    const out: ChatMsg[] = [];
    for (let i = 0; i < n; i++) {
      const p = world.base[Math.floor(world.rnd() * world.base.length)];
      out.push(mkMsg(p.nickname, p.suertudo, BOT_LINES[Math.floor(world.rnd() * BOT_LINES.length)]));
    }
    return out;
  }

  const pushReaction = (emoji: string, userId?: string) => {
    const id = uid++;
    setReactions((r) => [...r.slice(-14), { id, emoji, x: 12 + Math.random() * 76, userId }]);
    const t = window.setTimeout(() => setReactions((r) => r.filter((x) => x.id !== id)), 2600);
    timers.current.push(t);
  };

  useEffect(() => {
    const rnd = world.rnd;
    let disposed = false;
    const after = (ms: number, fn: () => void) => {
      const t = window.setTimeout(() => { if (!disposed) fn(); }, ms);
      timers.current.push(t);
    };

    let deadline = Date.now() + DEMO_INTERVAL_SEC * 1000;
    let phaseLock = false;

    // Pre-seed each round to a few balls before the FIRST carton lleno, so the
    // demo always builds to a real full-card win in ~5 suspenseful reveals
    // (filling all 24 numbers would otherwise eat most of the 75 balls).
    function startRound() {
      const order = shuffled(Array.from({ length: 75 }, (_, i) => i + 1), rnd);
      const pos = new Map<number, number>();
      order.forEach((n, i) => pos.set(n, i));
      let winIdx = Infinity;
      for (const cs of world.cards.values()) for (const c of cs) {
        const idx = completionIdx(c, pos);
        if (idx < winIdx) winIdx = idx;
      }
      const preseed = Math.max(0, winIdx - 5);
      bagRef.current = order.slice(preseed);
      const pre = order.slice(0, preseed);
      const drawn = new Set(pre);
      setState((s) => ({
        ...s,
        status: "drawing",
        drawnBalls: pre,
        currentBall: null,
        winners: undefined,
        nextBallInSec: DEMO_INTERVAL_SEC,
        participants: computeParticipants(drawn),
        lettersDone: computeLettersDone(drawn),
      }));
      deadline = Date.now() + DEMO_INTERVAL_SEC * 1000;
      phaseLock = false;
    }
    startRound();

    // -- countdown ticker (250ms resolution for a smooth ring) --------------
    const tick = window.setInterval(() => {
      if (disposed || phaseLock || stateRef.current.status !== "drawing") return;
      const left = Math.max(0, (deadline - Date.now()) / 1000);
      setState((s) => (Math.abs(s.nextBallInSec - left) > 0.05 ? { ...s, nextBallInSec: left } : s));
      if (left <= 0) { phaseLock = true; startReveal(); }
    }, 250);
    timers.current.push(tick as unknown as number);

    // -- the two-beat suspense reveal ---------------------------------------
    function startReveal() {
      const number = bagRef.current.shift();
      if (number == null) { finish([]); return; }
      const letter = letterForNumber(number);
      const ball: Ball = { letter, number };

      // Beat 0: the machine dispenses; the 3D ball flies up (~1.3s).
      setRevealPhase("flight");
      setState((s) => ({ ...s, currentBall: ball, nextBallInSec: 0 }));
      playSfx("pop");
      emit({ type: "draw", letter, number });

      // Beat 1: LETTER alone, big.
      after(1350, () => { setRevealPhase("letter"); playLetter(letter); });
      // Beat 2: the NUMBER joins.
      after(2600, () => { setRevealPhase("number"); playNumber(number); });
      // Beat 3: full call repeated; the ball becomes official -> cards mark.
      after(3700, () => {
        setRevealPhase("call");
        playCall(letter, number);
        setState((s) => {
          const drawnBalls = [...s.drawnBalls, number!];
          const drawn = new Set(drawnBalls);
          return {
            ...s,
            drawnBalls,
            participants: computeParticipants(drawn),
            lettersDone: computeLettersDone(drawn),
          };
        });
        playSfx("mark");
      });
      // Settle: check winners, restart countdown.
      after(5300, () => {
        setRevealPhase(null);
        const s = stateRef.current;
        const drawn = new Set(s.drawnBalls);
        // Win = carton lleno (all 5 columns complete on the best card).
        const winners = s.participants.filter((p) => p.bestLetters.length === 5);
        const meWon = s.me.cards.some((c) => hasFullCard(c, drawn));
        if (winners.length > 0 || meWon) {
          const names = winners.map((w) => ({ nickname: w.nickname, avatarUrl: w.avatarUrl, cards: w.cards }));
          if (meWon && !winners.some((w) => w.userId === s.me.userId)) {
            names.push({ nickname: s.me.nickname, avatarUrl: null, cards: s.me.cards.length });
          }
          finish(names);
        } else {
          setState((st) => ({ ...st, currentBall: null }));
          deadline = Date.now() + DEMO_INTERVAL_SEC * 1000;
          phaseLock = false;
        }
      });
    }

    function finish(names: { nickname: string; avatarUrl: string | null; cards: number }[]) {
      playSfx("bingo");
      emit({ type: "bingo" });
      const share = names.length ? PRIZE.valueUsd / names.length : PRIZE.valueUsd;
      setState((s) => ({
        ...s,
        status: "finished",
        currentBall: null,
        winners: names.map((n) => ({ ...n, shareUsd: Math.round(share * 100) / 100 })),
      }));
      // Demo loops: fresh round after the celebration.
      after(10000, () => {
        emit({ type: "reset" });
        startRound();
      });
    }

    // -- ambient chat + reactions from "the room" ---------------------------
    const chatTimer = window.setInterval(() => {
      if (disposed) return;
      setState((s) => {
        let chat = s.chat;
        if (Math.random() < 0.75) {
          const p = s.participants[Math.floor(Math.random() * s.participants.length)];
          const line = BOT_LINES[Math.floor(Math.random() * BOT_LINES.length)];
          chat = [...s.chat.slice(-399), mkMsg(p.nickname, p.suertudo, line)]; // keep up to 400
        }
        // spectators gently drift (slight upward bias)
        const viewers = Math.max(20, s.viewers + Math.round((Math.random() - 0.45) * 8));
        return chat === s.chat && viewers === s.viewers ? s : { ...s, chat, viewers };
      });
      if (Math.random() < 0.45) {
        const rp = stateRef.current.participants[Math.floor(Math.random() * stateRef.current.participants.length)];
        pushReaction(REACTION_EMOJIS[Math.floor(Math.random() * REACTION_EMOJIS.length)], rp?.userId);
      }
    }, 5200);
    timers.current.push(chatTimer as unknown as number);

    return () => {
      disposed = true;
      timers.current.forEach((t) => { window.clearTimeout(t); window.clearInterval(t); });
      timers.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world]);

  return {
    state,
    revealPhase,
    intervalSec: DEMO_INTERVAL_SEC,
    reactions,
    myBingo: state.status === "finished" && !!state.winners?.some((w) => w.nickname === state.me.nickname),
    setActiveCard: (i) => setState((s) => ({ ...s, me: { ...s.me, activeCardIndex: i } })),
    sendChat: (text) => {
      const t = text.trim();
      if (!t) return;
      setState((s) => ({ ...s, chat: [...s.chat.slice(-399), mkMsg(s.me.nickname, s.me.suertudo, t)] }));
    },
    sendReaction: (emoji) => pushReaction(emoji, world.meId),
    subscribe: (fn) => {
      listeners.current.add(fn);
      return () => listeners.current.delete(fn);
    },
  };
}
