import { useMemo, useState } from "react";
import { motion, useAnimationControls } from "framer-motion";
import { Avatar, OutTray, TargetRing, arenaMaxH, fitCellFor, gridLayout, hashSeed, rng, useNewSteps, useViewportH, useWidth, type GameProps } from "./shared";
import { ParticleCanvas, type Burst } from "./Particles";

// BOMBS: before each hit, a lit bomb HOPS between ~3 seeded positions over the
// crowd with a ticking fuse and a 3-2-1 countdown, then lands ON the victim
// and detonates — fire, smoke, debris and a shockwave ring. Completing a phase
// (data.phases group) triggers a bigger blast plus a screen shake.
export default function BombsGame({ participants, stage, stageIdx, step, elimSeq, myIndices, winnerSet, isFinaleDone }: GameProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [bursts, setBursts] = useState<Burst[]>([]);
  const shakeCtl = useAnimationControls();
  const vh = useViewportH();

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

  const maxH = arenaMaxH(vh) - 70; // header strip + padding
  const W = Math.max(width, 280);
  const { cell, gap } = useMemo(() => fitCellFor(aliveBefore.length, W - 32, maxH), [aliveBefore.length, W, maxH]);
  const layout = useMemo(() => gridLayout(alive.length, W - 32, cell, gap), [alive.length, W, cell, gap]);

  // Center of a slot in the CURRENT layout (offset matches the avatar grid).
  const centerOf = (idx: number) => {
    const p = layout.pos(Math.max(0, idx));
    return { x: p.x + 16 + cell / 2, y: p.y + 30 + cell / 2 };
  };

  const posBefore = (k: number) => {
    const prevSet = new Set(stageElim.slice(0, k - 1));
    const list = aliveBefore.filter((i) => !prevSet.has(i)).sort((a, b) => participants[b].number - participants[a].number);
    const l = gridLayout(list.length, W - 32, cell, gap);
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

  // The NEXT victim's bomb: hop path over 2 seeded decoy positions, landing on
  // the target. Pure function of (stageIdx, step, victim) — live/replay match.
  const hop = useMemo(() => {
    if (step >= stageElim.length || !width || !alive.length) return null;
    const victim = stageElim[step];
    const tIdx = alive.indexOf(victim);
    if (tIdx < 0) return null;
    const r = rng(stageIdx, step, victim, 41);
    const pick = () => {
      let j = Math.floor(r() * alive.length);
      if (j === tIdx) j = (j + 1) % alive.length;
      return centerOf(j);
    };
    const d1 = pick();
    const d2 = pick();
    const t = centerOf(tIdx);
    return { victim, d1, d2, t };
  }, [step, stageIdx, stageElim, alive, width, W, cell, gap]);

  // Victim just hit: shockwave + charred fall (the explosion FX is the canvas burst).
  const recent = useMemo(() => {
    const out: { i: number; k: number; at: { x: number; y: number } }[] = [];
    for (let k = Math.max(1, step - 1); k <= step; k++) {
      const i = stageElim[k - 1];
      if (i == null || !width) continue;
      out.push({ i, k, at: posBefore(k) });
    }
    return out;
  }, [step, stageIdx, stageElim, width, W, cell, gap]);

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
            const targeted = hop?.victim === i;
            return (
              <motion.div
                key={i}
                initial={false}
                animate={{ x: p.x + 16, y: p.y + 30 }}
                transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.7 }}
                className="absolute left-0 top-0"
                style={{ width: cell, zIndex: targeted ? 15 : undefined }}
              >
                <div className="relative">
                  {targeted && <TargetRing />}
                  <Avatar p={participants[i]} mine={myIndices.has(i)} winner={isFinaleDone && winnerSet.has(i)} size={cell} dark />
                </div>
              </motion.div>
            );
          })}
          {/* Hopping bomb: where will it land? Ends on the telegraphed victim. */}
          {hop && (
            <motion.div
              key={`hop${stageIdx}-${step}`}
              initial={{ x: hop.d1.x, y: hop.d1.y - 180, opacity: 0, scale: 0.7 }}
              animate={{
                x: [hop.d1.x, (hop.d1.x + hop.d2.x) / 2, hop.d2.x, (hop.d2.x + hop.t.x) / 2, hop.t.x],
                y: [hop.d1.y, Math.min(hop.d1.y, hop.d2.y) - 52, hop.d2.y, Math.min(hop.d2.y, hop.t.y) - 52, hop.t.y],
                opacity: 1,
                scale: [1, 1.08, 1, 1.12, 1.05],
              }}
              transition={{ duration: 0.92, times: [0, 0.28, 0.5, 0.78, 1], ease: "easeInOut" }}
              className="pointer-events-none absolute left-0 top-0 z-30"
            >
              <div className="relative -translate-x-1/2 -translate-y-[80%]">
                {/* countdown over the fuse: 3 -> 2 -> 1 as it hops */}
                <div className="absolute -top-5 left-1/2 -translate-x-1/2 font-mono text-sm font-black">
                  <motion.span className="absolute -translate-x-1/2 text-amber-300" animate={{ opacity: [1, 1, 0, 0, 0] }} transition={{ duration: 0.92, times: [0, 0.3, 0.34, 0.9, 1] }}>3</motion.span>
                  <motion.span className="absolute -translate-x-1/2 text-orange-400" animate={{ opacity: [0, 0, 1, 1, 0] }} transition={{ duration: 0.92, times: [0, 0.34, 0.4, 0.72, 0.78] }}>2</motion.span>
                  <motion.span className="absolute -translate-x-1/2 text-rose-400" animate={{ opacity: [0, 0, 0, 1, 1] }} transition={{ duration: 0.92, times: [0, 0.7, 0.76, 0.82, 1] }}>1</motion.span>
                </div>
                <svg viewBox="0 0 24 24" className="h-7 w-7 drop-shadow-[0_2px_6px_rgba(0,0,0,0.7)]">
                  <circle cx="12" cy="14" r="7" fill="#1c1917" stroke="#57534e" strokeWidth="1" />
                  <circle cx="9.5" cy="11.5" r="1.6" fill="#44403c" />
                  <path d="M12 7V4c0-1.5 2-2 3-1" stroke="#a8a29e" strokeWidth="1.6" fill="none" strokeLinecap="round" />
                  <motion.circle cx="15.4" cy="2.6" r="1.6" fill="#fbbf24" animate={{ opacity: [1, 0.3, 1], scale: [1, 1.35, 1] }} transition={{ repeat: Infinity, duration: 0.22 }} style={{ transformOrigin: "15.4px 2.6px" }} />
                </svg>
              </div>
            </motion.div>
          )}
          {recent.map((rct) => (
            <div key={`bomb${rct.k}`} className="pointer-events-none absolute left-0 top-0 z-10" style={{ transform: `translate(${rct.at.x}px, ${rct.at.y}px)` }}>
              {/* shockwave ring */}
              <motion.div
                initial={{ scale: 0.2, opacity: 0.9 }}
                animate={{ scale: 3.2, opacity: 0 }}
                transition={{ duration: 0.55, ease: "easeOut" }}
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-orange-300/80"
                style={{ width: cell * 1.4, height: cell * 1.4, boxShadow: "0 0 30px 6px rgba(251,146,60,0.5)" }}
              />
              {/* charred victim sinks away */}
              <motion.div
                initial={{ x: -cell / 2, y: -cell / 2, opacity: 1, scale: 1 }}
                animate={{ y: cell, opacity: 0, scale: 0.6, rotate: 20 }}
                transition={{ duration: 0.7, delay: 0.05, ease: "easeIn" }}
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
