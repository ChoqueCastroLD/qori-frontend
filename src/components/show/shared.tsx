import { useEffect, useRef, useState, type RefObject } from "react";
import Icon from "../Icon";

export interface Participant {
  number: number;
  nickname: string | null;
  avatarUrl: string | null;
  comment: string | null;
  boughtAt?: string | null;
}

// Props every minigame receives. Everything a game renders MUST be a pure
// function of (stage data, stageIdx, step) - no wall-clock or Math.random().
export interface GameProps {
  participants: Participant[];
  stage: any;
  stageIdx: number;
  step: number;
  elimSeq: number[]; // global elimination order up to current position
  elimSet: Set<number>;
  myIndices: Set<number>;
  winnerSet: Set<number>;
  isFinaleDone: boolean;
  // Self-timed games (rockets/bombs/roulette) run their own choreography clock.
  // stageStartMs = epoch ms when this stage began (live, shared across viewers);
  // null in manual replay → the game uses its own clock from mount. speed scales
  // replay only.
  stageStartMs?: number | null;
  speed?: number;
}

// --- Deterministic PRNG: FNV-1a hash of stable inputs -> mulberry32 stream.
// Seeds are always (stageIdx, step, ticket index, ...) so live + replay match.
export function hashSeed(...parts: number[]): number {
  let h = 0x811c9dc5;
  for (const p of parts) {
    h ^= ((p | 0) + 0x9e3779b9) >>> 0;
    h = Math.imul(h, 0x01000193);
    h ^= h >>> 15;
  }
  return h >>> 0;
}
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const rng = (...parts: number[]) => mulberry32(hashSeed(...parts));

// Observe an element's content width (layout input, not randomness).
export function useWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((es) => setW(Math.round(es[0].contentRect.width)));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// Viewport height (layout input, not randomness) - lets arenas cap their own
// height so no game ever forces the page to scroll to be watched.
export function useViewportH(): number {
  const [h, setH] = useState(() => (typeof window !== "undefined" ? window.innerHeight : 800));
  useEffect(() => {
    const on = () => setH(window.innerHeight);
    window.addEventListener("resize", on);
    on();
    return () => window.removeEventListener("resize", on);
  }, []);
  return h;
}

// Max arena height: fits under the sticky header inside the viewport.
export function arenaMaxH(viewportH: number): number {
  return Math.max(240, Math.round(viewportH * 0.62));
}

// Centered row-major grid: returns absolute positions for n items.
export function gridLayout(n: number, width: number, cell: number, gap = 10) {
  const cols = Math.max(1, Math.floor((width + gap) / (cell + gap)));
  const rows = Math.max(1, Math.ceil(n / cols));
  const pos = (i: number) => {
    const r = Math.floor(i / cols);
    const inRow = r === rows - 1 ? n - r * cols : cols;
    const c = i - r * cols;
    const rowW = inRow * (cell + gap) - gap;
    return { x: Math.round((width - rowW) / 2 + c * (cell + gap)), y: r * (cell + gap + 16) };
  };
  return { cols, rows, pos, height: rows * (cell + gap + 16) - gap };
}

export function cellFor(n: number): number {
  return n > 220 ? 34 : n > 120 ? 40 : n > 60 ? 46 : 54;
}

// Pick the biggest cell size whose grid of n items fits within maxH (given the
// available width). Pure layout math - guarantees no page scroll for any count.
export function fitCellFor(n: number, width: number, maxH: number): { cell: number; gap: number } {
  const w = Math.max(200, width);
  for (let cell = cellFor(n); cell >= 22; cell -= 2) {
    const gap = cell >= 44 ? 10 : cell >= 34 ? 8 : 6;
    const cols = Math.max(1, Math.floor((w + gap) / (cell + gap)));
    const rows = Math.max(1, Math.ceil(n / cols));
    if (rows * (cell + gap + 16) - gap <= maxH) return { cell, gap };
  }
  return { cell: 22, gap: 5 };
}

