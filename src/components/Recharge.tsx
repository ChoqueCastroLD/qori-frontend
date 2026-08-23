import Lingote from "./Lingote";
import { useEffect, useState } from "react";

const METHODS = [
  { id: "MERCADOPAGO", label: "MercadoPago", emoji: "💳", manual: false },
  { id: "YAPE", label: "Yape", emoji: "📱", manual: true },
  { id: "PLIN", label: "Plin", emoji: "📲", manual: true },
  { id: "TRANSFER", label: "Transferencia", emoji: "🏦", manual: true },
];
const AMOUNTS = [500, 1000, 2000, 5000]; // USD cents

export default function Recharge() {
  const [me, setMe] = useState<any>(null);
  const [amount, setAmount] = useState(1000);
  const [method, setMethod] = useState("MERCADOPAGO");
  const [topup, setTopup] = useState<any>(null);
  const [proof, setProof] = useState("");
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [mpMsg, setMpMsg] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);

  function loadHistory() {
    fetch("/api/topups/mine", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).then((d) => setHistory(d?.topups ?? []));
  }
  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!d?.user) { window.location.href = "/entrar"; return; }
      setMe(d.user); loadHistory();
    });
    const mp = new URLSearchParams(location.search).get("mp");
    if (mp === "success") setMpMsg({ tone: "ok", text: "¡Pago recibido! Estamos acreditando tus lingotes; tu saldo se actualizará en unos segundos." });
    else if (mp === "pending") setMpMsg({ tone: "warn", text: "Tu pago quedó pendiente. Cuando MercadoPago lo apruebe, acreditaremos tus lingotes." });
    else if (mp === "failure") setMpMsg({ tone: "warn", text: "El pago no se completó. Puedes intentar de nuevo." });
    if (mp) { const t = setInterval(loadHistory, 3000); setTimeout(() => clearInterval(t), 30000); }
  }, []);

  async function createTopup() {
    setLoading(true);
    const res = await fetch("/api/topups", {
      method: "POST", credentials: "include", headers: { "content-type": "application/json" },
      body: JSON.stringify({ amountUsd: amount, method }),
    });
    const d = await res.json();
    if (res.ok && d.checkoutUrl) { window.location.href = d.checkoutUrl; return; } // MercadoPago
    setLoading(false);
    if (res.ok) { setTopup(d.topup); loadHistory(); }
    else if (d.error === "mp_not_configured" || d.error === "mp_error") { alert("MercadoPago no está disponible en este momento."); }
  }
  async function sendProof() {
    if (!topup || !proof) return;
    await fetch(`/api/topups/${topup.id}/proof`, {
      method: "POST", credentials: "include", headers: { "content-type": "application/json" },
      body: JSON.stringify({ proofUrl: proof }),
    });
    setTopup({ ...topup, proofUrl: proof });
    loadHistory();
  }

  if (!me) return <p className="py-20 text-center text-slate-400">Cargando…</p>;
  const lingotes = Math.round((amount / 100) * 10);

  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      <h1 className="text-2xl font-bold text-slate-900">Recargar lingotes</h1>
      <p className="mt-1 text-sm text-slate-500">1 USD = 10 lingotes. Saldo actual: <strong>{me.balance} <Lingote /></strong></p>
      {mpMsg && (
        <p className={`mt-4 rounded-lg px-3 py-2 text-sm ${mpMsg.tone === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{mpMsg.text}</p>
      )}

      {topup ? (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="font-bold text-amber-800">Recarga creada · pendiente de confirmación</h2>
          <p className="mt-1 text-sm text-amber-700">
            {topup.lingotes} <Lingote /> por ${(topup.amountUsd / 100).toFixed(2)} vía {topup.method}.
          </p>
          <div className="mt-4 rounded-lg bg-white p-4 text-sm text-slate-600">
            <p className="font-semibold text-slate-800">Instrucciones</p>
            <p className="mt-1">Envía el pago a: <strong>Yape/Plin 999-888-777</strong> (demo) y pega el enlace de tu comprobante para agilizar la confirmación.</p>
            <div className="mt-3 flex gap-2">
              <input value={proof} onChange={(e) => setProof(e.target.value)} placeholder="https://…comprobante.jpg" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <button onClick={sendProof} className="shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Enviar</button>
            </div>
            {topup.proofUrl && <p className="mt-2 text-emerald-600">✓ Comprobante recibido. Un admin confirmará tu recarga.</p>}
          </div>
          <button onClick={() => setTopup(null)} className="mt-4 text-sm font-semibold text-amber-700 underline">Hacer otra recarga</button>
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
          <label className="mb-2 block text-sm font-medium text-slate-700">Monto</label>
          <div className="grid grid-cols-4 gap-2">
            {AMOUNTS.map((a) => (
              <button key={a} onClick={() => setAmount(a)} className={`rounded-lg border px-3 py-3 text-sm font-semibold ${amount === a ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-600"}`}>
                ${a / 100}
                <div className="text-xs font-normal text-slate-400">{(a / 100) * 10} <Lingote /></div>
              </button>
            ))}
          </div>

          <label className="mb-2 mt-5 block text-sm font-medium text-slate-700">Método de pago</label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {METHODS.map((m) => (
              <button key={m.id} onClick={() => setMethod(m.id)} className={`rounded-lg border px-3 py-3 text-sm font-medium ${method === m.id ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-600"}`}>
                <span className="mr-1">{m.emoji}</span>{m.label}
              </button>
            ))}
          </div>

          <div className="my-5 flex items-center justify-between border-t border-slate-100 pt-4">
            <span className="text-sm text-slate-500">Recibes</span>
            <span className="text-lg font-bold text-emerald-600">{lingotes} <Lingote /></span>
          </div>
          <button onClick={createTopup} disabled={loading} className="w-full rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:bg-slate-400">
            {loading ? "…" : "Continuar"}
          </button>
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-8">
          <h3 className="text-sm font-semibold text-slate-900">Mis recargas</h3>
          <div className="mt-2 space-y-2">
            {history.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-lg border border-slate-100 bg-white px-4 py-2.5 text-sm">
                <span className="text-slate-600">{t.lingotes} <Lingote /> · {t.method}</span>
                <span className={t.status === "PAID" ? "font-semibold text-emerald-600" : t.status === "PENDING" ? "text-amber-600" : "text-slate-400"}>
                  {t.status === "PAID" ? "Confirmada" : t.status === "PENDING" ? "Pendiente" : t.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
