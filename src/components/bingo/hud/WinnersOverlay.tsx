// Celebration overlay when the round finishes (tie => shared prize).

import { motion } from "framer-motion";
import Icon from "../../Icon";
import type { BingoState } from "../types";

export default function WinnersOverlay({ winners, meNickname }: { winners: NonNullable<BingoState["winners"]>; meNickname: string }) {
  const iWon = winners.some((w) => w.nickname === meNickname);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-slate-950/40 backdrop-blur-[2px]"
    >
      <motion.div
        initial={{ scale: 0.6, y: 40, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 18 }}
        className="pointer-events-auto mx-4 w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl"
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
        <div className="mt-4 max-h-56 space-y-2 overflow-y-auto pr-0.5 scrollbar-thin">
          {winners.map((w, i) => (
            <div
              key={`${w.nickname}-${i}`}
              className={`flex items-center justify-between rounded-xl px-4 py-2.5 ${w.nickname === meNickname ? "bg-emerald-50 ring-2 ring-emerald-400" : "bg-slate-50"}`}
            >
              <span className="font-bold text-slate-800">{w.nickname}</span>
              <span className="font-black text-emerald-600">USD {w.shareUsd.toFixed(2)}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-slate-400">La demo reinicia en unos segundos...</p>
      </motion.div>
    </motion.div>
  );
}
