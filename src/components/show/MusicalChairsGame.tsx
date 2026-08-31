import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Avatar, OutTray, arenaMaxH, useViewportH, useWidth, type GameProps } from "./shared";

// LAS SILLAS - show, don't tell: a real ring of chairs sits in the center and
// the alive tickets literally WALK AROUND them (the ring spins). Chairs =
// survivors of the current round (alive - ~10%). When a ticket is out it's
// bumped off the ring. Who leaves and when is the stage's `eliminated` order
// (deterministic); the spin is ambient motion like the other games' idle loops.
function ChairIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 11V5.5A1.5 1.5 0 0 1 8.5 4h1A1.5 1.5 0 0 1 11 5.5V11M6 11h11a1 1 0 0 1 1 1v0a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v0a1 1 0 0 1 1-1ZM7 13v6M16 13v6M7 16h9" />
    </svg>
  );
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export default function MusicalChairsGame({ participants, stage, stageIdx, step, elimSeq, myIndices, winnerSet, isFinaleDone }: GameProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const vh = useViewportH();

  const aliveBefore: number[] = stage.aliveBefore ?? [];
  const stageElim: number[] = stage.eliminated ?? [];
  const rounds: number[][] = stage.data?.rounds ?? [stageElim];
  const roundEnds = useMemo(() => { const e: number[] = []; let a = 0; for (const r of rounds) { a += r.length; e.push(a); } return e; }, [rounds]);
  const rFound = roundEnds.findIndex((e) => step < e);
  const roundIdx = rFound === -1 ? rounds.length - 1 : rFound;
  const roundStart = roundIdx === 0 ? 0 : roundEnds[roundIdx - 1];
  const aliveAtRoundStart = aliveBefore.length - roundStart;
  const chairsCount = Math.max(1, aliveAtRoundStart - (rounds[roundIdx]?.length ?? 0));
  const musicPlaying = !roundEnds.includes(step) || step === 0;

  const goneSet = useMemo(() => new Set(stageElim.slice(0, step)), [stageElim, step]);
  const alive = useMemo(() => aliveBefore.filter((i) => !goneSet.has(i)), [aliveBefore, goneSet]);

  const H = Math.min(arenaMaxH(vh), 520);
  const W = Math.max(width, 280);
  const cx = W / 2, cy = H / 2 + 8;
  const N = Math.max(1, alive.length);
  const outR = Math.max(70, Math.min(W, H) / 2 - 16);
  const avSize = clamp(Math.floor((2 * Math.PI * outR) / N * 0.8), 16, 44);
  const ringR = outR - avSize * 0.55;
  const chairR = Math.max(28, ringR * 0.56);

  const chairs = useMemo(() => Array.from({ length: chairsCount }, (_, k) => {
    const a = (-90 + (360 * k) / chairsCount) * (Math.PI / 180);
    return { x: cx + chairR * Math.cos(a), y: cy + chairR * Math.sin(a) };
  }), [chairsCount, cx, cy, chairR]);

  const dur = 14; // seconds per revolution (ambient)

  return (
    <div>
      <div ref={ref} className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-violet-950 via-slate-900 to-slate-950" style={{ height: H }}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(139,92,246,0.16),transparent_62%)]" />
        <div className="absolute left-1/2 top-2 z-20 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.22em] text-violet-300/80">
          Las sillas · Ronda {roundIdx + 1}/{rounds.length}
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${musicPlaying ? "bg-violet-500/20 text-violet-200" : "bg-rose-500/25 text-rose-200"}`}>
            <ChairIcon className="h-3 w-3" /> {chairsCount} {musicPlaying ? "· suena la música" : "· ¡silencio!"}
          </span>
        </div>

        {/* Chairs: a real ring in the center (static). */}
        {width > 0 && chairs.map((c, k) => (
          <div key={`c${k}`} className="absolute z-0 text-violet-300/70 drop-shadow" style={{ left: c.x - 15, top: c.y - 15 }}>
            <ChairIcon className="h-[30px] w-[30px]" />
          </div>
        ))}
        {width > 0 && (
          <div className="absolute z-0 -translate-x-1/2 -translate-y-1/2 text-center" style={{ left: cx, top: cy }}>
            <ChairIcon className="mx-auto h-6 w-6 text-violet-400/40" />
            <div className="mt-0.5 text-[10px] font-semibold text-violet-300/50">{chairsCount} sillas</div>
          </div>
        )}

        {/* Tickets literally walking around the chairs (the ring spins). */}
        {width > 0 && (
          <motion.div
            className="absolute inset-0 z-10"
            style={{ transformOrigin: `${cx}px ${cy}px` }}
            animate={{ rotate: musicPlaying ? 360 : 0 }}
            transition={musicPlaying ? { repeat: Infinity, duration: dur, ease: "linear" } : { duration: 0.4, ease: "easeOut" }}
          >
            <AnimatePresence>
              {alive.map((i, k) => {
                const a = (-90 + (360 * k) / N) * (Math.PI / 180);
                const x = cx + ringR * Math.cos(a);
                const y = cy + ringR * Math.sin(a);
                return (
                  <motion.div
                    key={i}
                    className="absolute"
                    style={{ left: x - avSize / 2, top: y - avSize / 2, width: avSize }}
                    initial={false}
                    exit={{ opacity: 0, scale: 0.4 }}
                    transition={{ duration: 0.45 }}
                  >
                    {/* counter-rotate so faces stay upright while orbiting */}
                    <motion.div
                      animate={{ rotate: musicPlaying ? -360 : 0 }}
                      transition={musicPlaying ? { repeat: Infinity, duration: dur, ease: "linear" } : { duration: 0.4, ease: "easeOut" }}
                    >
                      <Avatar p={participants[i]} mine={myIndices.has(i)} winner={isFinaleDone && winnerSet.has(i)} size={avSize} dark />
                    </motion.div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
      <OutTray participants={participants} elimSeq={elimSeq} myIndices={myIndices} />
    </div>
  );
}
