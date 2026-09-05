// Live bingo provider: polls the real API (GET /api/raffles/:slug/bingo) and
// emits the SAME shape as useMockBingo (MockApi) so <BingoSceneView> renders
// unchanged. The server is authoritative for the draw; this hook derives the
// local reveal beats + a smooth countdown between polls.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Ball, BingoCard, BingoLetter, BingoState, ChatMsg, Participant,
} from "./types";
import type { MockApi, RevealPhase, SceneEvent, FloatingReaction } from "./mock";
import { playCall, playLetter, playNumber, playSfx } from "./audio";

const EMPTY_LETTERS = { B: 0, I: 0, N: 0, G: 0, O: 0 };

function emptyState(): BingoState {
  return {
    status: "waiting",
    drawnBalls: [],
    currentBall: null,
    nextBallInSec: 0,
    viewers: 0,
    prize: { title: "", description: "", valueUsd: 0, imageUrl: "" },
    fairness: { commitment: "" },
    me: { userId: "", nickname: "Tú", avatarUrl: null, suertudo: false, cards: [], activeCardIndex: 0 },
    participants: [],
    lettersDone: { ...EMPTY_LETTERS },
    totalCards: 0,
    cardsPerNumber: {},
    chat: [],
    winners: undefined,
  };
}

export type LiveApi = MockApi & {
  meta: { ticketPrice: number; totalCards: number; soldCards: number; maxPerUser: number | null; paidOnly: boolean; playersCount: number; closesAt: string | null; startsAt: string | null; intervalSec: number } | null;
  loggedIn: boolean;
  loaded: boolean;
  refresh: () => void;
};

let ridSeq = 1;

