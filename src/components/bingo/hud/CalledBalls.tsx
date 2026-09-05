// Running list of called balls (latest first) + the countdown ring
// for the next ball.

import { motion } from "framer-motion";
import { LETTER_COLORS, letterForNumber } from "../types";

export function CalledStrip({ drawn }: { drawn: number[] }) {
  const latest = [...drawn].reverse();
  return (
    <div className="pointer-events-auto flex items-center gap-2">
      <div className="rounded-full bg-slate-900/55 px-3 py-1 text-xs font-bold text-white backdrop-blur">
        {drawn.length}<span className="font-medium text-white/60">/75</span>
      </div>
      <div className="scrollbar-none flex max-w-[62vw] items-center gap-1.5 overflow-x-auto rounded-full bg-slate-900/45 px-2.5 py-1.5 backdrop-blur sm:max-w-md">
        {latest.length === 0 && (
          <span className="whitespace-nowrap px-1 text-xs font-medium text-white/70">Aun no salen bolas</span>
        )}
        {latest.map((n, i) => {
          const L = letterForNumber(n);
          return (
            <motion.span
              key={n}
              initial={i === 0 ? { scale: 0, opacity: 0 } : false}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 380, damping: 22 }}
              className={`flex h-7 shrink-0 items-center justify-center rounded-full font-bold text-white shadow ${i === 0 ? "w-auto gap-0.5 px-2.5 text-sm ring-2 ring-white/80" : "w-7 text-[11px]"}`}
              style={{ background: LETTER_COLORS[L] }}
              title={`${L}-${n}`}
            >
              {i === 0 && <span className="text-[10px] font-black opacity-90">{L}</span>}
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
