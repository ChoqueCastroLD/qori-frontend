import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Avatar, OutTray, arenaMaxH, fitCellFor, gridLayout, hashSeed, rng, useNewSteps, useViewportH, useWidth, type GameProps } from "./shared";
import { ParticleCanvas, type Burst } from "./Particles";

// EL PISO ES HIELO: everyone stands on a chessboard of ice tiles over dark
// water. In escalating waves (data.waves) the ice degrades: roughly half the
// tiles show hairline cracks, half of those crack deeper the next wave, and so
// on - plenty of scary fake-outs - until the tile under each doomed ticket
// SHATTERS and they drop through. Crack levels are a pure function of
// (stage data, tile, step) via the seeded PRNG; nothing is random at runtime.
export default function IceFloorGame({ participants, stage, stageIdx, step, elimSeq, myIndices, winnerSet, isFinaleDone }: GameProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [bursts, setBursts] = useState<Burst[]>([]);
  const vh = useViewportH();

  const aliveBefore: number[] = stage.aliveBefore ?? [];
  const stageElim: number[] = stage.eliminated ?? [];
  const waves: number[][] = stage.data?.waves ?? [stageElim];
  const waveEnds = useMemo(() => {
    const ends: number[] = []; let acc = 0;
    for (const w of waves) { acc += w.length; ends.push(acc); }
    return ends;
  }, [waves]);
  const waveIdx = waveEnds.findIndex((e) => step < e);
  const currentWave = waveIdx === -1 ? waves.length : waveIdx + 1;

  // Fixed tile per ticket for the whole stage - the board never reflows, holes
  // stay where people fell (that's the scary part).
  const slots = useMemo(
    () => aliveBefore.slice().sort((a, b) => participants[b].number - participants[a].number),
    [aliveBefore, participants],
  );
  const slotOf = useMemo(() => {
    const m = new Map<number, number>();
    slots.forEach((i, k) => m.set(i, k));
    return m;
  }, [slots]);

  const maxH = arenaMaxH(vh) - 70;
  const W = Math.max(width, 280);
  const { cell, gap } = useMemo(() => fitCellFor(slots.length, W - 32, maxH), [slots.length, W, maxH]);
  const layout = useMemo(() => gridLayout(slots.length, W - 32, cell, gap), [slots.length, W, cell, gap]);

  // Step (1-based) at which each victim's tile shatters.
  const elimStepOf = useMemo(() => {
    const m = new Map<number, number>();
    stageElim.forEach((i, k) => m.set(i, k + 1));
    return m;
  }, [stageElim]);

  // Seeded neighbor fake-outs: each victim scares 2 adjacent tiles shortly
  // before their own tile gives way.
  const scaredAt = useMemo(() => {
    const m = new Map<number, number>(); // slot -> earliest step it starts cracking in fear
    stageElim.forEach((victim, k) => {
      const s = slotOf.get(victim);
      if (s == null) return;
      const r = rng(stageIdx, victim, 47);
      const opts = [s - 1, s + 1, s - layout.cols, s + layout.cols].filter((n) => n >= 0 && n < slots.length);
      for (let t = 0; t < 2 && opts.length; t++) {
        const pick = opts.splice(Math.floor(r() * opts.length), 1)[0];
        const at = Math.max(1, k); // one step before the victim falls
        m.set(pick, Math.min(m.get(pick) ?? Infinity, at));
      }
    });
    return m;
  }, [stageElim, slotOf, layout.cols, slots.length, stageIdx]);

  // Crack level 0..3 for a tile, 4 = shattered hole. Pure fn of step.
  const levelOf = (slot: number, ticket: number): number => {
    const k = elimStepOf.get(ticket);
    if (k != null) {
      if (step >= k) return 4;
      if (step >= k - 1) return 3;
      if (step >= k - 2) return 2;
    }
    let lvl = 0;
    // ambient wave cracking: ~half the board, then half of those, then half again
    const u = rng(stageIdx, ticket, 31)();
    if (currentWave >= 1 && u < 0.5) lvl = 1;
    if (currentWave >= 2 && u < 0.25) lvl = 2;
    if (currentWave >= 3 && u < 0.12) lvl = 3;
    // neighbor fake-out: cracks jump to tiles beside a doomed one
    const sc = scaredAt.get(slot);
    if (sc != null && step >= sc) lvl = Math.max(lvl, 2);
    return lvl;
  };

  const stageElimSet = useMemo(() => new Set(stageElim.slice(0, step)), [stageElim, step]);

  const tileCenter = (slot: number) => {
    const p = layout.pos(slot);
    return { x: p.x + 16 + cell / 2, y: p.y + 34 + cell / 2 };
  };

  useNewSteps(stageIdx, step, (steps) => {
    if (!width) return;
    setBursts((b) => [
      ...b.slice(-8),
      ...steps.map((k) => {
        const { x, y } = tileCenter(slotOf.get(stageElim[k - 1]) ?? 0);
        return { key: `i${stageIdx}-${k}`, x, y, kind: "shatter" as const, seed: hashSeed(stageIdx, k, stageElim[k - 1], 19) };
      }),
    ]);
  });

  // Recent fallers: drop through their hole into the water.
  const falling = useMemo(() => {
    const out: { i: number; k: number; slot: number }[] = [];
    for (let k = Math.max(1, step - 1); k <= step; k++) {
      const i = stageElim[k - 1];
      if (i == null || !width) continue;
      out.push({ i, k, slot: slotOf.get(i) ?? 0 });
    }
    return out;
  }, [step, stageElim, slotOf, width]);

  // Static crack path variants (drawn over the tile, opacity grows with level).
  const CRACKS = [
    "M9 31 L19 22 L17 11",
    "M9 31 L19 22 L17 11 M19 22 L31 26 M17 11 L9 5",
    "M9 31 L19 22 L17 11 M19 22 L31 26 M17 11 L9 5 M19 22 L25 34 M17 11 L28 4 M31 26 L37 31 M9 31 L3 36",
  ];

  const pad = Math.min(8, gap) / 2; // tile bleeds into the gap without overlapping
  const tile = cell + pad * 2;

  return (
    <div>
      <div ref={ref} className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-cyan-950 via-[#082436] to-slate-950 px-4 pt-8 pb-4" style={{ minHeight: Math.max(260, layout.height + 74) }}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(34,211,238,0.1),transparent_60%)]" />
        <div className="absolute left-1/2 top-2 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.25em] text-cyan-300/70">
          El piso es hielo · Ola {currentWave}/{waves.length}
        </div>
        {width > 0 && slots.map((i, slot) => {
          const p = layout.pos(slot);
          const gone = stageElimSet.has(i);
          const lvl = levelOf(slot, i);
          const dark = (Math.floor(slot / layout.cols) + (slot % layout.cols)) % 2 === 1;
          return (
            <div key={`t${slot}`} className="absolute left-0 top-0" style={{ transform: `translate(${p.x + 16 - 4}px, ${p.y + 34 - 4}px)` }}>
              {gone ? (
                // shattered hole: dark water + a slow ripple
                <div className="relative rounded-md bg-slate-950/90 shadow-[inset_0_2px_8px_rgba(0,0,0,0.9)]" style={{ width: tile, height: tile }}>
                  <div className="absolute inset-2 animate-pulse rounded-full border border-cyan-400/20" />
                </div>
              ) : (
                <div
                  className={`relative rounded-md border transition-colors duration-500 ${
                    lvl >= 3 ? "border-white/60 bg-cyan-200/80" : dark ? "border-cyan-100/30 bg-cyan-300/60" : "border-cyan-100/30 bg-cyan-100/70"
                  }`}
                  style={{ width: tile, height: tile }}
                >
                  {lvl > 0 && (
                    <svg viewBox="0 0 40 40" className="absolute inset-0 h-full w-full" aria-hidden="true">
                      <path d={CRACKS[Math.min(2, lvl - 1)]} fill="none" stroke="rgba(8,51,68,0.85)" strokeWidth={lvl >= 3 ? 1.6 : 1} strokeLinecap="round" />
                    </svg>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {width > 0 && slots.map((i, slot) => {
          if (stageElimSet.has(i)) return null;
          const p = layout.pos(slot);
          const lvl = levelOf(slot, i);
          const panicking = lvl >= 2; // their ice is giving way - they feel it
          return (
            <div key={i} className="absolute left-0 top-0" style={{ transform: `translate(${p.x + 16}px, ${p.y + 34}px)`, width: cell, zIndex: panicking ? 15 : 10 }}>
              <motion.div
                animate={panicking ? { x: [0, -1.5, 1.5, -1, 1, 0], rotate: [0, -2, 2, 0] } : { x: 0, rotate: 0 }}
                transition={panicking ? { repeat: Infinity, duration: lvl >= 3 ? 0.22 : 0.4 } : { duration: 0.1 }}
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
              initial={{ x: p.x + 16, y: p.y + 34, opacity: 1, scale: 1 }}
              animate={{ y: p.y + 34 + cell * 1.6, opacity: 0, scale: 0.55 }}
              transition={{ duration: 0.7, ease: "easeIn" }}
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
