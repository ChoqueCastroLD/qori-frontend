// Running timeline of called balls (chronological, newest on the RIGHT) + the
// countdown ring. Drag left/right to pan through the history; when a new ball is
// called the whole strip auto-scrolls right so everything shifts left.

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { LETTER_COLORS, letterForNumber } from "../types";

export function CalledStrip({ drawn }: { drawn: number[] }) {
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

  return (
    <div className="pointer-events-auto flex items-center gap-2">
      <div className="shrink-0 rounded-full bg-slate-900/55 px-3 py-1 text-xs font-bold text-white backdrop-blur">
        {drawn.length}<span className="font-medium text-white/60">/75</span>
      </div>
      <div
        ref={trackRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className="scrollbar-none flex max-w-[62vw] cursor-grab touch-pan-x items-center gap-1.5 overflow-x-auto rounded-full bg-slate-900/45 px-2.5 py-1.5 backdrop-blur active:cursor-grabbing sm:max-w-md"
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
