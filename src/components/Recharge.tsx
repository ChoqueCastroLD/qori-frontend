import Lingote from "./Lingote";
import { useEffect, useMemo, useState } from "react";

// Fixed packages (USD cents → base + bonus lingotes). Must match the backend.
const PACKAGES = [
  { usd: 500, base: 50, bonus: 0 },
  { usd: 1000, base: 100, bonus: 10 },
  { usd: 2000, base: 200, bonus: 20 },
  { usd: 5000, base: 500, bonus: 30 },
];
const PREMIUM = [
  { usd: 10000, base: 1000, bonus: 100 },
  { usd: 50000, base: 5000, bonus: 500 },
];
const BONUS_ACTIVE = Date.now() < Date.parse("2026-09-16T04:59:59Z"); // hasta 15-set

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
  const [mpMsg, setMpMsg] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!d?.user) { window.location.href = "/entrar"; return; }
      setMe(d.user);
    });
    fetch("/api/fx").then((r) => r.json()).then((d) => setFx(d.rates ?? null)).catch(() => {});
    fetch("/api/raffles").then((r) => r.json()).then((d) => setRaffles(Array.isArray(d) ? d.filter((r) => r.status === "OPEN") : [])).catch(() => {});
    const q = new URLSearchParams(location.search);
    const mp = q.get("mp"), pp = q.get("pp");
    if (mp === "success" || pp === "success") setMpMsg({ tone: "ok", text: "¡Pago recibido! Estamos acreditando tus lingotes; tu saldo se actualizará en unos segundos." });
    else if (mp === "pending") setMpMsg({ tone: "warn", text: "Tu pago quedó pendiente. Cuando lo aprueben, acreditaremos tus lingotes." });
    else if (mp === "failure" || pp === "failure") setMpMsg({ tone: "warn", text: "El pago no se completó. Puedes intentar de nuevo." });
    else if (pp === "cancel") setMpMsg({ tone: "warn", text: "Cancelaste el pago. Puedes intentar de nuevo cuando quieras." });
  }, []);

  const pkg = useMemo(() => [...PACKAGES, ...PREMIUM].find((p) => p.usd === sel)!, [sel]);
  const totalLingotes = pkg.base + (BONUS_ACTIVE ? pkg.bonus : 0);

  function localRef(usdCents: number): string | null {
    const c = CUR[me?.country ?? "PE"] ?? CUR.PE;
    const rate = fx?.[c.code];
    if (!rate) return null;
    const v = (usdCents / 100) * rate;
    return `aprox ${c.sym} ${new Intl.NumberFormat(c.locale, { maximumFractionDigits: 0 }).format(v)}`;
  }

  async function pay() {
    setLoading(true);
    const res = await fetch("/api/topups", {
      method: "POST", credentials: "include", headers: { "content-type": "application/json" },
      body: JSON.stringify({ amountUsd: sel, method }),
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok && d.checkoutUrl) { window.location.href = d.checkoutUrl; return; }
    setLoading(false);
    alert("No se pudo iniciar el pago. Intenta de nuevo.");
  }

  if (!me) return <p className="py-20 text-center text-slate-400">Cargando…</p>;

  const Pkg = ({ p, premium }: { p: typeof PACKAGES[0]; premium?: boolean }) => {
    const active = sel === p.usd;
    const total = p.base + (BONUS_ACTIVE ? p.bonus : 0);
    const ref = localRef(p.usd);
    return (
      <button
        type="button" onClick={() => setSel(p.usd)}
        className={`relative flex flex-col rounded-xl border p-3 text-left transition ${active ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500" : "border-slate-200 hover:border-slate-300"}`}
      >
        {premium && <span className="absolute -top-2 right-2 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-amber-900">PREMIUM</span>}
        <span className="text-lg font-bold text-slate-900">${p.usd / 100}</span>
        {ref && <span className="text-[11px] text-slate-400">{ref}</span>}
        <span className="mt-1 flex items-center gap-1 text-sm font-semibold text-slate-700">
          {new Intl.NumberFormat("es-PE").format(total)} <Lingote />
        </span>
        {BONUS_ACTIVE && p.bonus > 0 && <span className="text-xs font-bold text-emerald-600">incluye +{p.bonus} bono</span>}
      </button>
    );
  };

  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      <h1 className="text-2xl font-bold text-slate-900">Recargar lingotes</h1>
      <p className="mt-1 text-sm text-slate-500">1 USD = 10 lingotes. Saldo actual: <strong>{me.balance} <Lingote /></strong></p>
      {mpMsg && <p className={`mt-4 rounded-lg px-3 py-2 text-sm ${mpMsg.tone === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{mpMsg.text}</p>}

      {BONUS_ACTIVE && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <span className="text-base">🎁</span>
          <span><strong>Bono por tiempo limitado:</strong> lingotes extra en los paquetes, solo hasta el <strong>15 de setiembre</strong>.</span>
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
        <label className="mb-2 block text-sm font-medium text-slate-700">Elige un paquete</label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PACKAGES.map((p) => <Pkg key={p.usd} p={p} />)}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {PREMIUM.map((p) => <Pkg key={p.usd} p={p} premium />)}
        </div>

        {/* Real-time ticket calculator */}
        <div className="mt-5 rounded-xl bg-slate-50 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">Recibes</span>
            <span className="flex items-center gap-1 text-lg font-bold text-emerald-600">{new Intl.NumberFormat("es-PE").format(totalLingotes)} <Lingote /></span>
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
                    {r.ticketPrice === 0 ? "∞ (gratis)" : `${Math.floor(totalLingotes / r.ticketPrice)} boletos`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Payment method */}
        <label className="mb-2 mt-5 block text-sm font-medium text-slate-700">Método de pago</label>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setMethod("MERCADOPAGO")} className={`flex flex-col items-center gap-1 rounded-lg border px-3 py-3 ${method === "MERCADOPAGO" ? "border-emerald-500 bg-emerald-50" : "border-slate-200"}`}>
            <img src="/pay/mercadopago.svg" alt="MercadoPago" className="h-6" />
            <span className="text-[11px] text-slate-500">Yape · Plin · Tarjeta</span>
          </button>
          <button type="button" onClick={() => setMethod("PAYPAL")} className={`flex flex-col items-center gap-1 rounded-lg border px-3 py-3 ${method === "PAYPAL" ? "border-emerald-500 bg-emerald-50" : "border-slate-200"}`}>
            <img src="/pay/paypal.svg" alt="PayPal" className="h-6" />
            <span className="text-[11px] text-slate-500">Tarjeta o saldo PayPal</span>
          </button>
        </div>

        <button onClick={pay} disabled={loading} className="mt-6 w-full rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:bg-slate-400">
          {loading ? "Redirigiendo…" : `Pagar $${sel / 100} con ${method === "PAYPAL" ? "PayPal" : "MercadoPago"}`}
        </button>
        <p className="mt-2 text-center text-xs text-slate-400">Pago seguro. Los lingotes se acreditan automáticamente al confirmarse.</p>
      </div>
    </div>
  );
}
