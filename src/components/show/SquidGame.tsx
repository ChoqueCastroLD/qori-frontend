import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Avatar, OutTray, cellFor, gridLayout, hashSeed, rng, useNewSteps, useWidth, type GameProps } from "./shared";
import { ParticleCanvas, type Burst } from "./Particles";

// LUZ ROJA, LUZ VERDE: a watching doll + traffic light on top. On green,
// survivors creep toward the doll (per-ticket seeded speed). On red, a scan
// beam sweeps and the caught batch freezes and shatters.
export default function SquidGame({ participants, stage, stageIdx, step, elimSeq, myIndices, winnerSet, isFinaleDone }: GameProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [bursts, setBursts] = useState<Burst[]>([]);

  const aliveBefore: number[] = stage.aliveBefore ?? [];
  const stageElim: number[] = stage.eliminated ?? [];
  const rounds: { light: string; eliminated: number[] }[] = stage.data?.rounds ?? [{ light: "red", eliminated: stageElim }];

  // How many rounds have elapsed at this step (pure function of step).
  const { roundsElapsed, redActive } = useMemo(() => {
    let acc = 0;
    for (let r = 0; r < rounds.length; r++) {
      const n = rounds[r].eliminated.length;
      if (n > 0 && step < acc + n) return { roundsElapsed: r + (step - acc) / n, redActive: rounds[r].light === "red" && step > 0 };
      acc += n;
    }
    return { roundsElapsed: rounds.length, redActive: false };
  }, [rounds, step]);
  const progress = Math.min(1, roundsElapsed / Math.max(1, rounds.length));

  const stageElimSet = useMemo(() => new Set(stageElim.slice(0, step)), [stageElim, step]);
  const alive = useMemo(
    () => aliveBefore.filter((i) => !stageElimSet.has(i)).sort((a, b) => participants[b].number - participants[a].number),
    [aliveBefore, stageElimSet, participants],
  );

  const cell = cellFor(aliveBefore.length);
  const W = Math.max(width, 280);
  const startLayout = useMemo(() => gridLayout(aliveBefore.length, W - 32, cell, 8), [aliveBefore.length, W, cell]);
  const DEPTH = 150; // how far the crowd advances toward the doll
  const TOP = 108; // doll + light area
  const fieldH = TOP + DEPTH + startLayout.height + 40;

  // Fixed start slot per ticket (by rank in aliveBefore) + seeded speed/jitter.
  const slotOf = useMemo(() => {
    const sorted = aliveBefore.slice().sort((a, b) => participants[b].number - participants[a].number);
    const m = new Map<number, number>();
    sorted.forEach((i, k) => m.set(i, k));
    return m;
  }, [aliveBefore, participants]);

  const posOf = (i: number, pr: number) => {
    const slot = slotOf.get(i) ?? 0;
    const p = startLayout.pos(slot);
    const r = rng(stageIdx, i, 11);
    const speed = 0.65 + r() * 0.55;
    const wobble = (r() - 0.5) * 14;
    return { x: p.x + 16 + wobble * pr, y: TOP + DEPTH + p.y - Math.min(1, pr * speed) * DEPTH };
  };

  useNewSteps(stageIdx, step, (steps) => {
    if (!width) return;
    setBursts((b) => [
      ...b.slice(-10),
      ...steps.map((k) => {
        const i = stageElim[k - 1];
        const at = posOf(i, Math.min(1, roundsElapsed / Math.max(1, rounds.length)));
        return { key: `s${stageIdx}-${k}`, x: at.x + cell / 2, y: at.y + cell / 2, kind: "shatter" as const, seed: hashSeed(stageIdx, k, i, 3) };
      }),
    ]);
  });

  // Recently caught: frozen, flash red, then crumble.
  const caughtNow = useMemo(() => {
    const out: { i: number; k: number }[] = [];
    for (let k = Math.max(1, step - 2); k <= step; k++) if (stageElim[k - 1] != null) out.push({ i: stageElim[k - 1], k });
    return out;
  }, [step, stageElim]);

  return (
    <div>
      <div ref={ref} className={`relative overflow-hidden rounded-2xl px-4 pb-4 transition-colors duration-300 ${redActive ? "bg-[#3b0a12]" : "bg-[#122117]"}`} style={{ minHeight: Math.max(320, fieldH) }}>
        {/* doll + traffic light */}
        <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 flex-col items-center">
          <svg viewBox="0 0 48 64" className="h-16 w-12" aria-hidden="true">
            <circle cx="24" cy="16" r="11" fill="#f5c9a4" stroke="#7c2d12" strokeWidth="1.5" />
            <path d="M13 12c0-7 22-7 22 0" fill="#3f2212" />
            <circle cx="8" cy="18" r="4.5" fill="#3f2212" /><circle cx="40" cy="18" r="4.5" fill="#3f2212" />
            <motion.g animate={redActive ? { opacity: 1 } : { opacity: 0.25 }}>
              <circle cx="19.5" cy="16" r="2.2" fill={redActive ? "#ef4444" : "#1c1917"} />
              <circle cx="28.5" cy="16" r="2.2" fill={redActive ? "#ef4444" : "#1c1917"} />
            </motion.g>
            <path d="M14 30h20l3 26H11l3-26Z" fill="#f97316" stroke="#7c2d12" strokeWidth="1.5" />
            <path d="M18 38h12M17 46h14" stroke="#7c2d12" strokeWidth="1.5" />
          </svg>
          <div className="mt-1 flex items-center gap-2 rounded-full bg-black/50 px-3 py-1">
            <span className={`h-3 w-3 rounded-full ${!redActive ? "bg-emerald-400 shadow-[0_0_10px_2px_rgba(52,211,153,0.8)]" : "bg-emerald-900"}`} />
            <span className={`h-3 w-3 rounded-full ${redActive ? "animate-pulse bg-rose-500 shadow-[0_0_10px_2px_rgba(244,63,94,0.8)]" : "bg-rose-950"}`} />
            <span className={`text-[10px] font-bold uppercase tracking-widest ${redActive ? "text-rose-300" : "text-emerald-300"}`}>
              {redActive ? "Luz roja" : "Luz verde"}
            </span>
          </div>
        </div>
        {/* finish line under the doll */}
        <div className="absolute left-4 right-4 z-0 border-t-2 border-dashed border-white/25" style={{ top: TOP - 6 }} />
        {/* sweeping scan beam on red */}
        {redActive && (
          <div className="qori-beam pointer-events-none absolute inset-y-0 z-10 w-24 bg-gradient-to-r from-transparent via-rose-500/25 to-transparent" />
        )}
        {width > 0 && alive.map((i) => {
          const p = posOf(i, progress);
          return (
            <motion.div
              key={i}
              initial={false}
              animate={{ x: p.x, y: p.y }}
              transition={{ type: "spring", stiffness: 160, damping: 26, mass: 0.9 }}
              className="absolute left-0 top-0"
              style={{ width: cell }}
            >
              <motion.div animate={redActive ? {} : { y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 0.7 + ((slotOf.get(i) ?? 0) % 5) * 0.08 }}>
                <Avatar p={participants[i]} mine={myIndices.has(i)} winner={isFinaleDone && winnerSet.has(i)} size={cell} dark />
              </motion.div>
            </motion.div>
          );
        })}
        {caughtNow.map(({ i, k }) => {
          const p = posOf(i, progress);
          return (
            <motion.div
              key={`c${k}`}
              initial={{ x: p.x, y: p.y, opacity: 1, scale: 1.1, filter: "grayscale(0)" }}
              animate={{ opacity: 0, scale: 0.5, y: p.y + 30, filter: "grayscale(1)" }}
              transition={{ duration: 0.8, delay: 0.15, ease: "easeIn" }}
              className="pointer-events-none absolute left-0 top-0 z-10"
              style={{ width: cell }}
            >
              <div className="relative">
                <div className="absolute -inset-1.5 animate-ping rounded-full border-2 border-rose-500" />
                <Avatar p={participants[i]} elim size={cell} ring={false} dark />
              </div>
            </motion.div>
          );
        })}
        <ParticleCanvas bursts={bursts} />
      </div>
      <OutTray participants={participants} elimSeq={elimSeq} myIndices={myIndices} />
    </div>
  );
}
