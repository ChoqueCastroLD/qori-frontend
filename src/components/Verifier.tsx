import { useEffect, useState } from "react";

export default function Verifier() {
  const [slug, setSlug] = useState("");
  const [raffle, setRaffle] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const s = new URLSearchParams(location.search).get("slug");
    if (s) { setSlug(s); load(s); }
  }, []);

  async function load(s: string) {
    setError(""); setResult(null); setRaffle(null);
    try {
      const r = await fetch(`/api/raffles/${s}`, { credentials: "include" }).then((x) => x.json());
      if (r.error) { setError("No se encontró el sorteo."); return; }
      if (r.status !== "DRAWN") { setError("Este sorteo aún no ha sido sorteado."); setRaffle(r); return; }
      setRaffle(r);
    } catch { setError("Error al cargar."); }
  }

  async function verify() {
    if (!raffle) return;
    setLoading(true); setError("");
    const f = raffle.fairness;
    const publicEntropy = `${f.drandRound}:${f.drandValue}:${f.ticketsRoot}`;
    try {
      const res = await fetch("/api/verify-show", {
        method: "POST", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          serverSeed: f.serverSeed, commitment: f.commitment, publicEntropy,
          ticketCount: raffle.ticketsSold, winnersCount: raffle.winnersCount,
          games: raffle.games, finale: raffle.finale,
        }),
      });
      setResult(await res.json());
    } catch { setError("Error al verificar."); }
    setLoading(false);
  }

  const actualWinners = raffle?.winners?.map((w: any) => w.ticketNumber).sort((a: number, b: number) => a - b) ?? [];
  const computedWinners = result?.winners?.slice().sort((a: number, b: number) => a - b) ?? [];
  const match = result && result.commitmentOk && JSON.stringify(actualWinners) === JSON.stringify(computedWinners);

  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      <h1 className="text-2xl font-bold text-slate-900">Verificar un sorteo</h1>
      <p className="mt-2 text-sm text-slate-500">
        Reproduce el sorteo con la semilla revelada y confirma que el resultado no fue manipulado.
        Todo el código es abierto — puedes correrlo tú mismo.
      </p>

      <div className="mt-6 flex gap-2">
        <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="slug del sorteo (ej. macbook-air-m3)" className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" />
        <button onClick={() => load(slug)} className="shrink-0 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">Cargar</button>
      </div>

      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {raffle && raffle.status === "DRAWN" && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <h2 className="font-semibold text-slate-900">{raffle.title}</h2>
          <dl className="mt-3 space-y-2 text-xs">
            <div><dt className="text-slate-500">commitment = sha256(semilla)</dt><dd className="break-all font-mono text-slate-700">{raffle.fairness.commitment}</dd></div>
            <div><dt className="text-slate-500">semilla revelada</dt><dd className="break-all font-mono text-emerald-700">{raffle.fairness.serverSeed}</dd></div>
            <div><dt className="text-slate-500">drand round · valor · raíz de boletos</dt><dd className="break-all font-mono text-slate-700">{raffle.fairness.drandRound} · {raffle.fairness.drandValue?.slice(0, 20)}… · {raffle.fairness.ticketsRoot?.slice(0, 20)}…</dd></div>
          </dl>
          <button onClick={verify} disabled={loading} className="mt-4 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:bg-slate-300">
            {loading ? "Verificando…" : "Reproducir y verificar"}
          </button>
        </div>
      )}

      {result && (
        <div className={`mt-4 rounded-2xl border p-6 ${match ? "border-emerald-300 bg-emerald-50" : "border-red-300 bg-red-50"}`}>
          <div className="text-3xl">{match ? "✅" : "❌"}</div>
          <h3 className={`mt-2 text-lg font-bold ${match ? "text-emerald-800" : "text-red-800"}`}>
            {match ? "Verificado: el sorteo fue justo" : "¡Discrepancia detectada!"}
          </h3>
          <ul className="mt-3 space-y-1 text-sm">
            <li className={result.commitmentOk ? "text-emerald-700" : "text-red-700"}>
              {result.commitmentOk ? "✓" : "✗"} La semilla revelada coincide con el compromiso público
            </li>
            <li className="text-slate-700">Ganadores recalculados: <strong>{computedWinners.map((n: number) => `#${n}`).join(", ")}</strong></li>
            <li className="text-slate-700">Ganadores publicados: <strong>{actualWinners.map((n: number) => `#${n}`).join(", ")}</strong></li>
          </ul>
        </div>
      )}
    </div>
  );
}
