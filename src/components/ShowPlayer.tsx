import { useEffect, useMemo, useRef, useState } from "react";
import { motion, LayoutGroup } from "framer-motion";
import RaffleChat from "./RaffleChat";
import Icon from "./Icon";

const GAME_META: Record<string, { label: string; icon: string; color: string }> = {
  ELIMINATION: { label: "Eliminación", icon: "bolt", color: "bg-slate-900" },
  DIGIT_REVEAL: { label: "Revelado de dígitos", icon: "hash", color: "bg-indigo-600" },
  BOMBS: { label: "Bombas", icon: "fire", color: "bg-orange-600" },
  SQUID: { label: "Luz roja, luz verde", icon: "stop", color: "bg-rose-600" },
  HORSE_RACE: { label: "Carrera", icon: "flag", color: "bg-amber-600" },
};

// Fixed deterministic timeline -> every client renders the same frame from the
// shared startsAt clock (synchronized live show, no WebSocket needed).
const STEP_MS = 450;
const GAP_MS = 1400;

interface Participant { number: number; nickname: string | null; avatarUrl: string | null; comment: string | null; boughtAt?: string | null; }

function fmtDate(iso?: string | null): string {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString("es-PE", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}

function Ticket({ p, mine, elim, winner }: { p: Participant; mine: boolean; elim: boolean; winner: boolean }) {
  return (
    <div className={`group relative flex w-[52px] flex-col items-center gap-1 transition-[filter,opacity] duration-500 ${elim ? "opacity-45 grayscale" : ""}`}>
      <div className={`relative h-12 w-12 rounded-full shadow ${winner ? "ring-4 ring-emerald-400" : mine ? "ring-[3px] ring-sky-500" : "ring-2 ring-white"}`}>
        {p.avatarUrl ? <img src={p.avatarUrl} className="h-full w-full rounded-full object-cover" alt="" loading="lazy" />
          : <div className="flex h-full w-full items-center justify-center rounded-full bg-slate-300 text-sm font-bold text-slate-600">{(p.nickname || "?")[0]}</div>}
        {elim && <div className="absolute inset-0 flex items-center justify-center text-slate-600"><Icon name="x" className="h-5 w-5" /></div>}
        {winner && <div className="absolute -right-1 -top-1 text-amber-500"><Icon name="trophy" className="h-4 w-4" /></div>}
        {mine && !winner && <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-sky-500 px-1.5 text-[9px] font-bold text-white">TÚ</div>}
      </div>
      <span className={`rounded px-1 font-mono text-[10px] font-bold ${winner ? "bg-emerald-100 text-emerald-700" : mine ? "text-sky-600" : "text-slate-500"}`}>#{p.number}</span>
      {/* Hover card: buyer, photo, comment, purchase date */}
      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1 hidden w-44 -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-2.5 text-left shadow-xl group-hover:block">
        <div className="flex items-center gap-2">
          {p.avatarUrl ? <img src={p.avatarUrl} className="h-8 w-8 rounded-full object-cover" alt="" /> : <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-500">{(p.nickname || "?")[0]}</span>}
          <div className="min-w-0">
            <div className="truncate text-xs font-bold text-slate-900">{p.nickname || "Anónimo"}</div>
            <div className="font-mono text-[10px] text-slate-500">Ticket #{p.number}</div>
          </div>
        </div>
        {p.comment && <div className="mt-1 line-clamp-2 text-[10px] italic text-slate-500">“{p.comment}”</div>}
        {p.boughtAt && <div className="mt-1 text-[10px] text-slate-400">Comprado: {fmtDate(p.boughtAt)}</div>}
      </div>
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
  const [liveMode, setLiveMode] = useState(false);
  const [secsToStart, setSecsToStart] = useState(0);
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
        setMyNums(new Set(d.tickets.filter((t: any) => t.raffle?.slug === slug).map((t: any) => t.number)));
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

  // --- Live synchronization (clock-driven) ---
  const totalDuration = useMemo(
    () => stages.reduce((acc: number, s: any, i: number) => acc + s.eliminated.length * STEP_MS + (i < stages.length - 1 ? GAP_MS : 0), 0),
    [stages],
  );
  function positionAt(elapsed: number): { s: number; step: number } {
    let t = 0;
    for (let s = 0; s < stages.length; s++) {
      const n = stages[s].eliminated.length;
      if (elapsed < t + n * STEP_MS) return { s, step: Math.floor((elapsed - t) / STEP_MS) };
      t += n * STEP_MS;
      if (elapsed < t + GAP_MS) return { s, step: n };
      t += GAP_MS;
    }
    const last = stages.length - 1;
    return { s: last, step: stages[last]?.eliminated.length ?? 0 };
  }
  // If the draw just happened, drive the show by the shared clock so all viewers
  // see the same frame. Once it ends (or if it's an old draw), fall back to replay.
  useEffect(() => {
    if (!data || !stages.length) return;
    const startsAtMs = new Date(data.startsAt).getTime();
    if (Date.now() >= startsAtMs + totalDuration + 2000) return; // old -> manual replay
    const id = setInterval(() => {
      const elapsed = Date.now() - startsAtMs;
      if (elapsed < 0) { setSecsToStart(Math.ceil(-elapsed / 1000)); setLiveMode(true); return; }
      setSecsToStart(0);
      if (elapsed < totalDuration) {
        setLiveMode(true);
        const p = positionAt(elapsed);
        setStageIdx(p.s); setStep(p.step);
      } else {
        setLiveMode(false);
        setStageIdx(stages.length - 1);
        setStep(stages[stages.length - 1].eliminated.length);
        clearInterval(id);
      }
    }, 250);
    return () => clearInterval(id);
  }, [data, totalDuration]);

  // Global elimination sequence up to the current (stage, step).
  const elimSeq = useMemo(() => {
    const seq: number[] = [];
    for (let s = 0; s < stageIdx; s++) seq.push(...((stages[s]?.eliminated as number[]) ?? []));
    seq.push(...((stage?.eliminated as number[]) ?? []).slice(0, step));
    return seq;
  }, [stageIdx, step, stages, stage]);
  const elimSet = useMemo(() => new Set(elimSeq), [elimSeq]);

  // Active tickets: descending by number. Eliminated: appended in REVERSE discard
  // order (first discarded ends up last of all). Reorders animate via layout.
  const gridOrder = useMemo(() => {
    if (!participants.length) return [];
    const active = participants.map((_, i) => i).filter((i) => !elimSet.has(i))
      .sort((a, b) => participants[b].number - participants[a].number);
    return [...active, ...elimSeq.slice().reverse()];
  }, [participants, elimSet, elimSeq]);

  const stageElim: number[] = stage?.eliminated ?? [];
  const stageDone = step >= stageElim.length;
  const isFinaleDone = stageIdx === stages.length - 1 && stageDone;

  useEffect(() => {
    if (liveMode || !playing || !stage) return;
    if (!stageDone) {
      tick.current = setTimeout(() => setStep((s) => s + 1), 360 / speed);
      return () => clearTimeout(tick.current);
    }
    if (stageIdx < stages.length - 1) {
      tick.current = setTimeout(() => { setStageIdx((i) => i + 1); setStep(0); }, 1100 / speed);
      return () => clearTimeout(tick.current);
    }
    setPlaying(false);
  }, [playing, step, stageIdx, stageDone, speed, stage, stages.length]);

  function goStage(i: number) { setStageIdx(i); setStep(0); setPlaying(false); }

  if (error) return <div className="mx-auto max-w-2xl px-5 py-20 text-center text-slate-400">{error} <a href={`/sorteos/${slug}`} className="text-emerald-700">Volver</a></div>;
  if (!data) return <p className="py-20 text-center text-slate-400">Cargando show…</p>;

  const meta = GAME_META[stage?.game] ?? GAME_META.ELIMINATION;
  const aliveCount = participants.length - elimSet.size;

  return (
    <div>
      <div className="sticky top-[57px] z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-5 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${meta.color} text-white`}><Icon name={meta.icon} className="h-5 w-5" /></span>
              <div>
                <div className="text-sm font-bold text-slate-900">{data.raffle.title}</div>
                <div className="text-xs text-slate-500">
                  Etapa {stageIdx + 1}/{stages.length}: {meta.label}{stage?.isFinale && " · FINAL"} · <span className="text-emerald-700">{aliveCount} en juego</span> · {elimSet.size} fuera
                </div>
              </div>
            </div>
            {liveMode ? (
              <div className="flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-1.5">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500"></span>
                <span className="text-sm font-bold text-rose-600">{secsToStart > 0 ? `Empieza en ${secsToStart}s` : "EN VIVO"}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button onClick={() => goStage(Math.max(0, stageIdx - 1))} disabled={stageIdx === 0} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm disabled:opacity-40"><Icon name="prev" className="h-5 w-5" /></button>
                <button onClick={() => setPlaying((p) => !p)} className="rounded-lg bg-emerald-600 px-5 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500"><Icon name={playing ? "pause" : "play"} className="h-5 w-5" /></button>
                <button onClick={() => { if (!stageDone) setStep(stageElim.length); else goStage(Math.min(stages.length - 1, stageIdx + 1)); }} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"><Icon name="next" className="h-5 w-5" /></button>
                <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
                  <option value={0.5}>0.5x</option><option value={1}>1x</option><option value={2}>2x</option><option value={4}>4x</option>
                </select>
              </div>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {stages.map((s: any, i: number) => (
              <button key={i} onClick={() => goStage(i)} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${i === stageIdx ? `${(GAME_META[s.game] ?? meta).color} text-white` : "bg-slate-100 text-slate-500"}`}>
                <Icon name={(GAME_META[s.game] ?? meta).icon} className="h-3.5 w-3.5" /> {i + 1}{s.isFinale ? <Icon name="trophy" className="h-3.5 w-3.5" /> : null}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-6 px-5 py-6 lg:grid-cols-[1fr_320px]">
        <div>
          <div className={`rounded-3xl border border-slate-200 p-5 ${stage?.game === "SQUID" && playing && !stageDone && step % 2 === 1 ? "bg-rose-50" : "bg-gradient-to-b from-slate-50 to-white"}`}>
            {isFinaleDone && (
              <div className="mb-5 rounded-2xl bg-emerald-50 p-5 text-center">
                <div className="flex justify-center text-emerald-700"><Icon name="trophy" className="h-8 w-8" /></div>
                <h2 className="mt-1 text-lg font-bold text-emerald-800">{winners.length > 1 ? "¡Ganadores!" : "¡Ganador!"} {winners.map((w) => `#${participants[w]?.number}`).join(", ")}</h2>
                <a href={`/verificar?slug=${slug}`} className="mt-3 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Verificar este resultado</a>
              </div>
            )}
            <LayoutGroup>
              <div className="flex max-h-[58vh] flex-wrap justify-center gap-2.5 overflow-y-auto lg:max-h-none lg:overflow-visible">
                {gridOrder.map((i) => (
                  <motion.div key={i} layout transition={{ type: "spring", stiffness: 550, damping: 42, mass: 0.6 }}>
                    <Ticket p={participants[i]} mine={myIndices.has(i)} elim={elimSet.has(i)} winner={isFinaleDone && winnerSet.has(i)} />
                  </motion.div>
                ))}
              </div>
            </LayoutGroup>
          </div>
          <p className="mt-3 text-center text-xs text-slate-400">Todo el show se deriva de la semilla comprometida - reproducible y verificable. Los eliminados se van al final; nada se oculta.</p>
        </div>

        <div className="lg:sticky lg:top-[150px] lg:self-start">
          <RaffleChat slug={slug} />
        </div>
      </div>
    </div>
  );
}
