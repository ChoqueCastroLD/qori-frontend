import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Avatar, OutTray, hashSeed, rng, useNewSteps, useWidth, type GameProps } from "./shared";
import { ParticleCanvas, type Burst } from "./Particles";

// CARRERA: horizontal lanes toward a checkered finish line. Racers surge with
// per-lane seeded pacing (using data.steps), laggards tumble out with a dust
// cloud, survivors kick up dust as they advance.
export default function HorseRaceGame({ participants, stage, stageIdx, step, elimSeq, myIndices, winnerSet, isFinaleDone }: GameProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [bursts, setBursts] = useState<Burst[]>([]);

  const aliveBefore: number[] = stage.aliveBefore ?? [];
  const stageElim: number[] = stage.eliminated ?? [];
  const lanes: number[] = stage.data?.lanes?.length ? stage.data.lanes : aliveBefore;
  const microSteps: number = Math.max(1, stage.data?.steps ?? stageElim.length);
  const totalSteps = Math.max(1, stageElim.length);

  const elimAt = useMemo(() => {
    const m = new Map<number, number>();
    stageElim.forEach((i, k) => m.set(i, k + 1));
    return m;
  }, [stageElim]);

  const cell = lanes.length > 40 ? 30 : lanes.length > 20 ? 36 : 44;
  const rowH = cell + 22;
  const W = Math.max(width, 280);
  const trackW = W - 120; // space for finish flag

  // Pure pacing: progress(lane, step) from seeded wave; survivors hit the
  // finish exactly at the last step, eliminated freeze where they were caught.
  const progAt = (i: number, s: number) => {
    const base = Math.min(1, s / totalSteps);
    const r = rng(stageIdx, i, 21);
    const amp = 0.08 + r() * 0.1;
    const freq = 0.6 + r() * 1.6 + (microSteps % 7) * 0.05;
    const ph = r() * Math.PI * 2;
    return Math.max(0.02, Math.min(1, base + Math.sin(s * freq + ph) * amp * Math.sin(base * Math.PI)));
  };

  useNewSteps(stageIdx, step, (steps) => {
    if (!width) return;
    const fresh: Burst[] = [];
    for (const k of steps) {
      const victim = stageElim[k - 1];
      const lane = lanes.indexOf(victim);
      if (lane >= 0) {
        fresh.push({
          key: `h${stageIdx}-${k}`,
          x: 60 + progAt(victim, k - 1) * trackW,
          y: 16 + lane * rowH + cell / 2,
          kind: "dust",
          seed: hashSeed(stageIdx, k, victim, 5),
        });
      }
      // dust behind the current front-runner for extra motion feel
      const leaders = lanes.filter((i) => !stageElim.slice(0, k).includes(i));
      if (leaders.length) {
        const lead = leaders.reduce((a, b) => (progAt(a, k) >= progAt(b, k) ? a : b));
        fresh.push({
          key: `hd${stageIdx}-${k}`,
          x: 60 + progAt(lead, k) * trackW - cell / 2,
          y: 16 + lanes.indexOf(lead) * rowH + cell / 2,
          kind: "dust",
          seed: hashSeed(stageIdx, k, lead, 9),
        });
      }
    }
    setBursts((b) => [...b.slice(-10), ...fresh]);
  });

  const fieldH = lanes.length * rowH + 32;

  return (
    <div>
      <div className="max-h-[62vh] overflow-y-auto rounded-2xl">
        <div ref={ref} className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-amber-950 via-[#2a1c0e] to-amber-950 px-4 py-4" style={{ minHeight: Math.max(220, fieldH) }}>
          {/* finish line */}
          <div className="absolute bottom-2 top-2 z-0" style={{ left: 60 + trackW + cell }}>
            <div className="h-full w-3 [background:repeating-conic-gradient(#fff_0%_25%,#0f172a_0%_50%)_0_0/8px_8px]" />
          </div>
          {lanes.map((_, lane) => (
            <div key={lane} className="absolute inset-x-2 z-0" style={{ top: 16 + lane * rowH + cell / 2 }}>
              <div className="border-t border-dashed border-white/10" />
            </div>
          ))}
          {lanes.map((i, lane) => {
            const e = elimAt.get(i);
            const out = e != null && step >= e;
            const justOut = e != null && step >= e && step <= e + 1;
            const p = out ? Math.max(0.02, progAt(i, e - 1) - 0.08) : progAt(i, step);
            const x = 60 + p * trackW;
            const y = 16 + lane * rowH;
            const running = !out && step > 0 && step < totalSteps;
            return (
              <motion.div
                key={i}
                initial={false}
                animate={{ x, y, opacity: out ? 0.35 : 1, rotate: out ? 90 : 0, scale: out ? 0.85 : 1 }}
                transition={{ type: "spring", stiffness: justOut ? 300 : 120, damping: 22, mass: 0.8 }}
                className="absolute left-0 top-0 z-10"
                style={{ width: cell }}
              >
                <motion.div animate={running ? { y: [0, -2.5, 0] } : {}} transition={{ repeat: Infinity, duration: 0.32 + (lane % 4) * 0.04 }}>
                  <Avatar p={participants[i]} mine={myIndices.has(i)} elim={out} winner={isFinaleDone && winnerSet.has(i)} size={cell} dark />
                </motion.div>
              </motion.div>
            );
          })}
          <div className="absolute right-3 top-2 z-10 rounded-full bg-black/40 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-300/80">Meta</div>
          <ParticleCanvas bursts={bursts} />
        </div>
      </div>
      <OutTray participants={participants} elimSeq={elimSeq} myIndices={myIndices} />
    </div>
  );
}
