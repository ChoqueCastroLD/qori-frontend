import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Avatar, OutTray, TargetRing, arenaMaxH, fitCellFor, gridLayout, hashSeed, rng, useNewSteps, useViewportH, useWidth, type GameProps } from "./shared";
import { ParticleCanvas, type Burst } from "./Particles";
import Icon from "../Icon";

// ARENA: survivors stand in a glowing dark arena. Each elimination zaps the
// victim with a spark burst and flings them off-screen with spin + trail.
export default function EliminationGame({ participants, stage, stageIdx, step, elimSeq, myIndices, winnerSet, isFinaleDone }: GameProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [bursts, setBursts] = useState<Burst[]>([]);

  const aliveBefore: number[] = stage.aliveBefore ?? [];
  const stageElim: number[] = stage.eliminated ?? [];
  const stageElimSet = useMemo(() => new Set(stageElim.slice(0, step)), [stageElim, step]);
  const alive = useMemo(
    () => aliveBefore.filter((i) => !stageElimSet.has(i)).sort((a, b) => participants[b].number - participants[a].number),
    [aliveBefore, stageElimSet, participants],
  );

  const vh = useViewportH();
  const maxH = arenaMaxH(vh) - 60; // header strip + padding
  const W = Math.max(width, 280);
  const { cell, gap } = useMemo(() => fitCellFor(aliveBefore.length, W - 32, maxH), [aliveBefore.length, W, maxH]);
  const layout = useMemo(() => gridLayout(alive.length, W - 32, cell, gap), [alive.length, W, cell, gap]);

  // Position a victim had just before their step (pure function of data+step).
  const posBefore = (k: number) => {
    const prevSet = new Set(stageElim.slice(0, k - 1));
    const list = aliveBefore.filter((i) => !prevSet.has(i)).sort((a, b) => participants[b].number - participants[a].number);
    const l = gridLayout(list.length, W - 32, cell, gap);
    const idx = list.indexOf(stageElim[k - 1]);
    const p = l.pos(Math.max(0, idx));
    return { x: p.x + 16 + cell / 2, y: p.y + 24 + cell / 2 };
  };

  useNewSteps(stageIdx, step, (steps) => {
    if (!width) return;
    setBursts((b) => [
      ...b.slice(-10),
      ...steps.map((k) => {
        const { x, y } = posBefore(k);
        return { key: `e${stageIdx}-${k}`, x, y, kind: "zap" as const, seed: hashSeed(stageIdx, k, stageElim[k - 1]) };
      }),
    ]);
  });

  // Last few victims fly out with seeded trajectories (visible during the fling).
  const flying = useMemo(() => {
    const out: { i: number; k: number; from: { x: number; y: number }; toX: number; rot: number }[] = [];
    for (let k = Math.max(1, step - 2); k <= step; k++) {
      const i = stageElim[k - 1];
      if (i == null || !width) continue;
      const r = rng(stageIdx, k, i);
      out.push({ i, k, from: posBefore(k), toX: (r() - 0.5) * W * 1.6, rot: (r() > 0.5 ? 1 : -1) * (420 + r() * 360) });
    }
    return out;
  }, [step, stageIdx, stageElim, width, W, cell]);

  return (
    <div>
      <div ref={ref} className="relative overflow-hidden rounded-2xl bg-slate-950 px-4 pt-6 pb-4" style={{ minHeight: Math.max(260, layout.height + 60) }}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.14),transparent_65%)]" />
        <div className="pointer-events-none absolute inset-3 rounded-xl border border-emerald-500/15" />
        <div className="absolute left-1/2 top-1.5 -translate-x-1/2 text-[10px] font-bold uppercase tracking-[0.25em] text-emerald-400/60">Arena</div>
        {width > 0 && alive.map((i, idx) => {
          const p = layout.pos(idx);
          const targeted = step < stageElim.length && stageElim[step] === i; // next to fall: telegraphed
          return (
            <motion.div
              key={i}
              initial={false}
              animate={{ x: p.x + 16, y: p.y + 24, scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.7 }}
              className="absolute left-0 top-0"
              style={{ width: cell, zIndex: targeted ? 15 : undefined }}
            >
              <motion.div
                animate={targeted ? { x: [0, -1.5, 1.5, -1, 1, 0] } : { x: 0 }}
                transition={targeted ? { repeat: Infinity, duration: 0.28 } : { duration: 0.1 }}
                className="relative"
              >
                {targeted && <TargetRing />}
                <Avatar p={participants[i]} mine={myIndices.has(i)} winner={isFinaleDone && winnerSet.has(i)} size={cell} dark />
              </motion.div>
            </motion.div>
          );
        })}
        {flying.map((f) => (
          <motion.div
            key={`fly${f.k}`}
            initial={{ x: f.from.x - cell / 2, y: f.from.y - cell / 2, scale: 1.15, opacity: 1, rotate: 0 }}
            animate={{ x: f.from.x - cell / 2 + f.toX, y: f.from.y + 420, rotate: f.rot, opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.85, ease: [0.3, 0.4, 0.6, 1] }}
            className="pointer-events-none absolute left-0 top-0 z-10"
            style={{ width: cell }}
          >
            <div className="relative">
              <div className="absolute -inset-1 rounded-full bg-amber-300/40 blur-md" />
              <Avatar p={participants[f.i]} elim size={cell} ring={false} dark />
              <div className="absolute -right-2 -top-2 text-amber-300"><Icon name="bolt" className="h-5 w-5" /></div>
            </div>
          </motion.div>
        ))}
        <ParticleCanvas bursts={bursts} />
      </div>
      <OutTray participants={participants} elimSeq={elimSeq} myIndices={myIndices} />
    </div>
  );
}
