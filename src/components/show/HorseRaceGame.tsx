import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Avatar, OutTray, TargetRing, arenaMaxH, hashSeed, rng, useNewSteps, useViewportH, useWidth, type GameProps } from "./shared";
import { ParticleCanvas, type Burst } from "./Particles";

// CARRERA: horizontal lanes toward a checkered finish line. A CONTESTED race:
// per-lane seeded wobble creates real lead changes, some horses hold back and
// unleash a late surge, and everyone converges to a photo-finish. Laggards
// tumble out with dust; the next victim's lane glows red before the fall.
// Lane heights scale so the whole field always fits the viewport (no scroll).
export default function HorseRaceGame({ participants, stage, stageIdx, step, elimSeq, myIndices, winnerSet, isFinaleDone }: GameProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [bursts, setBursts] = useState<Burst[]>([]);
  const vh = useViewportH();

  const aliveBefore: number[] = stage.aliveBefore ?? [];
  const stageElim: number[] = stage.eliminated ?? [];
  const lanes: number[] = stage.data?.lanes?.length ? stage.data.lanes : aliveBefore.slice(0, 14);
  const microSteps: number = Math.max(1, stage.data?.steps ?? stageElim.length);
  const totalSteps = Math.max(1, stageElim.length);

  const elimAt = useMemo(() => {
    const m = new Map<number, number>();
    stageElim.forEach((i, k) => m.set(i, k + 1));
    return m;
  }, [stageElim]);

  // Fit ALL lanes inside the viewport cap: row height derives from available
  // height, avatar size from row height. Internal layout only - never scroll.
  const maxH = arenaMaxH(vh);
  const rowH = Math.max(26, Math.min(66, Math.floor((maxH - 40) / Math.max(1, lanes.length))));
  const cell = Math.max(20, Math.min(44, rowH - 12));
  const W = Math.max(width, 280);
  const trackW = W - 110 - cell; // space for finish flag
  const fieldH = lanes.length * rowH + 36;

  // Dramatic but pure pacing: base progress + seeded double-sine wobble (lead
  // changes) + a personality "late surge" that peaks in the final stretch and
  // converges at the line (photo-finish). Eliminated freeze where caught;
  // survivors hit exactly 1.0 at the last step. Pure fn of (stage, lane, step).
  const progAt = (i: number, s: number) => {
    const base = Math.min(1, s / totalSteps);
    const r = rng(stageIdx, i, 21);
    const a1 = 0.1 + r() * 0.1;
    const f1 = 0.5 + r() * 1.3 + (microSteps % 7) * 0.05;
    const p1 = r() * Math.PI * 2;
    const a2 = 0.05 + r() * 0.07;
    const f2 = 1.4 + r() * 1.8;
    const p2 = r() * Math.PI * 2;
    const surge = r(); // >0.5 = closer with a late kick, <0.5 = fast starter who fades
    const env = Math.sin(base * Math.PI); // pins start and finish
    const wob = env * (a1 * Math.sin(s * f1 + p1) + a2 * Math.sin(s * f2 + p2));
    const lateT = Math.max(0, base - 0.6) / 0.4;
    const kick = (surge - 0.5) * 0.34 * Math.sin(Math.min(1, lateT) * Math.PI);
    return Math.max(0.02, Math.min(1, base + wob + kick));
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
          y: 18 + lane * rowH + cell / 2,
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
          y: 18 + lanes.indexOf(lead) * rowH + cell / 2,
          kind: "dust",
          seed: hashSeed(stageIdx, k, lead, 9),
        });
      }
    }
    setBursts((b) => [...b.slice(-10), ...fresh]);
  });

  // Current leader (mid-race only) for the "1°" chip - pure fn of step.
  const leader = useMemo(() => {
    if (step <= 0 || step >= totalSteps) return null;
    const inRace = lanes.filter((i) => (elimAt.get(i) ?? Infinity) > step);
    if (inRace.length < 2) return null;
    return inRace.reduce((a, b) => (progAt(a, step) >= progAt(b, step) ? a : b));
  }, [step, lanes, elimAt, stageIdx, totalSteps]);

  const nextVictim = step < stageElim.length ? stageElim[step] : null;

  return (
    <div>
      <div ref={ref} className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-amber-950 via-[#2a1c0e] to-amber-950 px-4 py-4" style={{ minHeight: Math.max(220, fieldH), maxHeight: Math.max(240, maxH) }}>
        {/* finish line */}
        <div className="absolute bottom-2 top-2 z-0" style={{ left: 60 + trackW + cell }}>
          <div className="h-full w-3 [background:repeating-conic-gradient(#fff_0%_25%,#0f172a_0%_50%)_0_0/8px_8px]" />
        </div>
        {lanes.map((i, lane) => (
          <div key={lane} className="absolute inset-x-2 z-0" style={{ top: 18 + lane * rowH + cell / 2 }}>
            <div className={`border-t border-dashed ${nextVictim === i ? "border-rose-500/50" : "border-white/10"}`} />
            {nextVictim === i && (
              <div className="qori-lanedanger absolute inset-x-0 rounded" style={{ top: -cell / 2 - 4, height: cell + 8 }} />
            )}
          </div>
        ))}
        {lanes.map((i, lane) => {
          const e = elimAt.get(i);
          const out = e != null && step >= e;
          const justOut = e != null && step >= e && step <= e + 1;
          const p = out ? Math.max(0.02, progAt(i, e - 1) - 0.08) : progAt(i, step);
          const x = 60 + p * trackW;
          const y = 18 + lane * rowH;
          const running = !out && step > 0 && step < totalSteps;
          const targeted = !out && nextVictim === i;
          return (
            <motion.div
              key={i}
              initial={false}
              animate={{ x, y, opacity: out ? 0.35 : 1, rotate: out ? 90 : 0, scale: out ? 0.85 : 1 }}
              transition={{ type: "spring", stiffness: justOut ? 300 : 90, damping: 24, mass: 0.9 }}
              className="absolute left-0 top-0 z-10"
              style={{ width: cell }}
            >
              <motion.div animate={running ? { y: [0, -2.5, 0] } : {}} transition={{ repeat: Infinity, duration: 0.32 + (lane % 4) * 0.04 }} className="relative">
                {targeted && <TargetRing />}
                {leader === i && (
                  <div className="absolute -left-2 -top-2 z-20 rounded-full bg-amber-400 px-1.5 text-[8px] font-black uppercase tracking-wide text-amber-950 shadow">Líder</div>
                )}
                <Avatar p={participants[i]} mine={myIndices.has(i)} elim={out} winner={isFinaleDone && winnerSet.has(i)} size={cell} dark />
              </motion.div>
            </motion.div>
          );
        })}
        <div className="absolute right-3 top-2 z-10 rounded-full bg-black/40 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-300/80">Meta</div>
        <ParticleCanvas bursts={bursts} />
      </div>
      <OutTray participants={participants} elimSeq={elimSeq} myIndices={myIndices} />
    </div>
  );
}
