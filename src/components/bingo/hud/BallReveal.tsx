// Top-center HUD: the two-beat suspense reveal of the current ball.
// Beat 1 = LETTER alone (big, glowing). Beat 2 = the NUMBER joins.
// Beat 3 = the full call pulses once, then it shrinks into the called strip.

import { AnimatePresence, motion } from "framer-motion";
import { LETTER_COLORS, type Ball } from "../types";
import type { RevealPhase } from "../mock";

export default function BallReveal({ ball, phase }: { ball: Ball | null; phase: RevealPhase }) {
  const color = ball ? LETTER_COLORS[ball.letter] : "#10b981";
  const showLetter = phase === "letter" || phase === "number" || phase === "call";
  const showNumber = phase === "number" || phase === "call";

  return (
    <div className="pointer-events-none flex h-28 items-start justify-center sm:h-32">
      <AnimatePresence mode="wait">
        {ball && phase === "flight" && (
          <motion.div
            key="flight"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="mt-3 flex items-center gap-2 rounded-full bg-slate-900/55 px-4 py-1.5 text-sm font-semibold text-white backdrop-blur"
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-300 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-300" />
            </span>
            Sale la bola...
          </motion.div>
        )}

        {ball && showLetter && (
          <motion.div
            key={`ball-${ball.letter}-${ball.number}`}
            initial={{ scale: 0.2, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.35, opacity: 0, y: -34, transition: { duration: 0.45, ease: [0.4, 0, 0.6, 1] } }}
            transition={{ type: "spring", stiffness: 320, damping: 20 }}
            className="mt-1 flex items-center gap-3"
          >
            {/* the big ball */}
            <motion.div
              animate={
                phase === "call"
                  ? { scale: [1, 1.14, 1], rotate: [0, -3, 3, 0] }
                  : { scale: 1, rotate: 0 }
              }
              transition={{ duration: 0.55, ease: "easeOut" }}
              className="relative flex h-24 w-24 items-center justify-center rounded-full sm:h-28 sm:w-28"
              style={{
                background: `radial-gradient(circle at 32% 28%, #ffffff 0%, ${color} 55%, ${shade(color)} 100%)`,
                boxShadow: `0 10px 34px -6px ${color}cc, 0 0 0 4px rgba(255,255,255,0.35), inset 0 -6px 14px rgba(0,0,0,0.18)`,
              }}
            >
              <div className="flex h-16 w-16 flex-col items-center justify-center rounded-full bg-white shadow-inner sm:h-[4.6rem] sm:w-[4.6rem]">
                <motion.span
                  key={`L-${ball.letter}-${ball.number}`}
                  initial={{ scale: 2.4, opacity: 0, filter: "blur(6px)" }}
                  animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
                  transition={{ type: "spring", stiffness: 260, damping: 16 }}
                  className={`font-black leading-none ${showNumber ? "text-xl sm:text-2xl" : "text-4xl sm:text-5xl"}`}
                  style={{ color }}
                >
                  {ball.letter}
                </motion.span>
                <AnimatePresence>
                  {showNumber && (
                    <motion.span
                      key="num"
                      initial={{ scale: 2.2, opacity: 0, filter: "blur(6px)" }}
                      animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
                      transition={{ type: "spring", stiffness: 240, damping: 15 }}
                      className="text-3xl font-black leading-none text-slate-900 sm:text-4xl"
                    >
                      {ball.number}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
              {/* glow ring on the letter beat */}
              {phase === "letter" && (
                <motion.div
                  className="absolute inset-0 rounded-full"
                  initial={{ boxShadow: `0 0 0 0px ${color}00` }}
                  animate={{ boxShadow: [`0 0 0 0px ${color}88`, `0 0 0 18px ${color}00`] }}
                  transition={{ duration: 0.9, repeat: Infinity }}
                />
              )}
            </motion.div>

            {/* spelled-out call on the final beat */}
            <AnimatePresence>
              {phase === "call" && (
                <motion.div
                  key="callout"
                  initial={{ opacity: 0, x: -14, scale: 0.9 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="rounded-2xl bg-slate-900/60 px-4 py-2 text-left backdrop-blur"
                >
                  <div className="text-[11px] font-semibold uppercase tracking-widest text-emerald-300">Bola cantada</div>
                  <div className="text-2xl font-black text-white sm:text-3xl">
                    {ball.letter}
                    <span className="mx-1 text-white/50">-</span>
                    {ball.number}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function shade(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const f = 0.55;
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `rgb(${r},${g},${b})`;
}
