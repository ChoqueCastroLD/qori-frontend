import { useMemo } from "react";
import Icon from "../Icon";
import { ConfettiCanvas } from "./Particles";
import { hashSeed, type Participant } from "./shared";

const MEDAL: Record<number, { ring: string; grad: string; badge: string }> = {
  1: { ring: "ring-amber-400", grad: "from-amber-300 to-amber-500", badge: "bg-amber-400" },
  2: { ring: "ring-slate-300", grad: "from-slate-200 to-slate-400", badge: "bg-slate-300" },
  3: { ring: "ring-amber-700", grad: "from-amber-600 to-amber-800", badge: "bg-amber-600" },
};
const HEIGHT: Record<number, number> = { 1: 118, 2: 84, 3: 60 };

function WinnerBlock({ p, pos }: { p?: Participant; pos: number }) {
  const m = MEDAL[pos] ?? MEDAL[3];
  return (
    <div className="flex w-24 flex-col items-center sm:w-28">
      {pos === 1 && <Icon name="trophy" className="mb-1 h-7 w-7 text-amber-300" />}
      <div className={`relative h-16 w-16 rounded-full ring-4 ${m.ring} sm:h-20 sm:w-20`}>
        {p?.avatarUrl
          ? <img src={p.avatarUrl} className="h-full w-full rounded-full object-cover" alt="" />
          : <div className="flex h-full w-full items-center justify-center rounded-full bg-slate-700 text-xl font-bold text-white">{(p?.nickname || "?")[0]}</div>}
        <span className={`absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full ${m.badge} px-2 py-0.5 text-xs font-black text-slate-900`}>{pos}º</span>
      </div>
      <div className="mt-3 max-w-full truncate text-sm font-bold text-white">{p?.nickname || "Anónimo"}</div>
      <div className="font-mono text-xs text-white/60">#{p?.number}</div>
      <div className={`mt-2 flex w-full items-end justify-center rounded-t-xl bg-gradient-to-b ${m.grad}`} style={{ height: HEIGHT[pos] ?? 60 }}>
        <span className="pb-2 text-3xl font-black text-slate-900/40">{pos}</span>
      </div>
    </div>
  );
}

export default function FinalScreen({
  winners, participants, slug, onReplay, onReplayFinal,
}: { winners: number[]; participants: Participant[]; slug: string; onReplay: () => void; onReplayFinal?: () => void }) {
  const single = winners.length === 1;
  const top3 = winners.slice(0, 3);
  const rest = winners.slice(3);
  // Podium visual order: 2nd, 1st, 3rd (classic staircase). Single: just center.
  const order = single ? [0] : top3.length === 2 ? [1, 0] : [1, 0, 2];
  const phrase = (participants[winners[0]]?.comment || "").trim();

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800 p-6 text-center shadow-xl">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.28),transparent_70%)]" />
      <ConfettiCanvas seed={hashSeed(777)} />
      <div className="relative z-10">
        <div className="flex items-center justify-center gap-2 text-amber-300">
          <Icon name="trophy" className="h-5 w-5" />
          <span className="text-xs font-bold uppercase tracking-[0.3em]">Resultado del sorteo</span>
        </div>
        <h2 className="mt-2 text-2xl font-black text-white sm:text-3xl">{single ? "¡Tenemos ganador!" : "¡Tenemos ganadores!"}</h2>

        <div className="mt-6 flex items-end justify-center gap-3 sm:gap-5">
          {order.map((oi) => <WinnerBlock key={top3[oi]} p={participants[top3[oi]]} pos={oi + 1} />)}
        </div>

        {single && phrase && (
          <div className="mx-auto mt-5 max-w-md rounded-2xl bg-white/5 px-4 py-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300/70">Su mensaje al entrar</div>
            <p className="mt-1 text-sm italic text-white/85">"{phrase}"</p>
          </div>
        )}

        {rest.length > 0 && (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {rest.map((wi, idx) => (
              <span key={wi} className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white">
                {idx + 4}º · #{participants[wi]?.number} {participants[wi]?.nickname || ""}
              </span>
            ))}
          </div>
        )}

        <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
          <button onClick={onReplay} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-400">
            <Icon name="refresh" className="h-4 w-4" /> Ver todo de nuevo
          </button>
          {onReplayFinal && (
            <button onClick={onReplayFinal} className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20">
              <Icon name="refresh" className="h-4 w-4" /> Repetir final
            </button>
          )}
          <a href={`/verificar?slug=${slug}`} className="inline-flex items-center gap-1.5 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100">
            <Icon name="lock" className="h-4 w-4" /> Verificar resultado
          </a>
          <a href="/sorteos" className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10">
            <Icon name="ticket" className="h-4 w-4" /> Más sorteos
          </a>
          <a href="/" className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10">
            <Icon name="home" className="h-4 w-4" /> Inicio
          </a>
        </div>
      </div>

    </div>
  );
}
