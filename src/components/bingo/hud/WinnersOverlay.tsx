// Celebration overlay when the round finishes (tie => shared prize). Shows each
// winner's prize + how many tarjetas they bought, and a "top por tarjetas" of
// the players who brought the most cards to the round.

import { motion } from "framer-motion";
import Icon from "../../Icon";
import type { BingoState, Participant } from "../types";

export default function WinnersOverlay({
  winners,
  meNickname,
  topCards = [],
}: {
  winners: NonNullable<BingoState["winners"]>;
  meNickname: string;
  topCards?: Participant[];
}) {
  const iWon = winners.some((w) => w.nickname === meNickname);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[2px]"
    >
      <motion.div
        initial={{ scale: 0.6, y: 40, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 18 }}
        className="pointer-events-auto max-h-[90svh] w-full max-w-sm overflow-y-auto rounded-3xl bg-white p-6 text-center shadow-2xl scrollbar-thin"
      >
        <motion.div
          animate={{ rotate: [0, -8, 8, -5, 5, 0] }}
          transition={{ duration: 1.1, repeat: Infinity, repeatDelay: 1.2 }}
          className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100"
        >
          <Icon name="trophy" className="h-9 w-9 text-amber-500" />
        </motion.div>
        <h2 className="text-3xl font-black tracking-tight text-slate-900">BINGO</h2>
        <p className="mt-1 text-sm font-medium text-slate-500">
          {iWon
            ? "Felicidades, llenaste tu tarjeta"
            : winners.length > 1
              ? "Empate: el premio se reparte en partes iguales"
              : "Tenemos un ganador"}
        </p>

        <div className="mt-4 max-h-52 space-y-2 overflow-y-auto pr-0.5 scrollbar-thin">
          {winners.map((w, i) => (
            <div
              key={`${w.nickname}-${i}`}
              className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-left ${w.nickname === meNickname ? "bg-emerald-50 ring-2 ring-emerald-400" : "bg-slate-50"}`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold text-slate-800">{w.nickname}</span>
                <span className="block text-[11px] font-semibold text-slate-400">
                  {w.cards} tarjeta{w.cards === 1 ? "" : "s"} compradas
                </span>
              </span>
              <span className="shrink-0 font-black text-emerald-600">USD {w.shareUsd.toFixed(2)}</span>
            </div>
          ))}
        </div>

        {topCards.length > 0 && (
          <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-3 text-left">
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-slate-500">
              <Icon name="card" className="h-3.5 w-3.5 text-emerald-500" />
              Top por tarjetas
            </div>
            <div className="space-y-1">
              {topCards.slice(0, 3).map((p, i) => (
                <div key={p.userId} className="flex items-center gap-2 text-sm">
                  <span className={`w-4 text-center text-xs font-black ${i === 0 ? "text-amber-500" : "text-slate-400"}`}>{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold text-slate-700">
                    {p.nickname}
                    {p.nickname === meNickname && <span className="ml-1 text-[10px] font-black uppercase text-emerald-600">(tu)</span>}
                  </span>
                  <span className="shrink-0 font-bold tabular-nums text-slate-500">
                    {p.cards} <span className="text-[10px] font-semibold text-slate-400">tarjetas</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="mt-4 text-xs text-slate-400">La demo reinicia en unos segundos...</p>
      </motion.div>
    </motion.div>
  );
}
