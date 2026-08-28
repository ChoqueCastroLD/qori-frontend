import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Avatar, OutTray, arenaMaxH, fitCellFor, gridLayout, hashSeed, useNewSteps, useViewportH, useWidth, type GameProps } from "./shared";
import { ParticleCanvas, type Burst } from "./Particles";

// LAS SILLAS: while the tune loops the tickets circle (bob/sway); when the music
// STOPS they scramble for chairs (chairs = alive - ~10%), and whoever is left
// standing drops out. Rounds come from data.rounds; who leaves and when is a
// pure function of the stage's `eliminated` order — nothing random at runtime.
function ChairIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 11V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6M5 11h14v4H5zM7 15v4M17 15v4" />
    </svg>
  );
}

export default function MusicalChairsGame({ participants, stage, stageIdx, step, elimSeq, myIndices, winnerSet, isFinaleDone }: GameProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [bursts, setBursts] = useState<Burst[]>([]);
  const vh = useViewportH();

  const aliveBefore: number[] = stage.aliveBefore ?? [];
  const stageElim: number[] = stage.eliminated ?? [];
  const rounds: number[][] = stage.data?.rounds ?? [stageElim];
  const roundEnds = useMemo(() => { const e: number[] = []; let a = 0; for (const r of rounds) { a += r.length; e.push(a); } return e; }, [rounds]);
  const rFound = roundEnds.findIndex((e) => step < e);
  const roundIdx = rFound === -1 ? rounds.length - 1 : rFound;
  const roundStart = roundIdx === 0 ? 0 : roundEnds[roundIdx - 1];
  const aliveAtRoundStart = aliveBefore.length - roundStart;
  const chairs = Math.max(0, aliveAtRoundStart - (rounds[roundIdx]?.length ?? 0));
  // Music "stops" exactly when a batch is being pulled out (scramble beat).
  const musicPlaying = !roundEnds.includes(step) && step > 0 ? true : step === 0;

  const slots = useMemo(() => aliveBefore.slice().sort((a, b) => participants[b].number - participants[a].number), [aliveBefore, participants]);
  const slotOf = useMemo(() => { const m = new Map<number, number>(); slots.forEach((i, k) => m.set(i, k)); return m; }, [slots]);
  const maxH = arenaMaxH(vh) - 90;
  const W = Math.max(width, 280);
  const { cell, gap } = useMemo(() => fitCellFor(slots.length, W - 32, maxH), [slots.length, W, maxH]);
  const layout = useMemo(() => gridLayout(slots.length, W - 32, cell, gap), [slots.length, W, cell, gap]);
  const stageElimSet = useMemo(() => new Set(stageElim.slice(0, step)), [stageElim, step]);

  useNewSteps(stageIdx, step, (steps) => {
    if (!width) return;
    setBursts((b) => [
      ...b.slice(-8),
      ...steps.map((k) => {
        const slot = slotOf.get(stageElim[k - 1]) ?? 0;
        const p = layout.pos(slot);
        return { key: `m${stageIdx}-${k}`, x: p.x + 16 + cell / 2, y: p.y + 34 + cell / 2, kind: "puff" as const, seed: hashSeed(stageIdx, k, stageElim[k - 1], 23) };
      }),
    ]);
  });

  const falling = useMemo(() => {
    const out: { i: number; k: number; slot: number }[] = [];
    for (let k = Math.max(1, step - 1); k <= step; k++) {
      const i = stageElim[k - 1];
      if (i == null || !width) continue;
      out.push({ i, k, slot: slotOf.get(i) ?? 0 });
    }
    return out;
  }, [step, stageElim, slotOf, width]);

  return (
    <div>
      <div ref={ref} className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-violet-950 via-slate-900 to-slate-950 px-4 pt-9 pb-4" style={{ minHeight: Math.max(260, layout.height + 82) }}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(139,92,246,0.16),transparent_60%)]" />
        <div className="absolute left-1/2 top-2 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.22em] text-violet-300/80">
          Las sillas · Ronda {roundIdx + 1}/{rounds.length}
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${musicPlaying ? "bg-violet-500/20 text-violet-200" : "bg-rose-500/25 text-rose-200"}`}>
            <ChairIcon className="h-3 w-3" /> {chairs} {musicPlaying ? "· suena la música" : "· ¡silencio!"}
          </span>
        </div>
        {width > 0 && slots.map((i, slot) => {
          if (stageElimSet.has(i)) return null;
          const p = layout.pos(slot);
          return (
            <div key={i} className="absolute left-0 top-0" style={{ transform: `translate(${p.x + 16}px, ${p.y + 34}px)`, width: cell, zIndex: 10 }}>
              <motion.div
                animate={musicPlaying ? { y: [0, -3, 0, 3, 0], rotate: [0, -5, 5, 0] } : { y: 0, rotate: 0 }}
                transition={musicPlaying ? { repeat: Infinity, duration: 0.9, ease: "easeInOut" } : { duration: 0.15 }}
              >
                <Avatar p={participants[i]} mine={myIndices.has(i)} winner={isFinaleDone && winnerSet.has(i)} size={cell} dark />
              </motion.div>
            </div>
          );
        })}
        {falling.map(({ i, k, slot }) => {
          const p = layout.pos(slot);
          return (
            <motion.div
              key={`f${k}`}
              initial={{ x: p.x + 16, y: p.y + 34, opacity: 1, scale: 1, rotate: 0 }}
              animate={{ x: p.x + 16, y: p.y + 34 + cell * 1.3, opacity: 0, scale: 0.6, rotate: 35 }}
              transition={{ duration: 0.6, ease: "easeIn" }}
              className="pointer-events-none absolute left-0 top-0 z-20"
              style={{ width: cell }}
            >
              <Avatar p={participants[i]} elim size={cell} ring={false} dark />
            </motion.div>
          );
        })}
        <ParticleCanvas bursts={bursts} />
      </div>
      <OutTray participants={participants} elimSeq={elimSeq} myIndices={myIndices} />
    </div>
  );
}
