import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { motion } from "framer-motion";
import RaffleChat from "./RaffleChat";
import Icon from "./Icon";
import EliminationGame from "./show/EliminationGame";
import BombsGame, { duration as bombsDur, elimCountAt as bombsElim } from "./show/BombsGame";
import SquidGame from "./show/SquidGame";
import HorseRaceGame from "./show/HorseRaceGame";
import DigitRevealGame from "./show/DigitRevealGame";
import IceFloorGame from "./show/IceFloorGame";
import MusicalChairsGame from "./show/MusicalChairsGame";
import RocketsGame, { duration as rocketsDur, elimCountAt as rocketsElim } from "./show/RocketsGame";
import RouletteGame, { duration as rouletteDur, elimCountAt as rouletteElim } from "./show/RouletteGame";
// Self-timed games run their own choreography clock; ShowPlayer only needs their
// total duration + how many eliminations have landed by a given elapsed ms.
const SELF: Record<string, { duration: (s: any) => number; elimAt: (s: any, ms: number) => number }> = {
  ROCKETS: { duration: rocketsDur, elimAt: rocketsElim },
  BOMBS: { duration: bombsDur, elimAt: bombsElim },
  ROULETTE: { duration: rouletteDur, elimAt: rouletteElim },
};
import FinalScreen from "./show/FinalScreen";
import { ConfettiCanvas } from "./show/Particles";
import { hashSeed, type GameProps, type Participant } from "./show/shared";
import { getShowAudio } from "./show/audio";

const GAME_META: Record<string, { label: string; icon: string; color: string }> = {
  ELIMINATION: { label: "Eliminación", icon: "bolt", color: "bg-slate-900" },
  DIGIT_REVEAL: { label: "Revelado de dígitos", icon: "hash", color: "bg-indigo-600" },
  BOMBS: { label: "Bombas", icon: "fire", color: "bg-orange-600" },
  SQUID: { label: "Luz roja, luz verde", icon: "stop", color: "bg-rose-600" },
  HORSE_RACE: { label: "Carrera", icon: "flag", color: "bg-amber-600" },
  ICE_FLOOR: { label: "El piso es hielo", icon: "snow", color: "bg-cyan-600" },
  MUSICAL_CHAIRS: { label: "Las sillas", icon: "music", color: "bg-violet-600" },
  ROCKETS: { label: "Cohetes", icon: "rocket", color: "bg-orange-600" },
  ROULETTE: { label: "Ruleta rusa", icon: "target", color: "bg-stone-700" },
};

const GAME_COMPONENTS: Record<string, ComponentType<GameProps>> = {
  ELIMINATION: EliminationGame,
  BOMBS: BombsGame,
  SQUID: SquidGame,
  HORSE_RACE: HorseRaceGame,
  DIGIT_REVEAL: DigitRevealGame,
  ICE_FLOOR: IceFloorGame,
  MUSICAL_CHAIRS: MusicalChairsGame,
  ROCKETS: RocketsGame,
  ROULETTE: RouletteGame,
};

// Fixed deterministic timeline -> every client renders the same frame from the
// shared startsAt clock (synchronized live show, no WebSocket needed).
// Each step is one elimination: ~2/3 build-up (target telegraphed, tension
// audio) then the hit. If you change these, update the endsAt formula in
// qori-api/src/index.ts (GET /raffles/:slug) to the SAME numbers.
const STEP_MS = 1050;
const GAP_MS = 2200;