export function useLiveBingo(slug: string): LiveApi {
  const [state, setState] = useState<BingoState>(emptyState);
  const [revealPhase, setRevealPhase] = useState<RevealPhase>(null);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [intervalSec, setIntervalSec] = useState(18);
  const [meta, setMeta] = useState<LiveApi["meta"]>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [poke, setPoke] = useState(0);

  const listeners = useRef<Set<(ev: SceneEvent) => void>>(new Set());
  const activeIdx = useRef(0);
  const chatRef = useRef<ChatMsg[]>([]);
  const chatAfterRef = useRef<string | null>(null);
  const lastBall = useRef<number | null>(null);
  const lastStatus = useRef<BingoState["status"]>("waiting");
  const timers = useRef<number[]>([]);
  const nextAtRef = useRef<number>(0); // ms timestamp when the next ball is due

  const emit = (ev: SceneEvent) => listeners.current.forEach((fn) => fn(ev));

  // ---- poll the server -----------------------------------------------------
  useEffect(() => {
    let alive = true;
    async function tick() {
      try {
        const res = await fetch(`/api/raffles/${slug}/bingo`, { credentials: "include" });
        if (!res.ok || !alive) return;
        const d = await res.json();
        if (!alive) return;
        setLoaded(true);
        setLoggedIn(!!d.me);
        setIntervalSec(d.meta?.intervalSec ?? 18);
        setMeta(d.meta ?? null);
        if (typeof d.nextBallInSec === "number") nextAtRef.current = Date.now() + d.nextBallInSec * 1000;

        const meCards: BingoCard[] = (d.me?.cards ?? []).map((c: any) => ({ B: c.B, I: c.I, N: c.N, G: c.G, O: c.O }));
        if (activeIdx.current >= meCards.length) activeIdx.current = 0;

        const mapped: BingoState = {
          status: d.status,
          drawnBalls: d.drawnBalls ?? [],
          currentBall: d.currentBall ? { letter: d.currentBall.letter as BingoLetter, number: d.currentBall.number } : null,
          nextBallInSec: d.nextBallInSec ?? 0,
          viewers: d.viewers ?? (d.participants?.length ?? 0),
          prize: d.prize,
          fairness: d.fairness,
          lettersDone: d.lettersDone ?? { ...EMPTY_LETTERS },
          totalCards: d.totalCards ?? 0,
          cardsPerNumber: d.cardsPerNumber ?? {},
          participants: (d.participants ?? []) as Participant[],
          chat: chatRef.current,
          me: d.me
            ? { userId: d.me.userId, nickname: d.me.nickname, avatarUrl: d.me.avatarUrl, suertudo: d.me.suertudo, cards: meCards, activeCardIndex: Math.min(activeIdx.current, Math.max(0, meCards.length - 1)), win: d.me.win ?? null }
            : emptyState().me,
          winners: d.winners,
        };
        setState(mapped);

        // New ball -> reveal beats + scene event (server is authoritative).
        const cur = mapped.currentBall?.number ?? null;
        if (cur !== lastBall.current) {
          lastBall.current = cur;
          if (cur != null && mapped.status === "drawing" && mapped.currentBall) runReveal(mapped.currentBall);
        }
        // Status transitions -> celebrate / reset the 3D scene.
        if (mapped.status !== lastStatus.current) {
          if (mapped.status === "finished") { emit({ type: "bingo" }); playSfx("bingo"); }
          if (mapped.status === "drawing" && lastStatus.current === "finished") emit({ type: "reset" });
          lastStatus.current = mapped.status;
        }
      } catch { /* keep polling */ }
    }
    tick();
    const iv = window.setInterval(tick, 2500);
    return () => { alive = false; window.clearInterval(iv); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, poke]);

  // ---- smooth local countdown between polls --------------------------------
  useEffect(() => {
    const iv = window.setInterval(() => {
      setState((s) => {
        if (s.status !== "drawing" || !nextAtRef.current) return s;
        const left = Math.max(0, (nextAtRef.current - Date.now()) / 1000);
        return Math.abs(s.nextBallInSec - left) > 0.2 ? { ...s, nextBallInSec: left } : s;
      });
    }, 250);
    return () => window.clearInterval(iv);
  }, []);

  function runReveal(ball: Ball) {
    const after = (ms: number, fn: () => void) => { const t = window.setTimeout(fn, ms); timers.current.push(t); };
    setRevealPhase("flight");
    playSfx("pop");
    emit({ type: "draw", letter: ball.letter, number: ball.number });
    after(1350, () => { setRevealPhase("letter"); playLetter(ball.letter); });
    after(2600, () => { setRevealPhase("number"); playNumber(ball.number); });
    after(3700, () => { setRevealPhase("call"); playCall(ball.letter, ball.number); playSfx("mark"); });
    after(5300, () => setRevealPhase(null));
  }

  useEffect(() => () => { timers.current.forEach((t) => window.clearTimeout(t)); }, []);

  // ---- real per-raffle chat (shared endpoint) ------------------------------
  const pollChat = useCallback(async () => {
    try {
      const after = chatAfterRef.current;
      const url = `/api/raffles/${slug}/chat` + (after ? `?after=${encodeURIComponent(after)}` : "");
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return;
      const d = await res.json();
      const incoming: ChatMsg[] = (d.messages ?? []).map((m: any) => ({
        id: m.id, nickname: m.nickname, avatarUrl: m.avatarUrl ?? null, suertudo: !!m.suertudo, text: m.text, at: m.createdAt,
      }));
      if (incoming.length === 0) return;
      const seen = new Set(chatRef.current.map((m) => m.id));
      const fresh = incoming.filter((m) => !seen.has(m.id));
      if (fresh.length === 0) return;
      chatRef.current = [...chatRef.current, ...fresh].slice(-200);
      chatAfterRef.current = incoming[incoming.length - 1].at;
      setState((s) => ({ ...s, chat: chatRef.current }));
    } catch { /* keep polling */ }
  }, [slug]);

  useEffect(() => {
    pollChat();
    const iv = window.setInterval(pollChat, 3000);
    return () => window.clearInterval(iv);
  }, [pollChat]);

  const pushReaction = (emoji: string, userId?: string) => {
    const id = ridSeq++;
    setReactions((r) => [...r.slice(-14), { id, emoji, x: 12 + Math.random() * 76, userId }]);
    const t = window.setTimeout(() => setReactions((r) => r.filter((x) => x.id !== id)), 2600);
    timers.current.push(t);
  };

  const myBingo = useMemo(
    () => state.status === "finished" && !!state.winners?.some((w) => w.nickname === state.me.nickname),
    [state.status, state.winners, state.me.nickname]
  );

  return {
    state,
    revealPhase,
    intervalSec,
    reactions,
    myBingo,
    meta,
    loggedIn,
    loaded,
    refresh: () => setPoke((p) => p + 1),
    setActiveCard: (i) => { activeIdx.current = i; setState((s) => ({ ...s, me: { ...s.me, activeCardIndex: i } })); },
    sendChat: (text) => {
      const t = text.trim();
      if (!t) return;
      void (async () => {
        try {
          const res = await fetch(`/api/raffles/${slug}/chat`, {
            method: "POST", credentials: "include", headers: { "content-type": "application/json" },
            body: JSON.stringify({ text: t.slice(0, 300) }),
          });
          if (res.ok) pollChat();
        } catch { /* ignore */ }
      })();
    },
    sendReaction: (emoji) => pushReaction(emoji, state.me.userId || undefined),
    subscribe: (fn) => { listeners.current.add(fn); return () => listeners.current.delete(fn); },
  };
}
