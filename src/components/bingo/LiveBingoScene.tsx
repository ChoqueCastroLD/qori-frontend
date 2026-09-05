// Real (data-driven) bingo: wires the live API hook into the shared scene and
// provides the "buy tarjetas" panel shown while you don't have any yet.

import { useState } from "react";
import { BingoSceneView } from "./BingoScene";
import { useLiveBingo, type LiveApi } from "./live";
import Icon from "../Icon";

export default function LiveBingoScene({ slug }: { slug: string }) {
  const api = useLiveBingo(slug);
  return <BingoSceneView api={api} buySlot={<BuyCards slug={slug} api={api} />} />;
}

const ERRS: Record<string, string> = {
  unauthenticated: "Inicia sesion para comprar tarjetas.",
  insufficient_funds: "No te alcanzan los lingotes.",
  raffle_not_open: "El sorteo no esta abierto para comprar.",
  raffle_not_found: "Sorteo no encontrado.",
  sold_out: "Se agotaron las tarjetas.",
  per_user_limit: "Alcanzaste tu maximo de tarjetas.",
  requires_paid_user: "Solo para Suertudos: compra al menos un lingote con dinero real primero.",
  buy_disabled: "Compras deshabilitadas en tu cuenta.",
};

function BuyCards({ slug, api }: { slug: string; api: LiveApi }) {
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const price = api.meta?.ticketPrice ?? 0;
  const maxPer = api.meta?.maxPerUser ?? null;
  const open = api.state.status === "waiting";

  const buy = async () => {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/raffles/${slug}/bingo/buy`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ quantity: qty }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { api.refresh(); return; }
      setErr(ERRS[d.error] ?? `Error: ${d.error ?? "desconocido"}`);
    } catch {
      setErr("No se pudo conectar. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div className="pointer-events-auto w-72 rounded-2xl bg-slate-900/70 p-4 text-white shadow-xl backdrop-blur">
        <div className="flex items-center gap-2 text-sm font-black uppercase tracking-wider">
          <Icon name="eye" className="h-4 w-4 text-emerald-300" /> Estas mirando
        </div>
        <p className="mt-1 text-xs text-white/60">
          {api.state.status === "finished" ? "Este bingo ya termino." : "El bingo ya esta en curso. Espera al proximo para comprar tarjetas."}
        </p>
      </div>
    );
  }

  return (
    <div className="pointer-events-auto w-72 rounded-2xl bg-slate-900/70 p-4 text-white shadow-xl backdrop-blur">
      <div className="flex items-center gap-2 text-sm font-black uppercase tracking-wider">
        <Icon name="clover" className="h-4 w-4 text-emerald-300" /> Compra tus tarjetas
      </div>
      <p className="mt-1 text-xs text-white/60">
        {price} lingotes por tarjeta. Se te asignan al azar y empiezas a jugar al instante.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setQty((q) => Math.max(1, q - 1))}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-lg font-black hover:bg-white/20"
        >
          <Icon name="minus" className="h-4 w-4" />
        </button>
        <span className="w-10 text-center text-lg font-black tabular-nums">{qty}</span>
        <button
          type="button"
          onClick={() => setQty((q) => (maxPer ? Math.min(maxPer, q + 1) : q + 1))}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-lg font-black hover:bg-white/20"
        >
          <Icon name="plus" className="h-4 w-4" />
        </button>
        <span className="ml-auto text-sm font-black text-emerald-300 tabular-nums">{qty * price} ling.</span>
      </div>
      <button
        type="button"
        onClick={buy}
        disabled={busy}
        className="mt-3 w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-400 disabled:opacity-50"
      >
        {busy ? "Comprando..." : `Comprar ${qty} tarjeta${qty === 1 ? "" : "s"}`}
      </button>
      {err && <p className="mt-2 text-xs font-semibold text-rose-300">{err}</p>}
      {maxPer ? <p className="mt-1.5 text-[10px] text-white/40">Maximo {maxPer} por persona.</p> : null}
    </div>
  );
}
