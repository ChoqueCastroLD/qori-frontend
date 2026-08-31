import Lingote from "./Lingote";
import TicketIcon from "./TicketIcon";
import Icon from "./Icon";
import Skeleton from "./Skeleton";
import { useEffect, useState } from "react";

interface Props {
  slug: string;
  ticketPrice: number;
  maxPerUser: number | null;
  total: number;
  sold: number;
}

const nf = (n: number) => new Intl.NumberFormat("es-PE").format(n);

export default function BuyWidget({ slug, ticketPrice, maxPerUser, total, sold: soldInitial }: Props) {
  const [me, setMe] = useState<{ balance: number } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [qty, setQty] = useState(1);
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [msg, setMsg] = useState("");
  // Numbers from the LAST purchase (success panel) and ALL numbers this user
  // holds in this raffle (so they can keep buying up to the per-user limit).
  const [numbers, setNumbers] = useState<number[]>([]);
  const [myNumbers, setMyNumbers] = useState<number[]>([]);
  // Sold count kept in state so limits stay correct after our own purchases.
  const [sold, setSold] = useState(soldInitial);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setMe(d?.user ?? null))
      .catch(() => {})
      .finally(() => setLoaded(true));
    fetch("/api/me/tickets", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const nums = (d?.tickets ?? []).filter((t: any) => t.raffle?.slug === slug).map((t: any) => t.number);
        if (nums.length) setMyNumbers(nums.sort((a: number, b: number) => a - b));
      })
      .catch(() => {});
  }, [slug]);

  // Keep `sold` fresh when other people buy (Layout broadcasts WS updates).
  useEffect(() => {
    const onLive = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.slug === slug && typeof d.sold === "number") setSold((s) => Math.max(s, d.sold));
    };
    window.addEventListener("qori:live", onLive);
    return () => window.removeEventListener("qori:live", onLive);
  }, [slug]);

  const cost = qty * ticketPrice;
  // Cap at what's actually available; if the raffle has a per-user limit, also
  // subtract the tickets this user already holds.
  const remaining = Math.max(0, total - sold);
  const myRemaining = maxPerUser != null ? Math.max(0, maxPerUser - myNumbers.length) : remaining;
  const max = Math.max(1, Math.min(myRemaining, remaining));
  const soldOut = remaining <= 0;
  const atLimit = !soldOut && myRemaining <= 0;
  const canBuyMore = !soldOut && !atLimit;

  // Quick-pick options that always make sense for this max: for a small cap
  // just list 1..max (so a limit of 3 shows 1 2 3), otherwise a few round
  // steps plus the max itself.
  const quicks = (max <= 6
    ? Array.from({ length: max }, (_, i) => i + 1)
    : Array.from(new Set([1, 5, 10, 25, 50, 100, max].filter((n) => n >= 1 && n <= max)))
  ).sort((a, b) => a - b);

  // Keep the chosen amount within bounds if the max shrinks (e.g. tickets sell
  // out live while the widget is open).
  useEffect(() => { setQty((q) => Math.max(1, Math.min(max, q))); }, [max]);

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
          setMsg("Lingotes insuficientes. Recarga para continuar.");
        } else if (d.error === "sold_out") {
          setStatus("err");
          setMsg("No quedan suficientes tickets.");
        } else if (d.error === "per_user_limit") {
          setStatus("err");
          setMsg("Superas el máximo de tickets por persona.");
        } else if (d.error === "buy_disabled") {
          setStatus("err");
          setMsg("Tu cuenta no puede comprar tickets por ahora. Escríbenos a support@qori.cc si crees que es un error.");
        } else if (d.error === "raffle_blocked" || d.error === "raffle_not_open") {
          setStatus("err");
          setMsg("Este sorteo no está disponible por ahora.");
        } else {
          setStatus("err");
          setMsg("No se pudo completar la compra.");
        }
        return;
      }
      setNumbers(d.numbers);
      setMyNumbers((prev) => [...prev, ...d.numbers].sort((a, b) => a - b));
      setSold((s) => s + qty);
      setStatus("ok");
      setComment("");
      setMe((m) => (m ? { balance: m.balance - cost + (ticketPrice > 0 ? qty : 0) } : m));
      // Tell the nav (and any other island) to refresh the balance.
      window.dispatchEvent(new CustomEvent("qori:refresh"));
      // Update the raffle progress bar in place (no reload).
      const soldEl = document.getElementById("rf-sold") as HTMLElement | null;
      const fillEl = document.getElementById("rf-fill") as HTMLElement | null;
      if (soldEl) {
        const total = Number(soldEl.dataset.total || 0);
        const sold = Number(soldEl.dataset.sold || 0) + qty;
        soldEl.dataset.sold = String(sold);
        soldEl.textContent = `${sold} / ${total} tickets`;
        if (fillEl && total) fillEl.style.width = `${Math.min(100, Math.round((sold / total) * 100))}%`;
      }
    } catch {
      setStatus("err");
      setMsg("Error de red.");
    }
  }

  if (!loaded) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex justify-between"><Skeleton className="h-4 w-20" /><Skeleton className="h-4 w-24" /></div>
        <Skeleton className="mt-4 h-10 w-full rounded-lg" />
        <Skeleton className="mt-4 h-10 w-full rounded-lg" />
        <Skeleton className="mt-4 h-12 w-full rounded-xl" />
      </div>
    );
  }

  if (me === null) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <p className="text-sm text-slate-600">Inicia sesión para participar en este sorteo.</p>
        <a href="/entrar" className="mt-4 inline-block w-full rounded-xl bg-slate-900 px-6 py-3 text-center text-sm font-semibold text-white transition hover:bg-slate-700">
          Entrar para participar
        </a>
        <p className="mt-2 text-center text-xs text-slate-400">
          ¿No tienes cuenta? <a href="/registro" className="font-semibold text-emerald-700 hover:underline">Créala en un minuto</a>
        </p>
      </div>
    );
  }

  // Just bought: show the new numbers, and let them keep buying if there's room.
  if (status === "ok") {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
        <img src="/ticket.png" alt="" className="mx-auto h-14 w-14" />
        <h3 className="mt-2 font-bold text-emerald-800">¡Ya estás participando!</h3>
        <p className="mt-1 text-sm text-emerald-700">{numbers.length > 1 ? "Tus nuevos números:" : "Tu nuevo número:"}</p>
        <div className="mt-3 flex max-h-32 flex-wrap justify-center gap-2 overflow-y-auto">
          {numbers.map((n) => (
            <span key={n} className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1 font-mono text-sm font-bold text-emerald-700"><TicketIcon />#{n}</span>
          ))}
        </div>
        {myNumbers.length > numbers.length && (
          <p className="mt-2 text-xs text-emerald-700">Ya tienes {myNumbers.length} tickets en este sorteo.</p>
        )}
        <div className="mt-4 flex flex-col gap-2">
          {canBuyMore && (
            <button
              onClick={() => { setStatus("idle"); setMsg(""); setQty(1); }}
              className="w-full rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
            >
              Comprar más tickets
            </button>
          )}
          {atLimit && <p className="text-xs text-emerald-700">Llegaste al máximo de {maxPerUser} tickets por persona en este sorteo.</p>}
          {soldOut && <p className="text-xs text-emerald-700">Se vendieron todos los tickets. ¡Suerte!</p>}
          <a href="/cuenta" className="text-sm font-semibold text-emerald-700 underline">Ver mis tickets</a>
        </div>
      </div>
    );
  }

  if (soldOut) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
        <h3 className="font-bold text-slate-900">Tickets agotados</h3>
        <p className="mt-1 text-sm text-slate-500">
          {myNumbers.length > 0
            ? `Tienes ${myNumbers.length} ticket${myNumbers.length > 1 ? "s" : ""} en juego. El sorteo se realizará en la fecha programada.`
            : "Se vendieron todos los tickets de este sorteo."}
        </p>
        {myNumbers.length > 0 && (
          <div className="mt-3 flex max-h-28 flex-wrap justify-center gap-1.5 overflow-y-auto">
            {myNumbers.map((n) => (
              <span key={n} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-0.5 font-mono text-xs font-bold text-slate-700"><TicketIcon />#{n}</span>
            ))}
          </div>
        )}
        <a href="/sorteos" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:underline">
          Ver otros sorteos <Icon name="arrow-right" className="h-3.5 w-3.5" />
        </a>
      </div>
    );
  }

  if (atLimit) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
        <h3 className="font-bold text-emerald-800">Ya tienes el máximo de tickets</h3>
        <p className="mt-1 text-sm text-emerald-700">Este sorteo permite {maxPerUser} ticket{(maxPerUser ?? 0) > 1 ? "s" : ""} por persona y ya son tuyos. ¡Suerte!</p>
        <div className="mt-3 flex max-h-28 flex-wrap justify-center gap-1.5 overflow-y-auto">
          {myNumbers.map((n) => (
            <span key={n} className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-0.5 font-mono text-xs font-bold text-emerald-700"><TicketIcon />#{n}</span>
          ))}
        </div>
        <a href="/cuenta" className="mt-4 inline-block text-sm font-semibold text-emerald-700 underline">Ver mis tickets</a>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="mb-4 flex items-center justify-between text-sm">
        <span className="text-slate-500">Tus lingotes</span>
        <span className="font-semibold text-emerald-700">{nf(me.balance)} <Lingote /></span>
      </div>

      {myNumbers.length > 0 && (
        <div className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          Ya tienes <strong>{myNumbers.length}</strong> ticket{myNumbers.length > 1 ? "s" : ""} en este sorteo
          {maxPerUser != null ? ` (puedes comprar ${myRemaining} más)` : ""}: {myNumbers.map((n) => `#${n}`).join(", ")}
        </div>
      )}

      <label htmlFor="bw-qty" className="mb-1 block text-sm font-medium text-slate-700">Cantidad de tickets</label>
      <div className="flex items-center gap-2">
        <button type="button" aria-label="Restar un ticket" onClick={() => setQty((q) => Math.max(1, q - 1))} className="h-10 w-10 rounded-lg border border-slate-200 text-lg font-bold text-slate-600 transition hover:bg-slate-50">−</button>
        <input
          id="bw-qty"
          type="number"
          min={1}
          max={max}
          value={qty}
          onKeyDown={(e) => { if (["-", "+", "e", "E", "."].includes(e.key)) e.preventDefault(); }}
          onChange={(e) => { const n = Math.floor(Number(e.target.value)); setQty(!n || n < 1 ? 1 : Math.min(max, n)); }}
          className="h-10 w-full rounded-lg border border-slate-200 text-center font-semibold"
        />
        <button type="button" aria-label="Sumar un ticket" onClick={() => setQty((q) => Math.min(max, q + 1))} className="h-10 w-10 rounded-lg border border-slate-200 text-lg font-bold text-slate-600 transition hover:bg-slate-50">+</button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {quicks.map((n) => (
          <button type="button" key={n} onClick={() => setQty(n)} className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${qty === n ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{n}</button>
        ))}
      </div>

      <label htmlFor="bw-comment" className="mb-1 mt-4 block text-sm font-medium text-slate-700">Comentario (opcional)</label>
      <input
        id="bw-comment"
        value={comment}
        onChange={(e) => setComment(e.target.value.slice(0, 140))}
        placeholder="¡Suerte a todos!"
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
      />

      <div className="my-4 flex items-center justify-between border-t border-slate-100 pt-4 text-sm">
        <span className="text-slate-500">Total</span>
        <span className="text-lg font-bold text-slate-900">{nf(cost)} <Lingote /></span>
      </div>

      {msg && <p role="alert" className={`mb-3 text-sm ${status === "err" ? "text-red-600" : "text-slate-600"}`}>{msg}</p>}
      {cost > me.balance ? (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-center">
          <p className="flex items-center justify-center gap-1 text-sm font-semibold text-amber-800">
            <Lingote /> Te faltan {nf(cost - me.balance)} lingotes
          </p>
          <a href="/recargar" className="mt-2 inline-flex items-center justify-center gap-1 rounded-lg bg-amber-500 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-amber-400">
            Conseguir lingotes <Icon name="arrow-right" className="h-3.5 w-3.5" />
          </a>
        </div>
      ) : null}

      <button
        onClick={buy}
        disabled={status === "loading" || cost > me.balance}
        className="w-full rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {status === "loading" ? "Procesando…" : cost > me.balance ? "Lingotes insuficientes" : `Comprar ${qty} ticket${qty > 1 ? "s" : ""}`}
      </button>
      <p className="mt-2 text-center text-xs text-slate-400">Recibes +1 lingote de bono por cada ticket.</p>
    </div>
  );
}
