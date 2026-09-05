// Celebration overlay when the round finishes. Dismissible (so you're never
// trapped), shows the winner's prize + private claim code, a "top por tarjetas",
// and clear exits (inicio / mis premios / otros sorteos).

import { motion } from "framer-motion";
import Icon from "../../Icon";
import type { BingoState, Participant } from "../types";

export default function WinnersOverlay({
  winners,
  meNickname,
  topCards = [],
  myWin = null,
  demo = false,
  onClose,
}: {
  winners: NonNullable<BingoState["winners"]>;
  meNickname: string;
  topCards?: Participant[];
  myWin?: { shareUsd: number; claimCode: string | null; claimCodes?: string[]; prizeStatus: string; cards?: number } | null;
  demo?: boolean;
  onClose?: () => void;
}) {
  const iWon = winners.some((w) => w.nickname === meNickname) || !!myWin;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[2px]"
    >
      <motion.div
        initial={{ scale: 0.6, y: 40, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 18 }}
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[88svh] w-full max-w-sm overflow-y-auto rounded-3xl bg-white p-6 text-center shadow-2xl scrollbar-thin"
      >
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200"
          >
            <Icon name="x" className="h-4 w-4" />
          </button>
        )}

        <motion.div
          animate={{ rotate: [0, -8, 8, -5, 5, 0] }}
          transition={{ duration: 1.1, repeat: Infinity, repeatDelay: 1.2 }}
          className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100"
        >
          <Icon name="trophy" className="h-9 w-9 text-amber-500" />
        </motion.div>
        <h2 className="text-3xl font-black tracking-tight text-slate-900">BINGO</h2>
        <p className="mt-1 text-sm font-medium text-slate-500">
          {iWon ? "Felicidades, llenaste tu tarjeta" : winners.length > 1 ? "Empate: el premio se reparte en partes iguales" : "Tenemos un ganador"}
        </p>

        {/* your prize + private claim code */}
        {myWin && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-left">
            <div className="text-[11px] font-black uppercase tracking-wider text-amber-700">Tu premio</div>
            <div className="text-2xl font-black text-emerald-600">USD {myWin.shareUsd.toFixed(2)}</div>
            {myWin.cards && myWin.cards > 1 && (
              <div className="mt-0.5 text-[11px] font-semibold text-amber-700">Ganaste con {myWin.cards} tarjetas</div>
            )}
            {(() => {
              const codes = myWin.claimCodes && myWin.claimCodes.length ? myWin.claimCodes : myWin.claimCode ? [myWin.claimCode] : [];
              if (!codes.length) return null;
              return (
                <>
                  <div className="mt-2 text-xs text-slate-600">
                    {codes.length > 1 ? "Tus códigos para reclamar" : "Tu código para reclamar"} (compártelo solo con <strong>@shoko_cc</strong> por Discord):
                  </div>
                  <div className="mt-1.5 space-y-1.5">
                    {codes.map((c) => (
                      <div key={c} className="select-all rounded-lg bg-white px-3 py-2 text-center font-mono text-lg font-black tracking-wider text-slate-900 ring-1 ring-amber-200">{c}</div>
                    ))}
                  </div>
                </>
              );
            })()}
            <div className="mt-1.5 text-[11px] font-semibold text-amber-700">Estado: {myWin.prizeStatus === "DELIVERED" ? "Entregado" : "Por reclamar"}</div>
          </div>
        )}

        <div className="mt-4 max-h-40 space-y-2 overflow-y-auto pr-0.5 scrollbar-thin">
          {winners.map((w, i) => (
            <div key={`${w.nickname}-${i}`} className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-left ${w.nickname === meNickname ? "bg-emerald-50 ring-2 ring-emerald-400" : "bg-slate-50"}`}>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold text-slate-800">{w.nickname}</span>
                <span className="block text-[11px] font-semibold text-slate-400">{w.cards} tarjeta{w.cards === 1 ? "" : "s"} compradas</span>
              </span>
              <span className="shrink-0 font-black text-emerald-600">USD {w.shareUsd.toFixed(2)}</span>
            </div>
          ))}
        </div>

        {topCards.length > 0 && (
          <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-3 text-left">
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-slate-500">
              <Icon name="card" className="h-3.5 w-3.5 text-emerald-500" /> Top por tarjetas
            </div>
            <div className="space-y-1">
              {topCards.slice(0, 3).map((p, i) => (
                <div key={p.userId} className="flex items-center gap-2 text-sm">
                  <span className={`w-4 text-center text-xs font-black ${i === 0 ? "text-amber-500" : "text-slate-400"}`}>{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold text-slate-700">{p.nickname}{p.nickname === meNickname && <span className="ml-1 text-[10px] font-black uppercase text-emerald-600">(tu)</span>}</span>
                  <span className="shrink-0 font-bold tabular-nums text-slate-500">{p.cards} <span className="text-[10px] font-semibold text-slate-400">tarjetas</span></span>
                </div>
              ))}
            </div>
          </div>
        )}

        {demo ? (
          <p className="mt-4 text-xs text-slate-400">La demo reinicia en unos segundos…</p>
        ) : (
          <div className="mt-5 flex flex-col gap-2">
            {iWon && <a href="/cuenta" className="w-full rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-500">Ver mis premios</a>}
            <div className="flex gap-2">
              <a href="/" className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Inicio</a>
              <a href="/sorteos" className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Otros sorteos</a>
            </div>
            {onClose && <button type="button" onClick={onClose} className="mt-1 text-xs font-semibold text-slate-400 hover:text-slate-600">Seguir viendo la sala</button>}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