// Losers tray under the arena: grouped by stage (most recent stage on top),
// most recent loser first within each group; photo/initial + ticket number.
function StageLosers({ stages, stageIdx, step, participants, myIndices, meta }: any) {
  const groups: { label: string; color: string; nums: { n: number; name: string; url: string | null; mine: boolean; username: string | null; comment: string | null }[] }[] = [];
  for (let si = stageIdx; si >= 0; si--) {
    const st = stages[si]; if (!st) continue;
    const elim: number[] = st.eliminated ?? [];
    const cnt = si < stageIdx ? elim.length : step;
    if (cnt <= 0) continue;
    const taken = elim.slice(0, cnt).slice().reverse();
    const m = meta[st.game] ?? { label: st.game, color: "bg-slate-700" };
    groups.push({ label: `Etapa ${si + 1} · ${m.label}`, color: m.color, nums: taken.map((i: number) => ({ n: participants[i]?.number ?? i + 1, name: participants[i]?.nickname ?? "", url: participants[i]?.avatarUrl ?? null, mine: myIndices.has(i), username: participants[i]?.username ?? null, comment: participants[i]?.comment ?? null })) });
  }
  if (!groups.length) return null;
  const total = groups.reduce((a, g) => a + g.nums.length, 0);
  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-400">Fuera ({total}) - por etapa, recientes primero</div>
      <div className="space-y-3">
        {groups.map((g, gi) => (
          <div key={gi}>
            <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-slate-500"><span className={`inline-block h-2 w-2 rounded-full ${g.color}`}></span>{g.label} <span className="text-slate-400">· {g.nums.length}</span></div>
            <div className="flex flex-wrap gap-1.5">
              {g.nums.map((t, i) => {
                const tip = `${t.name || "Anónimo"} · #${t.n}${t.comment ? ` - "${t.comment}"` : ""}`;
                const cls = `inline-flex items-center gap-1 rounded-full py-0.5 pl-0.5 pr-2 font-mono text-xs ${t.mine ? "bg-cyan-50 text-cyan-700 ring-1 ring-cyan-300" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`;
                const inner = <>{t.url ? <img src={t.url} className="h-5 w-5 rounded-full object-cover" alt="" /> : <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-300 text-[9px] font-bold text-white">{(t.name?.[0] ?? "#").toUpperCase()}</span>}#{t.n}</>;
                return t.username
                  ? <a key={i} href={`/u/${t.username}`} title={tip} className={cls}>{inner}</a>
                  : <span key={i} title={tip} className={cls}>{inner}</span>;
              })}
            </div>
          </div>
        ))}
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
  const [soundOn, setSoundOn] = useState(true);
  const tick = useRef<any>(null);
  const audio = useMemo(() => getShowAudio(), []);

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

  // AudioContext can only start after a user gesture (browser policy).
  useEffect(() => {
    const init = () => { audio.ensure(); window.removeEventListener("pointerdown", init); window.removeEventListener("keydown", init); };
    window.addEventListener("pointerdown", init);
    window.addEventListener("keydown", init);
    return () => { window.removeEventListener("pointerdown", init); window.removeEventListener("keydown", init); };
  }, [audio]);
  useEffect(() => { audio.setMuted(!soundOn); }, [soundOn, audio]);

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

  // Self-timed shows: every stage's game owns its choreography. Per-stage
  // duration + cumulative offsets drive one epoch clock (synced live via
  // startsAt; a local start in replay).
  const selfTimed = stages.length > 0 && stages.every((s: any) => SELF[s.game]);
  const durations = useMemo(
    () => stages.map((s: any) => (SELF[s.game] ? SELF[s.game].duration(s) : (s.eliminated?.length ?? 0) * STEP_MS)),
    [stages],
  );
  const offsets = useMemo(() => { const o: number[] = []; let t = 0; for (let i = 0; i < durations.length; i++) { o.push(t); t += durations[i] + GAP_MS; } return o; }, [durations]);
  const showTotal = useMemo(() => (durations.length ? offsets[offsets.length - 1] + durations[durations.length - 1] : 0), [offsets, durations]);
  const manualStartRef = useRef<number | null>(null);
  const [manualOverride, setManualOverride] = useState(false); // replay forces manual mode even mid-live

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
  // Self-timed clock: advance stageIdx + step from one epoch playhead; each
  // game animates itself at 60fps from stageStartMs.
  useEffect(() => {
    if (!data || !stages.length || !selfTimed) return;
    const liveStart = new Date(data.startsAt).getTime();
    const live = !manualOverride && Date.now() < liveStart + showTotal + 3000;
    if (!live && manualStartRef.current == null) manualStartRef.current = Date.now();
    const tick = () => {
      const base = live ? liveStart : (manualStartRef.current ?? Date.now());
      const playhead = Date.now() - base;
      if (playhead < 0) { setSecsToStart(Math.ceil(-playhead / 1000)); setLiveMode(true); return; }
      setSecsToStart(0); setLiveMode(live);
      let si = 0; for (let i = 0; i < offsets.length; i++) if (playhead >= offsets[i]) si = i;
      const st = stages[si]; const sMs = playhead - offsets[si];
      const cnt = SELF[st.game] ? SELF[st.game].elimAt(st, sMs) : Math.floor(sMs / STEP_MS);
      setStageIdx(si); setStep(Math.min(cnt, st.eliminated?.length ?? cnt));
    };
    tick();
    const id = setInterval(tick, 150);
    return () => clearInterval(id);
  }, [data, selfTimed, offsets, showTotal, manualOverride]);

  useEffect(() => {
    if (!data || !stages.length || selfTimed) return;
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

  const stageElim: number[] = stage?.eliminated ?? [];
  const stageDone = step >= stageElim.length;
  const isFinaleDone = stageIdx === stages.length - 1 && stageDone && stages.length > 0;

  useEffect(() => {
    if (selfTimed || liveMode || !playing || !stage) return;
    if (!stageDone) {
      tick.current = setTimeout(() => setStep((s) => s + 1), STEP_MS / speed);
      return () => clearTimeout(tick.current);
    }
    if (stageIdx < stages.length - 1) {
      tick.current = setTimeout(() => { setStageIdx((i) => i + 1); setStep(0); }, GAP_MS / speed);
      return () => clearTimeout(tick.current);
    }
    setPlaying(false);
  }, [playing, step, stageIdx, stageDone, speed, stage, stages.length]);

  // --- Sound design per game, fired on step advances only (never on jumps). ---
  const prevPos = useRef<{ s: number; st: number }>({ s: -1, st: 0 });
  useEffect(() => {
    const p = prevPos.current;
    prevPos.current = { s: stageIdx, st: step };
    if (!stage) return;
    // Entering a stage: a tension riser for the finale, a whoosh otherwise.
    if (p.s !== stageIdx) { if (p.s !== -1 && step === 0) { stage.isFinale ? audio.riser(1.2) : audio.whoosh(); } return; }
    if (step <= p.st || step - p.st > 3) return; // backwards or a big jump: silent
    const hasNext = step < stageElim.length; // someone else is about to fall
    switch (stage.game) {
      case "ELIMINATION": audio.zap(); if (hasNext) audio.tension(0.35, 0.55); break;
      case "BOMBS": {
        const phases: number[][] = stage.data?.phases ?? [];
        let acc = 0; const ends = phases.map((ph) => (acc += ph.length));
        audio.boom(ends.includes(step));
        if (hasNext) audio.fuse(); // ticking while the next bomb hops
        break;
      }
      case "SQUID": {
        const rounds: { light: string; eliminated: number[] }[] = stage.data?.rounds ?? [];
        let a = 0;
        for (const r of rounds) { if (r.eliminated.length && step - 1 === a) { audio.alarm(); break; } a += r.eliminated.length; }
        audio.thud();
        if (hasNext) audio.tension(0.4, 0.5);
        break;
      }
      case "HORSE_RACE": {
        audio.gallop(); audio.gallop(0.32); audio.gallop(0.64); // hooves fill the longer step
        if (step === stageElim.length) audio.whoosh();
        else audio.tension(0.45, 0.5);
        break;
      }
      case "ICE_FLOOR": {
        audio.iceShatter();
        if (hasNext) { audio.crack(false, 0.4); audio.crack(true, 0.75); } // next tile groans
        break;
      }
      case "MUSICAL_CHAIRS": {
        const rounds: number[][] = stage.data?.rounds ?? [stageElim];
        const starts: number[] = []; let acc2 = 0;
        for (const r of rounds) { starts.push(acc2); acc2 += r.length; }
        if (starts.includes(step - 1)) audio.musicStop(); // the round's first victim: silence hits
        audio.thud();
        // next elimination opens a new round -> the tune circles again
        if (hasNext && starts.includes(step)) audio.melody(step);
        else if (hasNext) audio.tension(0.4, 0.5);
        break;
      }
      case "DIGIT_REVEAL": {
        const n = stage.data?.revealOrder?.length ?? 0;
        const total = Math.max(1, stageElim.length);
        const revNow = step >= total ? n : Math.floor((step * n) / total);
        const revPrev = p.st >= total ? n : Math.floor((p.st * n) / total);
        if (revNow > revPrev) audio.ding(); else audio.tick();
        if (step < total) audio.tension(0.45, 0.5);
        break;
      }
      default: audio.blip();
    }
    // Final stretch: heartbeat when only a few remain - edge-of-seat tension.
    if (stage.isFinale) {
      const alive = participants.length - elimSet.size;
      if (alive > winners.length && alive <= 4) audio.heartbeat();
    }
  }, [stageIdx, step, stage, audio]);

  // Finale chime, once, when the last elimination lands.
  const chimed = useRef(false);
  useEffect(() => {
    if (isFinaleDone && !chimed.current) { chimed.current = true; audio.chime(); }
    if (!isFinaleDone) chimed.current = false;
  }, [isFinaleDone, audio]);

  function goStage(i: number) {
    if (selfTimed) { setManualOverride(true); manualStartRef.current = Date.now() - (offsets[i] ?? 0); setLiveMode(false); setStageIdx(i); setStep(0); return; }
    setStageIdx(i); setStep(0); setPlaying(false);
  }
  // Replay from the top in manual mode (from the final screen's "Ver de nuevo").
  function replay() {
    chimed.current = false;
    prevPos.current = { s: -1, st: 0 };
    setLiveMode(false);
    if (selfTimed) { setManualOverride(true); manualStartRef.current = Date.now(); }
    setStageIdx(0); setStep(0); setPlaying(true);
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch {}
  }
  // Replay just the final stage (the roulette) + its winner celebration.
  function replayFinal() {
    if (!stages.length) return;
    chimed.current = false; prevPos.current = { s: -1, st: 0 };
    const last = stages.length - 1;
    if (selfTimed) { setManualOverride(true); setLiveMode(false); manualStartRef.current = Date.now() - (offsets[last] ?? 0); }
    setStageIdx(last); setStep(0);
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch {}
  }

  if (error) return <div className="mx-auto max-w-2xl px-5 py-20 text-center text-slate-400">{error} <a href={`/sorteos/${slug}`} className="text-emerald-700">Volver</a></div>;
  if (!data) return <p className="py-20 text-center text-slate-400">Cargando show…</p>;

  const meta = GAME_META[stage?.game] ?? GAME_META.ELIMINATION;
  const GameComp = GAME_COMPONENTS[stage?.game] ?? EliminationGame;
  const aliveCount = participants.length - elimSet.size;
  const confettiSeed = hashSeed(stages.length, participants.length, ...winners);
  const base = liveMode ? new Date(data.startsAt).getTime() : (manualStartRef.current ?? new Date(data.startsAt).getTime());
  const stageStartMs = selfTimed ? base + (offsets[stageIdx] ?? 0) : null;
  const hideTransport = liveMode || selfTimed; // self-timed games can't be scrubbed

  const soundBtn = (
    <button
      onClick={() => { audio.ensure(); setSoundOn((s) => !s); }}
      className={`rounded-lg border px-2.5 py-1.5 text-sm ${soundOn ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-400"}`}
      title={soundOn ? "Silenciar" : "Activar sonido"}
      aria-label={soundOn ? "Silenciar" : "Activar sonido"}
    >
      <Icon name={soundOn ? "volume" : "volume-off"} className="h-5 w-5" />
    </button>
  );

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
            {hideTransport ? (
              <div className="flex items-center gap-2">
                <div className={`flex items-center gap-2 rounded-lg px-3 py-1.5 ${liveMode ? "bg-rose-50" : "bg-slate-100"}`}>
                  {liveMode && <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500"></span>}
                  <span className={`text-sm font-bold ${liveMode ? "text-rose-600" : "text-slate-500"}`}>{liveMode ? (secsToStart > 0 ? `Empieza en ${secsToStart}s` : "EN VIVO") : "REPETICIÓN"}</span>
                </div>
                {soundBtn}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button onClick={() => goStage(Math.max(0, stageIdx - 1))} disabled={stageIdx === 0} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm disabled:opacity-40"><Icon name="prev" className="h-5 w-5" /></button>
                <button onClick={() => setPlaying((p) => !p)} className="rounded-lg bg-emerald-600 px-5 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500"><Icon name={playing ? "pause" : "play"} className="h-5 w-5" /></button>
                <button onClick={() => { if (!stageDone) setStep(stageElim.length); else goStage(Math.min(stages.length - 1, stageIdx + 1)); }} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"><Icon name="next" className="h-5 w-5" /></button>
                <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
                  <option value={0.5}>0.5x</option><option value={1}>1x</option><option value={2}>2x</option><option value={4}>4x</option>
                </select>
                {soundBtn}
              </div>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {stages.map((s: any, i: number) => {
              const cls = `inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${i === stageIdx ? `${(GAME_META[s.game] ?? meta).color} text-white` : "bg-slate-100 text-slate-500"}`;
              const inner = <><Icon name={(GAME_META[s.game] ?? meta).icon} className="h-3.5 w-3.5" /> {i + 1}{s.isFinale ? <Icon name="trophy" className="h-3.5 w-3.5" /> : null}</>;
              // Live: passive progress indicator (no jumping - preserves the illusion).
              return liveMode
                ? <span key={i} className={`${cls} cursor-default select-none`}>{inner}</span>
                : <button key={i} onClick={() => goStage(i)} className={cls}>{inner}</button>;
            })}
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-6 px-5 py-6 lg:grid-cols-[1fr_320px]">
        <div>
          {isFinaleDone ? (
            <motion.div initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 220, damping: 24 }}>
              <FinalScreen winners={winners} participants={participants} slug={slug} onReplay={replay} onReplayFinal={replayFinal} />
            </motion.div>
          ) : (
            <div className="relative">
              {stage && (
                <GameComp
                  participants={participants}
                  stage={stage}
                  stageIdx={stageIdx}
                  step={step}
                  elimSeq={elimSeq}
                  elimSet={elimSet}
                  myIndices={myIndices}
                  winnerSet={winnerSet}
                  isFinaleDone={isFinaleDone}
                  stageStartMs={stageStartMs}
                  speed={speed}
                />
              )}
            </div>
          )}
          {/* Losers, always below the arena - grouped by stage, most recent first. */}
          {selfTimed && <StageLosers stages={stages} stageIdx={stageIdx} step={step} participants={participants} myIndices={myIndices} meta={GAME_META} />}
          <p className="mt-3 text-center text-xs text-slate-400">Todo el show se deriva de la semilla comprometida - reproducible y verificable.</p>
        </div>

        <div className="lg:sticky lg:top-[150px] lg:self-start">
          <RaffleChat slug={slug} />
        </div>
      </div>
    </div>
  );
}
