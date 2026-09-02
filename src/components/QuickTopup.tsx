import { useEffect, useMemo, useState } from "react";
import Lingote from "./Lingote";

interface Pkg { amountUsd: number; base: number; bonus: number; total: number }

const nf = (n: number) => new Intl.NumberFormat("es-PE").format(n);

// Inline top-up shown inside the BuyWidget when the user lacks lingotes, so they
// never leave the raffle. Before redirecting to the payment gateway it stashes
// the intended purchase (qori_pending_buy) so we can resume the ticket buy when
// they come back. See BuyWidget (resume) and Recharge (post-redirect polling).
export default function QuickTopup({ slug, qty, comment, need }: { slug: string; qty: number; comment: string; need: number }) {
  const [pkgs, setPkgs] = useState<Pkg[]>([]);
  const [promo, setPromo] = useState(false);
  const [promoEnds, setPromoEnds] = useState<string | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [method, setMethod] = useState("MERCADOPAGO");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    fetch("/api/topups/packages").then((r) => r.json()).then((d) => {
      if (Array.isArray(d?.packages)) {
        setPkgs(d.packages); setPromo(!!d.promo); setPromoEnds(d.promoEndsAt ?? null);
      }
    }).catch(() => {});
    return () => clearInterval(iv);
  }, []);

  // Suggest the cheapest package that covers the deficit, plus the next one up
  // (better value). If nothing covers it (deficit larger than the biggest pack),
  // show the two biggest.
  const suggested = useMemo(() => {
    if (!pkgs.length) return [];
    const cover = pkgs.filter((p) => p.total >= need).sort((a, b) => a.total - b.total);
    if (cover.length) return cover.slice(0, 3);
    return [...pkgs].sort((a, b) => b.total - a.total).slice(0, 2);
  }, [pkgs, need]);

  useEffect(() => { if (suggested.length && sel == null) setSel(suggested[0].amountUsd); }, [suggested, sel]);

  const promoLeft = promo && promoEnds ? Math.max(0, Math.floor((new Date(promoEnds).getTime() - now) / 1000)) : 0;
  const hh = Math.floor(promoLeft / 3600), mm = Math.floor((promoLeft % 3600) / 60);

  async function pay() {
    if (!sel) return;
    setLoading(true); setErr("");
    try { localStorage.setItem("qori_pending_buy", JSON.stringify({ slug, qty, comment, need, ts: Date.now() })); } catch {}
    try {
      const res = await fetch("/api/topups", {
        method: "POST", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountUsd: sel, method }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.checkoutUrl) { window.location.href = d.checkoutUrl; return; }
      if (res.ok && d.crypto) {
        // Manual crypto fallback (no hosted checkout): finish on /recargar.
        window.location.href = `/recargar?need=${need}&para=${encodeURIComponent(slug)}`;
        return;
      }
      setErr("No se pudo iniciar el pago. Intenta de nuevo.");
    } catch { setErr("Error de red. Revisa tu conexion."); }
    setLoading(false);
  }

  const selPkg = pkgs.find((p) => p.amountUsd === sel);

  return (
    <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
      <div className="flex items-center gap-1.5 text-sm font-semibold text-emerald-800">
        <Lingote /> Te faltan {nf(need)} lingotes para tus {qty} ticket{qty > 1 ? "s" : ""}
      </div>
      {promo && promoLeft > 0 && (
        <p className="mt-1 text-xs font-semibold text-emerald-700">Promo 2x1: recibes el doble. Termina en {hh > 0 ? `${hh}h ` : ""}{mm}m.</p>
      )}

      <div className="mt-3 grid grid-cols-3 gap-2">
        {suggested.map((p) => {
          const active = sel === p.amountUsd;
          return (
            <button key={p.amountUsd} type="button" onClick={() => setSel(p.amountUsd)}
              className={`relative flex flex-col items-center rounded-lg border px-2 py-2 transition ${active ? "border-emerald-500 bg-white ring-1 ring-emerald-500" : "border-slate-200 bg-white hover:border-slate-300"}`}>
              {promo && p.bonus > 0 && <span className="absolute -top-2 rounded-full bg-emerald-500 px-1.5 text-[9px] font-black text-white">x2</span>}
              <span className="text-sm font-bold text-slate-900">${p.amountUsd / 100}</span>
              <span className="flex items-center gap-0.5 text-xs font-semibold text-emerald-700">{nf(p.total)} <Lingote /></span>
            </button>
          );
        })}
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2">
        {[["MERCADOPAGO", "mercadopago", "MercadoPago"], ["PAYPAL", "paypal", "PayPal"], ["CRYPTO", "binance", "Cripto"]].map(([m, img, label]) => (
          <button key={m} type="button" onClick={() => setMethod(m)}
            className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-2 transition ${method === m ? "border-emerald-500 bg-white ring-1 ring-emerald-500" : "border-slate-200 bg-white hover:border-slate-300"}`}>
            <img src={`/pay/${img}.svg`} alt={label} className="h-5" />
            <span className="text-[9px] text-slate-500">{label}</span>
          </button>
        ))}
      </div>

      {err && <p role="alert" className="mt-2 text-xs text-red-600">{err}</p>}
      <button onClick={pay} disabled={loading || !sel} className="mt-3 w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:bg-slate-300">
        {loading ? "Redirigiendo..." : selPkg ? `Recargar $${selPkg.amountUsd / 100} y completar mi compra` : "Recargar y completar mi compra"}
      </button>
      <p className="mt-1.5 text-center text-[11px] text-emerald-700/80">Vuelves aqui automaticamente para terminar tu compra.</p>
    </div>
  );
}