// Telegraph overlay: pulsing red target ring + crosshair over the NEXT victim.
// Rendered whenever `step` says someone is about to fall - pure fn of step, and
// the CSS pulse only animates presentation (no randomness, no clock state).
export function TargetRing() {
  return (
    <div className="pointer-events-none absolute -inset-1.5 z-20" aria-hidden="true">
      <div className="absolute inset-0 animate-ping rounded-full border-2 border-rose-500/80" />
      <div className="absolute inset-0 rounded-full border-2 border-rose-400 shadow-[0_0_14px_3px_rgba(244,63,94,0.55)]" />
      <svg viewBox="0 0 40 40" className="absolute inset-0 h-full w-full text-rose-300">
        <path d="M20 1v6M20 33v6M1 20h6M33 20h6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}

// Avatar bubble with mine/winner rings + hover card (buyer, comment, date).
export function Avatar({
  p, mine, winner, elim, size = 44, ring = true, dark = false,
}: {
  p: Participant; mine?: boolean; winner?: boolean; elim?: boolean; size?: number; ring?: boolean; dark?: boolean;
}) {
  if (!p) return null;
  return (
    <div className="group relative" style={{ width: size }}>
      <div
        className={`relative rounded-full shadow transition-[filter] duration-500 ${elim ? "grayscale" : ""} ${
          winner ? "ring-4 ring-emerald-400" : mine ? "ring-[3px] ring-sky-400" : ring ? (dark ? "ring-2 ring-white/30" : "ring-2 ring-white") : ""
        }`}
        style={{ width: size, height: size }}
      >
        {p.avatarUrl ? (
          <img src={p.avatarUrl} className="h-full w-full rounded-full object-cover" alt="" loading="lazy" draggable={false} />
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-full bg-slate-300 font-bold text-slate-600" style={{ fontSize: size * 0.34 }}>
            {(p.nickname || "?")[0]}
          </div>
        )}
        {winner && <div className="absolute -right-1 -top-1 text-amber-400"><Icon name="trophy" className="h-4 w-4" /></div>}
        {mine && !winner && (
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-sky-500 px-1.5 text-[8px] font-bold text-white">TÚ</div>
        )}
      </div>
      <div className={`mt-0.5 text-center font-mono font-bold ${winner ? "text-emerald-500" : mine ? "text-sky-500" : dark ? "text-white/60" : "text-slate-500"}`} style={{ fontSize: Math.max(9, size * 0.19) }}>
        #{p.number}
      </div>
      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1 hidden w-44 -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-2.5 text-left shadow-xl group-hover:block">
        <div className="flex items-center gap-2">
          {p.avatarUrl ? (
            <img src={p.avatarUrl} className="h-8 w-8 rounded-full object-cover" alt="" />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-500">{(p.nickname || "?")[0]}</span>
          )}
          <div className="min-w-0">
            <div className="truncate text-xs font-bold text-slate-900">{p.nickname || "Anónimo"}</div>
            <div className="font-mono text-[10px] text-slate-500">Ticket #{p.number}</div>
          </div>
        </div>
        {p.comment && <div className="mt-1 line-clamp-2 text-[10px] italic text-slate-500">“{p.comment}”</div>}
      </div>
    </div>
  );
}

// Honest discard pile: every eliminated ticket, most recent first. Nothing hidden.
export function OutTray({ participants, elimSeq, myIndices, dark = false }: { participants: Participant[]; elimSeq: number[]; myIndices: Set<number>; dark?: boolean }) {
  if (!elimSeq.length) return null;
  const rev = elimSeq.slice().reverse();
  return (
    <div className={`mt-4 rounded-2xl border p-3 ${dark ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50"}`}>
      <div className={`mb-2 text-[11px] font-semibold uppercase tracking-wide ${dark ? "text-white/50" : "text-slate-400"}`}>
        Fuera ({elimSeq.length}) - orden de eliminación, el último primero
      </div>
      <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
        {rev.map((i) => (
          <div key={i} className={`flex items-center gap-1 rounded-full py-0.5 pl-0.5 pr-2 opacity-70 grayscale ${dark ? "bg-white/10" : "bg-white ring-1 ring-slate-200"}`}>
            {participants[i]?.avatarUrl ? (
              <img src={participants[i].avatarUrl!} className="h-5 w-5 rounded-full object-cover" alt="" loading="lazy" />
            ) : (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-300 text-[9px] font-bold text-slate-600">{(participants[i]?.nickname || "?")[0]}</span>
            )}
            <span className={`font-mono text-[10px] font-bold ${myIndices.has(i) ? "text-sky-500" : dark ? "text-white/60" : "text-slate-500"}`}>#{participants[i]?.number}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Track which stage-local steps just advanced, to fire one-shot effects
// (bursts) exactly once per new step, in live and replay alike.
export function useNewSteps(stageIdx: number, step: number, onNew: (steps: number[]) => void) {
  const prev = useRef<{ s: number; st: number }>({ s: -1, st: 0 });
  useEffect(() => {
    const p = prev.current;
    prev.current = { s: stageIdx, st: step };
    if (p.s !== stageIdx) return; // stage jump: no retroactive effects
    if (step > p.st) {
      const fresh: number[] = [];
      for (let k = Math.max(p.st + 1, step - 2); k <= step; k++) fresh.push(k);
      onNew(fresh);
    }
  }, [stageIdx, step]);
}
