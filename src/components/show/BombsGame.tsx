import { useMemo, useState } from "react";
import { motion, useAnimationControls } from "framer-motion";
import { Avatar, OutTray, cellFor, gridLayout, hashSeed, useNewSteps, useWidth, type GameProps } from "./shared";
import { ParticleCanvas, type Burst } from "./Particles";

// BOMBS: a bomb drops on each victim and detonates — fire, smoke, debris and
// a shockwave ring. Completing a phase (data.phases group) triggers a bigger
// blast plus a screen shake of the whole minefield.
export default function BombsGame({ participants, stage, stageIdx, step, elimSeq, myIndices, winnerSet, isFinaleDone }: GameProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [bursts, setBursts] = useState<Burst[]>([]);
  const shakeCtl = useAnimationControls();

  const aliveBefore: number[] = stage.aliveBefore ?? [];
  const stageElim: number[] = stage.eliminated ?? [];
  const phases: number[][] = stage.data?.phases ?? [stageElim];
  const phaseEnds = useMemo(() => {
    const ends: number[] = []; let acc = 0;
    for (const ph of phases) { acc += ph.length; ends.push(acc); }
    return ends;
  }, [phases]);

  const stageElimSet = useMemo(() => new Set(stageElim.slice(0, step)), [stageElim, step]);
  const alive = useMemo(
    () => aliveBefore.filter((i) => !stageElimSet.has(i)).sort((a, b) => participants[b].number - participants[a].number),
    [aliveBefore, stageElimSet, participants],
  );

  const cell = cellFor(aliveBefore.length);
  const W = Math.max(width, 280);
  const layout = useMemo(() => gridLayout(alive.length, W - 32, cell, 10), [alive.length, W, cell]);

  const posBefore = (k: number) => {
    const prevSet = new Set(stageElim.slice(0, k - 1));
    const list = aliveBefore.filter((i) => !prevSet.has(i)).sort((a, b) => participants[b].number - participants[a].number);
    const l = gridLayout(list.length, W - 32, cell, 10);
    const idx = list.indexOf(stageElim[k - 1]);
    const p = l.pos(Math.max(0, idx));
    return { x: p.x + 16 + cell / 2, y: p.y + 30 + cell / 2 };
  };

  useNewSteps(stageIdx, step, (steps) => {
    if (!width) return;
    const isBig = steps.some((k) => phaseEnds.includes(k));
    setBursts((b) => [
      ...b.slice(-8),
      ...steps.map((k) => {
        const { x, y } = posBefore(k);
        return { key: `b${stageIdx}-${k}`, x, y, kind: "explosion" as const, seed: hashSeed(stageIdx, k, stageElim[k - 1], 7) };
      }),
    ]);
    shakeCtl.start(
      isBig
        ? { x: [0, -7, 8, -5, 4, -2, 0], y: [0, 4, -5, 3, -2, 1, 0], transition: { duration: 0.55 } }
        : { x: [0, -3, 3, -2, 1, 0], y: [0, 2, -2, 1, 0], transition: { duration: 0.3 } },
    );
  });

  // Last victim: bomb-drop + shockwave + charred fall (all seed/step driven).
  const recent = useMemo(() => {
    const out: { i: number; k: number; at: { x: number; y: number } }[] = [];
    for (let k = Math.max(1, step - 1); k <= step; k++) {
      const i = stageElim[k - 1];
      if (i == null || !width) continue;
      out.push({ i, k, at: posBefore(k) });
    }
    return out;
  }, [step, stageIdx, stageElim, width, W, cell]);

  const phaseIdx = phaseEnds.findIndex((e) => step < e);
  const currentPhase = phaseIdx === -1 ? phases.length : phaseIdx + 1;

  return (
    <div>
      <motion.div animate={shakeCtl}>
        <div ref={ref} className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-stone-900 via-stone-950 to-black px-4 pt-8 pb-4" style={{ minHeight: Math.max(260, layout.height + 70) }}>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(249,115,22,0.12),transparent_60%)]" />
          <div className="absolute left-1/2 top-2 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.25em] text-orange-400/70">
            Campo minado · Oleada {currentPhase}/{phases.length}
          </div>
          {width > 0 && alive.map((i, idx) => {
            const p = layout.pos(idx);
            return (
              <motion.div
                key={i}
                initial={false}
                animate={{ x: p.x + 16, y: p.y + 30 }}
                transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.7 }}
                className="absolute left-0 top-0"
                style={{ width: cell }}
              >
                <Avatar p={participants[i]} mine={myIndices.has(i)} winner={isFinaleDone && winnerSet.has(i)} size={cell} dark />
              </motion.div>
            );
          })}
          {recent.map((rct) => (
            <div key={`bomb${rct.k}`} className="pointer-events-none absolute left-0 top-0 z-10" style={{ transform: `translate(${rct.at.x}px, ${rct.at.y}px)` }}>
              {/* falling bomb */}
              <motion.div initial={{ y: -260, opacity: 1 }} animate={{ y: -cell / 2, opacity: [1, 1, 0] }} transition={{ duration: 0.3, times: [0, 0.85, 1], ease: "easeIn" }} className="absolute -translate-x-1/2">
                <svg viewBox="0 0 24 24" className="h-6 w-6">
                  <circle cx="12" cy="14" r="7" fill="#1c1917" stroke="#57534e" strokeWidth="1" />
                  <path d="M12 7V4c0-1.5 2-2 3-1" stroke="#a8a29e" strokeWidth="1.6" fill="none" strokeLinecap="round" />
                  <circle cx="15.4" cy="2.6" r="1.4" fill="#fbbf24" />
                </svg>
              </motion.div>
              {/* shockwave ring */}
              <motion.div
                initial={{ scale: 0.2, opacity: 0.9 }}
                animate={{ scale: 3.2, opacity: 0 }}
                transition={{ duration: 0.55, delay: 0.24, ease: "easeOut" }}
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-orange-300/80"
                style={{ width: cell * 1.4, height: cell * 1.4, boxShadow: "0 0 30px 6px rgba(251,146,60,0.5)" }}
              />
              {/* charred victim sinks away */}
              <motion.div
                initial={{ x: -cell / 2, y: -cell / 2, opacity: 1, scale: 1 }}
                animate={{ y: cell, opacity: 0, scale: 0.6, rotate: 20 }}
                transition={{ duration: 0.7, delay: 0.26, ease: "easeIn" }}
                className="absolute brightness-[0.4]"
                style={{ width: cell }}
              >
                <Avatar p={participants[rct.i]} elim size={cell} ring={false} dark />
              </motion.div>
            </div>
          ))}
          <ParticleCanvas bursts={bursts} />
        </div>
      </motion.div>
      <OutTray participants={participants} elimSeq={elimSeq} myIndices={myIndices} />
    </div>
  );
}
