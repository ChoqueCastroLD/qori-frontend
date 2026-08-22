import Lingote from "./Lingote";
import { useEffect, useState } from "react";

interface Props {
  slug: string;
  ticketPrice: number;
  maxPerUser: number | null;
}

export default function BuyWidget({ slug, ticketPrice, maxPerUser }: Props) {
  const [me, setMe] = useState<{ balance: number } | null>(null);
  const [qty, setQty] = useState(1);
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [msg, setMsg] = useState("");
  const [numbers, setNumbers] = useState<number[]>([]);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setMe(d?.user ?? null))
      .catch(() => {});
  }, []);

  const cost = qty * ticketPrice;
  const max = maxPerUser ?? 100;

  async function buy() {
    setStatus("loading");
    setMsg("");
    try {
      const res = await fetch(`/api/raffles/${slug}/buy`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ quantity: qty, comment: comment || undefined }),
      });
      const d = await res.json();
      if (!res.ok) {
        if (d.error === "insufficient_funds") {
          setStatus("err");
          setMsg("Saldo insuficiente. Recarga lingotes para continuar.");
        } else if (d.error === "sold_out") {
          setStatus("err");
          setMsg("No quedan suficientes boletos.");
        } else if (d.error === "per_user_limit") {
          setStatus("err");
          setMsg("Superas el máximo de boletos por persona.");
        } else {
          setStatus("err");
          setMsg("No se pudo completar la compra.");
        }
        return;
      }
      setNumbers(d.numbers);
      setStatus("ok");
      setMe((m) => (m ? { balance: m.balance - cost + qty } : m));
      // Tell the nav (and any other island) to refresh the balance.
      window.dispatchEvent(new CustomEvent("qori:refresh"));
      // Update the raffle progress bar in place (no reload).
      const soldEl = document.getElementById("rf-sold") as HTMLElement | null;
      const fillEl = document.getElementById("rf-fill") as HTMLElement | null;
      if (soldEl) {
        const total = Number(soldEl.dataset.total || 0);
        const sold = Number(soldEl.dataset.sold || 0) + qty;
        soldEl.dataset.sold = String(sold);
        soldEl.textContent = `${sold} / ${total} boletos`;
        if (fillEl && total) fillEl.style.width = `${Math.min(100, Math.round((sold / total) * 100))}%`;
      }
    } catch {
      setStatus("err");
      setMsg("Error de red.");
    }
  }

  if (me === null) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <p className="text-sm text-slate-600">Inicia sesión para participar en este sorteo.</p>
        <a href="/entrar" className="mt-4 inline-block w-full rounded-xl bg-slate-900 px-6 py-3 text-center text-sm font-semibold text-white hover:bg-slate-700">
          Entrar para participar
        </a>
      </div>
    );
  }

  if (status === "ok") {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
        <div className="text-3xl">🎟️</div>
        <h3 className="mt-2 font-bold text-emerald-800">¡Ya estás participando!</h3>
        <p className="mt-1 text-sm text-emerald-700">Tus números:</p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {numbers.map((n) => (
            <span key={n} className="rounded-lg bg-white px-3 py-1 font-mono text-sm font-bold text-emerald-700">#{n}</span>
          ))}
        </div>
        <a href="/cuenta" className="mt-4 inline-block text-sm font-semibold text-emerald-700 underline">Ver mis boletos</a>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="mb-4 flex items-center justify-between text-sm">
        <span className="text-slate-500">Tu saldo</span>
        <span className="font-semibold text-emerald-700">{new Intl.NumberFormat("es-PE").format(me.balance)} <Lingote /></span>
      </div>

      <label className="mb-1 block text-sm font-medium text-slate-700">Cantidad de boletos</label>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} className="h-10 w-10 rounded-lg border border-slate-200 text-lg font-bold text-slate-600 hover:bg-slate-50">−</button>
        <input
          type="number"
          min={1}
          max={max}
          value={qty}
          onChange={(e) => setQty(Math.max(1, Math.min(max, Number(e.target.value) || 1)))}
          className="h-10 w-full rounded-lg border border-slate-200 text-center font-semibold"
        />
        <button type="button" onClick={() => setQty((q) => Math.min(max, q + 1))} className="h-10 w-10 rounded-lg border border-slate-200 text-lg font-bold text-slate-600 hover:bg-slate-50">+</button>
      </div>
      <div className="mt-2 flex gap-1.5">
        {[1, 5, 10, 25].map((n) => (
          <button type="button" key={n} onClick={() => setQty(Math.min(max, n))} className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200">{n}</button>
        ))}
      </div>

      <label className="mb-1 mt-4 block text-sm font-medium text-slate-700">Comentario (opcional)</label>
      <input
        value={comment}
        onChange={(e) => setComment(e.target.value.slice(0, 140))}
        placeholder="¡Suerte a todos!"
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
      />

      <div className="my-4 flex items-center justify-between border-t border-slate-100 pt-4 text-sm">
        <span className="text-slate-500">Total</span>
        <span className="text-lg font-bold text-slate-900">{new Intl.NumberFormat("es-PE").format(cost)} <Lingote /></span>
      </div>

      {msg && <p className={`mb-3 text-sm ${status === "err" ? "text-red-600" : "text-slate-600"}`}>{msg}</p>}
      {status === "err" && msg.includes("Recarga") && (
        <a href="/recargar" className="mb-3 block rounded-lg bg-amber-50 px-3 py-2 text-center text-sm font-semibold text-amber-700">Recargar lingotes →</a>
      )}

      <button
        onClick={buy}
        disabled={status === "loading" || cost > me.balance}
        className="w-full rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {status === "loading" ? "Procesando…" : cost > me.balance ? "Saldo insuficiente" : `Comprar ${qty} boleto${qty > 1 ? "s" : ""}`}
      </button>
      <p className="mt-2 text-center text-xs text-slate-400">Recibes +1 lingote de bono por cada boleto.</p>
    </div>
  );
}
