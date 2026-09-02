import Lingote from "./Lingote";
import Icon from "./Icon";
import { useEffect, useMemo, useState } from "react";

interface Pkg { amountUsd: number; base: number; bonus: number; total: number }

const CUR: Record<string, { code: string; sym: string; locale: string }> = {
  PE: { code: "PEN", sym: "S/", locale: "es-PE" },
  MX: { code: "MXN", sym: "MX$", locale: "es-MX" },
  CO: { code: "COP", sym: "COL$", locale: "es-CO" },
  CL: { code: "CLP", sym: "CLP$", locale: "es-CL" },
  AR: { code: "ARS", sym: "AR$", locale: "es-AR" },
};

export default function Recharge() {
  const [me, setMe] = useState<any>(null);
  const [sel, setSel] = useState(1000);
  const [method, setMethod] = useState("MERCADOPAGO");
  const [loading, setLoading] = useState(false);
  const [fx, setFx] = useState<Record<string, number> | null>(null);
  const [raffles, setRaffles] = useState<any[]>([]);
  const [pkgs, setPkgs] = useState<Pkg[]>([]);
  const [promo, setPromo] = useState(false);
  const [promoEnds, setPromoEnds] = useState<string | null>(null);
  const [mpMsg, setMpMsg] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [payErr, setPayErr] = useState("");

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!d?.user) { window.location.href = "/entrar"; return; }
      setMe(d.user);
    });
    fetch("/api/topups/packages").then((r) => r.json()).then((d) => {
      if (Array.isArray(d?.packages)) { setPkgs(d.packages); setPromo(!!d.promo); setPromoEnds(d.promoEndsAt ?? null); }
    }).catch(() => {});
    fetch("/api/fx").then((r) => r.json()).then((d) => setFx(d.rates ?? null)).catch(() => {});
    fetch("/api/raffles").then((r) => r.json()).then((d) => setRaffles(Array.isArray(d) ? d.filter((r) => r.status === "OPEN") : [])).catch(() => {});
    const q = new URLSearchParams(location.search);
    const mp = q.get("mp"), pp = q.get("pp");
    if (mp === "success" || pp === "success") setMpMsg({ tone: "ok", text: "¡Pago recibido! Estamos acreditando tus lingotes; tu saldo se actualizará en unos segundos." });
    else if (mp === "pending") setMpMsg({ tone: "warn", text: "Tu pago quedó pendiente. Cuando lo aprueben, acreditaremos tus lingotes." });
    else if (mp === "failure" || pp === "failure") setMpMsg({ tone: "warn", text: "El pago no se completó. Puedes intentar de nuevo." });
    else if (pp === "cancel") setMpMsg({ tone: "warn", text: "Cancelaste el pago. Puedes intentar de nuevo cuando quieras." });
  }, []);

  const pkg = useMemo(() => pkgs.find((p) => p.amountUsd === sel), [pkgs, sel]);
  const totalLingotes = pkg?.total ?? 0;
  const regular = pkgs.filter((p) => p.amountUsd < 10000);
  const premium = pkgs.filter((p) => p.amountUsd >= 10000);
  const promoDate = promoEnds ? new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "long", timeZone: "America/Lima" }).format(new Date(promoEnds)) : "";

  function localRef(usdCents: number): string | null {
    const c = CUR[me?.country ?? "PE"] ?? CUR.PE;
    const rate = fx?.[c.code];
    if (!rate) return null;
    const v = (usdCents / 100) * rate;
    return `aprox ${c.sym} ${new Intl.NumberFormat(c.locale, { maximumFractionDigits: 0 }).format(v)}`;
  }

  async function pay() {
    setLoading(true);
    setPayErr("");
    try {
      const res = await fetch("/api/topups", {
        method: "POST", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountUsd: sel, method }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.checkoutUrl) { window.location.href = d.checkoutUrl; return; }
      setPayErr(
        d?.error === "mp_not_configured" || d?.error === "paypal_not_configured"
          ? "Ese medio de pago no está disponible por ahora. Prueba con el otro."
          : "No se pudo iniciar el pago. Intenta de nuevo en unos segundos.",
      );
    } catch {
      setPayErr("Error de red. Revisa tu conexión e intenta de nuevo.");
    }
    setLoading(false);
  }

  if (!me) return <p className="py-20 text-center text-slate-400">Cargando…</p>;

  const PkgCard = ({ p, isPremium }: { p: Pkg; isPremium?: boolean }) => {
    const active = sel === p.amountUsd;
    const ref = localRef(p.amountUsd);
    return (
      <button
        type="button" aria-pressed={active} onClick={() => setSel(p.amountUsd)}
        className={`relative flex flex-col rounded-xl border p-3 text-left transition ${active ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500" : "border-slate-200 hover:border-slate-300"}`}
      >
        {promo && p.bonus > 0 && <span className="absolute -top-2 left-2 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-black text-white">x2</span>}
        {isPremium && <span className="absolute -top-2 right-2 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-amber-900">PREMIUM</span>}
        <span className="text-lg font-bold text-slate-900">${p.amountUsd / 100}</span>
        {ref && <span className="text-[11px] text-slate-400">{ref}</span>}
        <span className="mt-1 flex items-center gap-1 text-sm font-semibold text-slate-700">
          {new Intl.NumberFormat("es-PE").format(p.total)} <Lingote />
        </span>
        {p.bonus > 0 && (
          <span className="text-xs font-bold text-emerald-700">{promo ? "¡el doble de lingotes!" : `incluye +${p.bonus} bono`}</span>
        )}
      </button>
    );
  };

  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      <h1 className="text-2xl font-bold text-slate-900">Recargar lingotes</h1>
      <p className="mt-1 text-sm text-slate-500">1 USD = 10 lingotes. Saldo actual: <strong>{new Intl.NumberFormat("es-PE").format(me.balance)} <Lingote /></strong></p>
      {mpMsg && <p className={`mt-4 rounded-lg px-3 py-2 text-sm ${mpMsg.tone === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{mpMsg.text}</p>}

      {promo && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          <Icon name="gift" className="h-5 w-5 shrink-0" />
          <span><strong>Duplica tus tickets:</strong> recarga y recibe el <strong>DOBLE</strong> de lingotes{promoDate ? <> , solo hasta el <strong>{promoDate}</strong></> : null}.</span>
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
        <label className="mb-2 block text-sm font-medium text-slate-700">Elige un paquete</label>
        {pkgs.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">Cargando paquetes…</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {regular.map((p) => <PkgCard key={p.amountUsd} p={p} />)}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {premium.map((p) => <PkgCard key={p.amountUsd} p={p} isPremium />)}
            </div>
          </>
        )}

        {/* Real-time ticket calculator */}
        <div className="mt-5 rounded-xl bg-slate-50 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">Recibes</span>
            <span className="flex items-center gap-1 text-lg font-bold text-emerald-700">{new Intl.NumberFormat("es-PE").format(totalLingotes)} <Lingote /></span>
          </div>
          <p className="mt-2 text-xs font-semibold text-slate-500">Con eso puedes comprar aprox:</p>
          {raffles.length === 0 ? (
            <p className="mt-1 text-xs text-slate-400">No hay sorteos activos ahora mismo.</p>
          ) : (
            <ul className="mt-1 space-y-0.5">
              {raffles.slice(0, 5).map((r) => (
                <li key={r.slug} className="flex justify-between text-xs text-slate-600">
                  <span className="truncate pr-2">{r.title}</span>
                  <span className="shrink-0 font-semibold text-slate-800">
                    {r.ticketPrice === 0 ? "Gratis" : `${Math.floor(totalLingotes / r.ticketPrice)} tickets`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Payment method */}
        <label className="mb-2 mt-5 block text-sm font-medium text-slate-700">Método de pago</label>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" aria-pressed={method === "MERCADOPAGO"} onClick={() => setMethod("MERCADOPAGO")} className={`flex flex-col items-center gap-1 rounded-lg border px-3 py-3 transition ${method === "MERCADOPAGO" ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500" : "border-slate-200 hover:border-slate-300"}`}>
            <img src="/pay/mercadopago.svg" alt="MercadoPago" className="h-6" />
            <span className="text-[11px] text-slate-500">Yape · Plin · Tarjeta</span>
          </button>
          <button type="button" aria-pressed={method === "PAYPAL"} onClick={() => setMethod("PAYPAL")} className={`flex flex-col items-center gap-1 rounded-lg border px-3 py-3 transition ${method === "PAYPAL" ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500" : "border-slate-200 hover:border-slate-300"}`}>
            <img src="/pay/paypal.svg" alt="PayPal" className="h-6" />
            <span className="text-[11px] text-slate-500">Tarjeta o saldo PayPal</span>
          </button>
        </div>

        {payErr && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{payErr}</p>}
        <button onClick={pay} disabled={loading} className="mt-6 w-full rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:bg-slate-400">
          {loading ? "Redirigiendo…" : `Pagar $${sel / 100} con ${method === "PAYPAL" ? "PayPal" : "MercadoPago"}`}
        </button>
        <p className="mt-2 text-center text-xs text-slate-400">Pago seguro. Los lingotes se acreditan automáticamente al confirmarse.</p>
      </div>
    </div>
  );
}
