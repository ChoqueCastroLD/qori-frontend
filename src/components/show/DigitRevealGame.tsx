import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Avatar, OutTray, cellFor, gridLayout, hashSeed, rng, useNewSteps, useWidth, type GameProps } from "./shared";
import { ParticleCanvas, type Burst } from "./Particles";

// REVELADO DE DIGITOS: a giant split-flap odometer. Unrevealed digit slots
// spin nervously; each reveal (per revealOrder) slams the true digit in with
// a golden flash while non-matching tickets drop out below.
export default function DigitRevealGame({ participants, stage, stageIdx, step, elimSeq, myIndices, winnerSet, isFinaleDone }: GameProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [bursts, setBursts] = useState<Burst[]>([]);

  const aliveBefore: number[] = stage.aliveBefore ?? [];
  const stageElim: number[] = stage.eliminated ?? [];
  const totalSteps = Math.max(1, stageElim.length);
  const winnerNumbers: string[] = stage.data?.winnerNumbers ?? [];
  const revealOrder: number[] = stage.data?.revealOrder ?? [];
  const digitsFlat = useMemo(() => winnerNumbers.flatMap((n) => n.split("")), [winnerNumbers]);

  // Digits revealed so far — proportional to elimination progress (pure fn).
  const revealedCount = step >= totalSteps ? revealOrder.length : Math.floor((step * revealOrder.length) / totalSteps);
  const revealedSet = useMemo(() => new Set(revealOrder.slice(0, revealedCount).map((d) => ((d % Math.max(1, digitsFlat.length)) + digitsFlat.length) % Math.max(1, digitsFlat.length))), [revealOrder, revealedCount, digitsFlat.length]);

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
    return { x: p.x + 16 + cell / 2, y: p.y + cell / 2 };
  };

  useNewSteps(stageIdx, step, (steps) => {
    if (!width) return;
    setBursts((b) => [
      ...b.slice(-10),
      ...steps.map((k) => {
        const { x, y } = posBefore(k);
        return { key: `d${stageIdx}-${k}`, x, y, kind: "puff" as const, seed: hashSeed(stageIdx, k, stageElim[k - 1], 13) };
      }),
    ]);
  });

  // Split into rows per winner number again for display.
  let cursor = 0;
  const numberRows = winnerNumbers.map((n) => {
    const cells = n.split("").map((ch, j) => ({ ch, flat: cursor + j }));
    cursor += n.length;
    return cells;
  });

  return (
    <div>
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-indigo-950 via-slate-950 to-slate-950 px-4 pb-4 pt-5">
        <div className="mb-1 text-center text-[10px] font-bold uppercase tracking-[0.3em] text-indigo-300/70">Número ganador</div>
        <div className="relative z-10 mb-5 flex flex-col items-center gap-2">
          {numberRows.map((cells, row) => (
            <div key={row} className="flex gap-1.5">
              {cells.map(({ ch, flat }) => {
                const revealed = revealedSet.has(flat) || step >= totalSteps;
                const spinDur = 0.45 + rng(stageIdx, flat, 17)() * 0.5;
                return (
                  <div key={flat} className={`relative h-14 w-10 overflow-hidden rounded-lg border sm:h-16 sm:w-12 ${revealed ? "border-amber-400/60 bg-slate-900 shadow-[0_0_18px_rgba(251,191,36,0.35)]" : "border-white/15 bg-slate-900"}`}>
                    <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 border-t border-black/50" />
                    {revealed ? (
                      <motion.div
                        key="on"
                        initial={{ rotateX: 90, opacity: 0 }}
                        animate={{ rotateX: 0, opacity: 1 }}
                        transition={{ duration: 0.3, ease: "easeOut" }}
                        className="flex h-full w-full items-center justify-center font-mono text-3xl font-black text-amber-300 sm:text-4xl"
                      >
                        {ch}
                      </motion.div>
                    ) : (
                      <div className="qori-slotspin absolute inset-x-0 flex flex-col items-center font-mono text-3xl font-black text-white/40 sm:text-4xl" style={{ animationDuration: `${spinDur}s` }}>
                        {["3", "7", "1", "9", "5", "0", "8", "2", "6", "4", "3"].map((d, di) => (
                          <div key={di} className="flex h-14 items-center sm:h-16">{d}</div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          <div className="text-[10px] text-indigo-300/50">
            {revealedCount}/{revealOrder.length || digitsFlat.length} dígitos revelados
          </div>
        </div>
        <div ref={ref} className="relative" style={{ minHeight: Math.max(140, layout.height + 20) }}>
          {width > 0 && alive.map((i, idx) => {
            const p = layout.pos(idx);
            return (
              <motion.div
                key={i}
                initial={false}
                animate={{ x: p.x + 16, y: p.y }}
                transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.7 }}
                className="absolute left-0 top-0"
                style={{ width: cell }}
              >
                <Avatar p={participants[i]} mine={myIndices.has(i)} winner={isFinaleDone && winnerSet.has(i)} size={cell} dark />
              </motion.div>
            );
          })}
          {step > 0 && stageElim[step - 1] != null && width > 0 && (() => {
            const { x, y } = posBefore(step);
            return (
              <motion.div
                key={`drop${step}`}
                initial={{ x: x - cell / 2, y: y - cell / 2, opacity: 1 }}
                animate={{ y: y + 160, opacity: 0, rotate: 25 }}
                transition={{ duration: 0.7, ease: "easeIn" }}
                className="pointer-events-none absolute left-0 top-0 z-10"
                style={{ width: cell }}
              >
                <Avatar p={participants[stageElim[step - 1]]} elim size={cell} ring={false} dark />
              </motion.div>
            );
          })()}
          <ParticleCanvas bursts={bursts} />
        </div>
      </div>
      <OutTray participants={participants} elimSeq={elimSeq} myIndices={myIndices} />
    </div>
  );
}
