import { useEffect, useMemo, useRef, useState } from "react";

const GAME_META: Record<string, { label: string; icon: string; color: string; verb: string }> = {
  ELIMINATION: { label: "Eliminación", icon: "⚡", color: "bg-slate-900", verb: "eliminado" },
  DIGIT_REVEAL: { label: "Revelado de dígitos", icon: "🔢", color: "bg-indigo-600", verb: "descartado" },
  BOMBS: { label: "Bombas", icon: "💣", color: "bg-orange-600", verb: "explotó" },
  SQUID: { label: "Luz roja, luz verde", icon: "🟢", color: "bg-rose-600", verb: "eliminado" },
  HORSE_RACE: { label: "Carrera", icon: "🐎", color: "bg-amber-600", verb: "quedó atrás" },
};

interface Participant { number: number; nickname: string | null; avatarUrl: string | null; comment: string | null; }

function Avatar({ p, state, big }: { p: Participant; state: "alive" | "out" | "winner"; big?: boolean }) {
  const size = big ? "h-16 w-16" : "h-12 w-12";
  return (
    <div className={`flex flex-col items-center gap-1 transition-all duration-500 ${state === "out" ? "scale-90 opacity-40 grayscale" : ""}`}>
      <div className={`relative ${size} rounded-full ${state === "winner" ? "ring-4 ring-emerald-400" : "ring-2 ring-white"} shadow`}>
        {p.avatarUrl ? (
          <img src={p.avatarUrl} className="h-full w-full rounded-full object-cover" alt="" />
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-full bg-slate-300 text-sm font-bold text-slate-600">{(p.nickname || "?")[0]}</div>
        )}
        {state === "out" && <div className="absolute inset-0 flex items-center justify-center text-2xl">✗</div>}
        {state === "winner" && <div className="absolute -right-1 -top-1 text-lg">🏆</div>}
      </div>
      <span className={`rounded px-1.5 font-mono text-[10px] font-bold ${state === "winner" ? "bg-emerald-100 text-emerald-700" : "text-slate-500"}`}>#{p.number}</span>
    </div>
  );
}

