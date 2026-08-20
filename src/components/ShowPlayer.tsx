import { useEffect, useMemo, useRef, useState } from "react";
import RaffleChat from "./RaffleChat";

const GAME_META: Record<string, { label: string; icon: string; color: string }> = {
  ELIMINATION: { label: "Eliminación", icon: "⚡", color: "bg-slate-900" },
  DIGIT_REVEAL: { label: "Revelado de dígitos", icon: "🔢", color: "bg-indigo-600" },
  BOMBS: { label: "Bombas", icon: "💣", color: "bg-orange-600" },
  SQUID: { label: "Luz roja, luz verde", icon: "🟢", color: "bg-rose-600" },
  HORSE_RACE: { label: "Carrera", icon: "🐎", color: "bg-amber-600" },
};
const REMOVE_MS = 5000; // eliminated tickets vanish after 5s

interface Participant { number: number; nickname: string | null; avatarUrl: string | null; comment: string | null; }

function Ticket({ p, mine, elim, winner }: { p: Participant; mine: boolean; elim: boolean; winner: boolean }) {
  return (
    <div className={`flex flex-col items-center gap-1 transition-all duration-700 ${elim ? "scale-90 opacity-50 grayscale" : ""}`}>
      <div className={`relative h-12 w-12 rounded-full shadow ${winner ? "ring-4 ring-emerald-400" : mine ? "ring-[3px] ring-sky-500" : "ring-2 ring-white"}`}>
        {p.avatarUrl ? <img src={p.avatarUrl} className="h-full w-full rounded-full object-cover" alt="" loading="lazy" />
          : <div className="flex h-full w-full items-center justify-center rounded-full bg-slate-300 text-sm font-bold text-slate-600">{(p.nickname || "?")[0]}</div>}
        {elim && <div className="absolute inset-0 flex items-center justify-center text-2xl">✗</div>}
        {winner && <div className="absolute -right-1 -top-1 text-lg">🏆</div>}
        {mine && !winner && <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-sky-500 px-1.5 text-[9px] font-bold text-white">TÚ</div>}
      </div>
      <span className={`rounded px-1 font-mono text-[10px] font-bold ${winner ? "bg-emerald-100 text-emerald-700" : mine ? "text-sky-600" : "text-slate-500"}`}>#{p.number}</span>
    </div>
  );
}

export default function ShowPlayer({ slug }: { slug: string }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [myNums, setMyNums] = useState<Set<number>>(new Set());
  const [stageIdx, setStageIdx] = useState(0);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [elimNow, setElimNow] = useState<Set<number>>(new Set());
  const timers = useRef<any[]>([]);
  const tick = useRef<any>(null);

  useEffect(() => {
    fetch(`/api/raffles/${slug}/show`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError("No hay show disponible para este sorteo."));
    fetch(`/api/me/tickets`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.tickets) return;
        const nums = d.tickets.filter((t: any) => t.raffle?.slug === slug).map((t: any) => t.number);
        setMyNums(new Set(nums));
      }).catch(() => {});
  }, [slug]);

  const show = data?.show;
  const participants: Participant[] = data?.participants ?? [];
  const stages = show?.stages ?? [];
  const stage = stages[stageIdx];
  const winners: number[] = show?.winners ?? [];
  const winnerSet = useMemo(() => new Set(winners), [show]);

  const myIndices = useMemo(() => {
    const s = new Set<number>();
    participants.forEach((p, i) => { if (myNums.has(p.number)) s.add(i); });
    return s;
  }, [participants, myNums]);

  function clearTimers() { timers.current.forEach(clearTimeout); timers.current = []; if (tick.current) clearTimeout(tick.current); }

  // Jump to a stage: everything from earlier stages is already gone.
  function goStage(i: number) {
    clearTimers();
    const goneBefore = new Set<number>();
    for (let s = 0; s < i; s++) (stages[s].eliminated as number[]).forEach((e) => goneBefore.add(e));
    setRemoved(goneBefore);
    setElimNow(new Set());
    setStageIdx(i);
    setStep(0);
    setPlaying(false);
  }

  // Reveal one elimination and schedule its disappearance 5s later.
  function reveal(idx: number) {
    setElimNow((prev) => new Set(prev).add(idx));
    const t = setTimeout(() => {
      setElimNow((prev) => { const n = new Set(prev); n.delete(idx); return n; });
      setRemoved((prev) => new Set(prev).add(idx));
    }, REMOVE_MS / Math.max(1, speed));
    timers.current.push(t);
  }

  const stageElim: number[] = stage?.eliminated ?? [];
  const stageDone = step >= stageElim.length;
  const isFinaleDone = stageIdx === stages.length - 1 && stageDone;

  // Autoplay loop
  useEffect(() => {
    if (!playing || !stage) return;
    if (!stageDone) {
      tick.current = setTimeout(() => { reveal(stageElim[step]); setStep((s) => s + 1); }, 380 / speed);
      return () => clearTimeout(tick.current);
    }
    if (stageIdx < stages.length - 1) {
      tick.current = setTimeout(() => goStagePlaying(stageIdx + 1), 1100 / speed);
      return () => clearTimeout(tick.current);
    }
    setPlaying(false);
  }, [playing, step, stageIdx, stageDone, speed, stage]);

  // Advance to next stage while keeping playing.
  function goStagePlaying(i: number) {
    const goneBefore = new Set<number>(removed);
    (stages[i - 1].eliminated as number[]).forEach((e) => goneBefore.add(e));
    setRemoved(goneBefore);
    setElimNow(new Set());
    setStageIdx(i);
    setStep(0);
  }

  useEffect(() => () => clearTimers(), []);

  if (error) return <div className="mx-auto max-w-2xl px-5 py-20 text-center text-slate-400">{error} <a href={`/sorteos/${slug}`} className="text-emerald-600">Volver</a></div>;
  if (!data) return <p className="py-20 text-center text-slate-400">Cargando show…</p>;

  const meta = GAME_META[stage?.game] ?? GAME_META.ELIMINATION;
  const visible = participants.map((_, i) => i).filter((i) => !removed.has(i));
  const aliveCount = participants.length - removed.size - elimNow.size;
  const eliminatedTotal = removed.size + elimNow.size;

  return (
    <div>
      {/* Sticky header with raffle + stage info + controls */}
      <div className="sticky top-[57px] z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-5 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${meta.color} text-lg text-white`}>{meta.icon}</span>
              <div>
                <div className="text-sm font-bold text-slate-900">{data.raffle.title}</div>
                <div className="text-xs text-slate-500">
                  Etapa {stageIdx + 1}/{stages.length}: {meta.label}{stage?.isFinale && " · FINAL"} · <span className="text-emerald-600">{aliveCount} en juego</span> · {eliminatedTotal} fuera
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => goStage(Math.max(0, stageIdx - 1))} disabled={stageIdx === 0} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm disabled:opacity-40">⏮</button>
              <button onClick={() => setPlaying((p) => !p)} className="rounded-lg bg-emerald-600 px-5 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500">{playing ? "⏸" : "▶"}</button>
              <button onClick={() => { if (!stageDone) { stageElim.slice(step).forEach(reveal); setStep(stageElim.length); } else goStage(Math.min(stages.length - 1, stageIdx + 1)); }} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm">⏭</button>
              <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
                <option value={0.5}>0.5x</option><option value={1}>1x</option><option value={2}>2x</option><option value={4}>4x</option>
              </select>
            </div>
          </div>
          {/* stage tabs */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {stages.map((s: any, i: number) => (
              <button key={i} onClick={() => goStage(i)} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${i === stageIdx ? `${(GAME_META[s.game] ?? meta).color} text-white` : "bg-slate-100 text-slate-500"}`}>
                {(GAME_META[s.game] ?? meta).icon} {i + 1}{s.isFinale ? "★" : ""}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-6 px-5 py-6 lg:grid-cols-[1fr_320px]">
        {/* Arena: ALL tickets */}
        <div>
          <div className={`rounded-3xl border border-slate-200 p-5 ${stage?.game === "SQUID" && playing && !stageDone && step % 2 === 1 ? "bg-rose-50" : "bg-gradient-to-b from-slate-50 to-white"}`}>
            {isFinaleDone && (
              <div className="mb-5 rounded-2xl bg-emerald-50 p-5 text-center">
                <div className="text-3xl">🎉</div>
                <h2 className="mt-1 text-lg font-bold text-emerald-800">{winners.length > 1 ? "¡Ganadores!" : "¡Ganador!"} {winners.map((w) => `#${participants[w]?.number}`).join(", ")}</h2>
                <a href={`/verificar?slug=${slug}`} className="mt-3 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Verificar este resultado</a>
              </div>
            )}
            <div className="flex flex-wrap justify-center gap-2.5">
              {visible.map((i) => (
                <Ticket key={i} p={participants[i]} mine={myIndices.has(i)} elim={elimNow.has(i)} winner={isFinaleDone && winnerSet.has(i)} />
              ))}
            </div>
            {visible.length === 0 && <p className="py-10 text-center text-slate-400">…</p>}
          </div>
          <p className="mt-3 text-center text-xs text-slate-400">Todo el show se deriva de la semilla comprometida — reproducible y verificable. Los eliminados desaparecen tras 5s.</p>
        </div>

        {/* Live chat */}
        <div className="lg:sticky lg:top-[150px] lg:self-start">
          <RaffleChat slug={slug} />
        </div>
      </div>
    </div>
  );
}
