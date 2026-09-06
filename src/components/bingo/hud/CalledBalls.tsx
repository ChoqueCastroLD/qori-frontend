// Running timeline of called balls (chronological, newest on the RIGHT) + the
// countdown ring. Drag left/right to pan through the history; when a new ball is
// called the whole strip auto-scrolls right so everything shifts left.

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import Icon from "../../Icon";
import { LETTER_COLORS, LETTERS, letterForNumber } from "../types";

export function CalledStrip({ drawn, onOpenBoard }: { drawn: number[]; onOpenBoard?: () => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ down: boolean; startX: number; startScroll: number; moved: boolean }>({
    down: false, startX: 0, startScroll: 0, moved: false,
  });

  // New ball -> shift everything left by scrolling to the newest (right end).
  useEffect(() => {
    const el = trackRef.current;
    if (el) el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
  }, [drawn.length]);

  const onDown = (e: React.PointerEvent) => {
    const el = trackRef.current;
    if (!el) return;
    drag.current = { down: true, startX: e.clientX, startScroll: el.scrollLeft, moved: false };
    el.setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const el = trackRef.current;
    if (!el || !drag.current.down) return;
    const dx = e.clientX - drag.current.startX;
    if (Math.abs(dx) > 3) drag.current.moved = true;
    el.scrollLeft = drag.current.startScroll - dx;
  };
  const onUp = (e: React.PointerEvent) => {
    drag.current.down = false;
    trackRef.current?.releasePointerCapture(e.pointerId);
  };

  const openBoard = () => { if (!drag.current.moved) onOpenBoard?.(); };

  return (
    <div className="pointer-events-auto flex items-center gap-2">
      <button
        type="button"
        onClick={openBoard}
        title="Ver el tablero completo"
        className="flex shrink-0 items-center gap-1 rounded-full bg-slate-900/55 px-3 py-1 text-xs font-bold text-white backdrop-blur transition hover:bg-slate-900/75"
      >
        {drawn.length}<span className="font-medium text-white/60">/75</span>
        <Icon name="grid" className="ml-0.5 h-3 w-3 text-white/70" />
      </button>
      <div
        ref={trackRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onClick={openBoard}
        className="scrollbar-none flex max-w-[62vw] cursor-pointer touch-pan-x items-center gap-1.5 overflow-x-auto rounded-full bg-slate-900/45 px-2.5 py-1.5 backdrop-blur active:cursor-grabbing sm:max-w-md"
      >
        {drawn.length === 0 && (
          <span className="whitespace-nowrap px-1 text-xs font-medium text-white/70">Aun no salen bolas</span>
        )}
        {drawn.map((n, i) => {
          const L = letterForNumber(n);
          const newest = i === drawn.length - 1;
          return (
            <motion.span
              key={`${n}-${i}`}
              initial={newest ? { scale: 0, opacity: 0 } : false}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 380, damping: 22 }}
              className={`flex h-7 shrink-0 select-none items-center justify-center rounded-full font-bold text-white shadow ${newest ? "w-auto gap-0.5 px-2.5 text-sm ring-2 ring-white/80" : "w-7 text-[11px]"}`}
              style={{ background: LETTER_COLORS[L] }}
              title={`${L}-${n}`}
            >
              {newest && <span className="text-[10px] font-black opacity-90">{L}</span>}
              {n}
            </motion.span>
          );
        })}
      </div>
    </div>
  );
}

// Full 1-75 board ("Panel de control"). Called numbers light up in their letter
// color; the newest ball pulses. Opened by tapping the called-balls strip.
export function BallBoard({ drawn, currentNumber = null, onClose }: {
  drawn: number[]; currentNumber?: number | null; onClose: () => void;
}) {
  const called = new Set(drawn);
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      className="pointer-events-auto fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.94, y: 20, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-white">
          <div className="flex items-center gap-2">
            <Icon name="grid" className="h-4 w-4" />
            <h3 className="text-base font-black uppercase tracking-wide">Panel de control</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold tabular-nums">{drawn.length}/75</span>
            <button type="button" onClick={onClose} aria-label="Cerrar" className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 transition hover:bg-white/30"><Icon name="x" className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="space-y-2 p-4">
          {LETTERS.map((L, li) => {
            const start = li * 15 + 1;
            return (
              <div key={L} className="flex items-center gap-1.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm font-black text-white shadow-sm" style={{ background: LETTER_COLORS[L] }}>{L}</span>
                <div className="grid flex-1 grid-cols-[repeat(15,minmax(0,1fr))] gap-1">
                  {Array.from({ length: 15 }, (_, i) => start + i).map((n) => {
                    const on = called.has(n);
                    const isCurrent = n === currentNumber;
                    return (
                      <motion.span
                        key={n}
                        animate={isCurrent ? { scale: [1, 1.18, 1] } : {}}
                        transition={isCurrent ? { duration: 1.1, repeat: Infinity } : {}}
                        className={`flex aspect-square items-center justify-center rounded-md text-[11px] font-bold tabular-nums transition ${
                          on ? "text-white shadow-sm" : "bg-slate-100 text-slate-300"
                        } ${isCurrent ? "ring-2 ring-slate-900 ring-offset-1" : ""}`}
                        style={on ? { background: LETTER_COLORS[L] } : undefined}
                      >
                        {n}
                      </motion.span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <div className="border-t border-slate-100 px-4 py-2.5 text-center text-[11px] text-slate-400">
          {drawn.length === 0 ? "Aún no salen bolas" : `Última bola: ${currentNumber ?? drawn[drawn.length - 1]}`}
        </div>
      </motion.div>
    </motion.div>
  );
}

export function CountdownRing({
  secondsLeft,
  total,
  active,
}: {
  secondsLeft: number;
  total: number;
  active: boolean;
}) {
  const r = 17;
  const c = 2 * Math.PI * r;
  const frac = active ? Math.max(0, Math.min(1, secondsLeft / total)) : 0;
  const secs = Math.ceil(secondsLeft);
  const urgent = active && secondsLeft <= 3;
  return (
    <div
      className="pointer-events-auto relative flex h-12 w-12 items-center justify-center rounded-full bg-slate-900/55 backdrop-blur"
      role="timer"
      aria-label={active ? `Siguiente bola en ${secs} segundos` : "Cantando bola"}
    >
      <svg viewBox="0 0 40 40" className="absolute inset-0 h-full w-full -rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="3.2" />
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          stroke={urgent ? "#f59e0b" : "#34d399"}
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          style={{ transition: "stroke-dashoffset 0.25s linear, stroke 0.3s" }}
        />
      </svg>
      {active ? (
        <span className={`text-sm font-black ${urgent ? "text-amber-300" : "text-white"}`}>{secs}</span>
      ) : (
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute h-full w-full animate-ping rounded-full bg-emerald-300 opacity-70" />
          <span className="relative h-2.5 w-2.5 rounded-full bg-emerald-300" />
        </span>
      )}
    </div>
  );
}