export default function ShowPlayer({ slug }: { slug: string }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [stageIdx, setStageIdx] = useState(0);
  const [step, setStep] = useState(0); // eliminations revealed within current stage
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const timer = useRef<any>(null);

  useEffect(() => {
    fetch(`/api/raffles/${slug}/show`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError("No hay show disponible para este sorteo."));
  }, [slug]);

  const show = data?.show;
  const participants: Participant[] = data?.participants ?? [];
  const stages = show?.stages ?? [];
  const stage = stages[stageIdx];
  const winners: number[] = show?.winners ?? [];

  // Visible arena for the current stage: winners + this stage's eliminated + fill.
  const visible = useMemo(() => {
    if (!stage) return [];
    const set = new Set<number>();
    winners.forEach((w) => set.add(w));
    (stage.eliminated as number[]).forEach((e) => set.add(e));
    for (const a of stage.aliveBefore as number[]) { if (set.size >= 54) break; set.add(a); }
    return [...set];
  }, [stage, winners]);

  const elimVisible = useMemo(
    () => (stage ? (stage.eliminated as number[]).filter((e) => visible.includes(e)) : []),
    [stage, visible],
  );
  const revealed = new Set(elimVisible.slice(0, step));
  const stageDone = step >= elimVisible.length;
  const isFinaleDone = stageIdx === stages.length - 1 && stageDone;

  // Autoplay
  useEffect(() => {
    if (!playing || !stage) return;
    if (stageDone) {
      if (stageIdx < stages.length - 1) {
        timer.current = setTimeout(() => { setStageIdx((i) => i + 1); setStep(0); }, 900 / speed);
      } else setPlaying(false);
      return () => clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => setStep((s) => s + 1), 420 / speed);
    return () => clearTimeout(timer.current);
  }, [playing, step, stageIdx, stageDone, stage, speed, stages.length]);

  if (error) return <div className="mx-auto max-w-2xl px-5 py-20 text-center text-slate-400">{error} <a href={`/sorteos/${slug}`} className="text-emerald-600">Volver</a></div>;
  if (!data) return <p className="py-20 text-center text-slate-400">Cargando show…</p>;

  const meta = GAME_META[stage?.game] ?? GAME_META.ELIMINATION;

  function goStage(i: number) { setStageIdx(i); setStep(0); setPlaying(false); }

  return (
    <div className="mx-auto max-w-4xl px-5 py-8">
      <a href={`/sorteos/${slug}`} class="text-sm text-slate-500 hover:text-slate-900">← {data.raffle.title}</a>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">Show del sorteo</h1>

      {/* Stage nav */}
      <div className="mt-5 flex flex-wrap gap-2">
        {stages.map((s: any, i: number) => (
          <button key={i} onClick={() => goStage(i)} className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${i === stageIdx ? `${(GAME_META[s.game] ?? meta).color} text-white` : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
            <span>{(GAME_META[s.game] ?? meta).icon}</span>{(GAME_META[s.game] ?? meta).label}{s.isFinale ? " · final" : ""}
          </button>
        ))}
      </div>

      {/* Arena */}
      <div className={`mt-4 overflow-hidden rounded-3xl border border-slate-200 ${stage?.game === "SQUID" && !stageDone && step % 2 === 1 ? "bg-rose-50" : "bg-gradient-to-b from-slate-50 to-white"} p-6`}>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${meta.color} text-lg text-white`}>{meta.icon}</span>
            <div>
              <div className="font-bold text-slate-900">{meta.label} {stage?.isFinale && <span className="text-emerald-600">· FINAL</span>}</div>
              <div className="text-xs text-slate-500">Fase {stageIdx + 1} de {stages.length} · {revealed.size} {meta.verb}(s)</div>
            </div>
          </div>
          {stage?.game === "DIGIT_REVEAL" && stage.data?.winnerNumbers && (
            <div className="flex gap-1">
              {(stage.data.winnerNumbers[0] as string).split("").map((d: string, i: number) => (
                <span key={i} className={`flex h-8 w-6 items-center justify-center rounded font-mono font-bold ${stageDone || isFinaleDone ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-300"}`}>{stageDone || isFinaleDone ? d : "?"}</span>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          {visible.map((idx) => {
            const p = participants[idx];
            if (!p) return null;
            const isWinner = winners.includes(idx);
            const out = revealed.has(idx);
            const state = isFinaleDone && isWinner ? "winner" : out ? "out" : "alive";
            return <Avatar key={idx} p={p} state={state} big={isFinaleDone && isWinner} />;
          })}
          {stage && (stage.aliveBefore as number[]).length > visible.length && (
            <div className="flex h-12 items-center rounded-full bg-slate-100 px-3 text-xs font-medium text-slate-500">+{(stage.aliveBefore as number[]).length - visible.length} más</div>
          )}
        </div>

        {isFinaleDone && (
          <div className="mt-6 rounded-2xl bg-emerald-50 p-5 text-center">
            <div className="text-3xl">🎉</div>
            <h2 className="mt-1 text-lg font-bold text-emerald-800">
              {winners.length > 1 ? "¡Ganadores!" : "¡Ganador!"} {winners.map((w) => `#${participants[w]?.number}`).join(", ")}
            </h2>
            <a href={`/verificar?slug=${slug}`} className="mt-3 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Verificar este resultado</a>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="mt-4 flex items-center justify-center gap-3">
        <button onClick={() => goStage(Math.max(0, stageIdx - 1))} disabled={stageIdx === 0} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 disabled:opacity-40">⏮</button>
        <button onClick={() => setPlaying((p) => !p)} className="rounded-lg bg-emerald-600 px-6 py-2 text-sm font-semibold text-white hover:bg-emerald-500">{playing ? "⏸ Pausa" : "▶ Reproducir"}</button>
        <button onClick={() => { if (!stageDone) setStep(elimVisible.length); else goStage(Math.min(stages.length - 1, stageIdx + 1)); }} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600">⏭</button>
        <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="rounded-lg border border-slate-200 px-2 py-2 text-sm">
          <option value={0.5}>0.5x</option><option value={1}>1x</option><option value={2}>2x</option><option value={4}>4x</option>
        </select>
      </div>
      <p className="mt-4 text-center text-xs text-slate-400">Todo el show se deriva de la semilla comprometida — reproducible y verificable.</p>
    </div>
  );
}
