import { useEffect, useState } from "react";
import RaffleChat from "./RaffleChat";

const GAME_LABEL: Record<string, string> = {
  ELIMINATION: "Eliminación", DIGIT_REVEAL: "Revelado de dígitos",
  BOMBS: "Bombas", SQUID: "Luz roja, luz verde", HORSE_RACE: "Carrera",
};
const GAME_ICON: Record<string, string> = {
  ELIMINATION: "⚡", DIGIT_REVEAL: "🔢", BOMBS: "💣", SQUID: "🟢", HORSE_RACE: "🐎",
};

export default function Verifier() {
  const [slug, setSlug] = useState("");
  const [raffle, setRaffle] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [all, setAll] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/raffles", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => setAll(Array.isArray(list) ? list : []))
      .catch(() => {});
    const s = new URLSearchParams(location.search).get("slug");
    if (s) { setSlug(s); load(s); }
  }, []);

  const suggestions = q.trim().length === 0
    ? all
    : all.filter((r) => `${r.title} ${r.slug}`.toLowerCase().includes(q.trim().toLowerCase()));

  function pick(r: any) {
    setQ(r.title);
    setSlug(r.slug);
    setOpen(false);
    load(r.slug);
  }

  async function load(s: string) {
    setError(""); setResult(null); setRaffle(null); setParticipants([]);
    try {
      const r = await fetch(`/api/raffles/${s}`, { credentials: "include" }).then((x) => x.json());
      if (r.error) { setError("No se encontró el sorteo."); return; }
      if (r.status !== "DRAWN") { setError("Este sorteo aún no ha sido sorteado."); setRaffle(r); return; }
      setRaffle(r);
      const sh = await fetch(`/api/raffles/${s}/show`, { credentials: "include" }).then((x) => x.json());
      setParticipants(sh.participants ?? []);
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

  // Map a canonical index -> real ticket number (numbers are random, not index+1).
  const num = (idx: number) => participants[idx]?.number ?? idx + 1;
  const part = (idx: number) => participants[idx];

  const publishedWinners = (raffle?.winners ?? []).map((w: any) => w.ticketNumber).sort((a: number, b: number) => a - b);
  const recomputedWinners = (result?.winners ?? []).map((i: number) => num(i)).sort((a: number, b: number) => a - b);
  const winnersMatch = result && JSON.stringify(publishedWinners) === JSON.stringify(recomputedWinners);
  const verified = result && result.commitmentOk && winnersMatch;

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <h1 className="text-2xl font-bold text-slate-900">Verificar un sorteo</h1>
      <p className="mt-2 text-sm text-slate-500">
        Recalculamos el sorteo desde la semilla revelada y te mostramos el resultado etapa por etapa.
        Todo el código es abierto — puedes correrlo tú mismo.
      </p>

      <div className="relative mt-6">
        <div className="flex gap-2">
          <div className="relative w-full">
            <input
              value={q}
              onChange={(e) => { setQ(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              placeholder="Busca por nombre del sorteo (ej. MacBook)…"
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
              autoComplete="off"
            />
            {open && suggestions.length > 0 && (
              <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                {suggestions.map((r) => (
                  <li key={r.slug}>
                    <button
                      onMouseDown={(e) => { e.preventDefault(); pick(r); }}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50"
                    >
                      {r.images?.[0] && <img src={r.images[0]} className="h-9 w-9 rounded-lg object-cover" alt="" />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-900">{r.title}</span>
                        <span className="block text-xs text-slate-400">{r.slug}</span>
                      </span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${r.status === "DRAWN" ? "bg-slate-900 text-white" : "bg-emerald-100 text-emerald-700"}`}>
                        {r.status === "DRAWN" ? "Finalizado" : "Activo"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button onClick={() => { const m = suggestions[0]; if (m) pick(m); else load(q.trim()); }} className="shrink-0 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">Cargar</button>
        </div>
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
          {!result && (
            <button onClick={verify} disabled={loading} className="mt-4 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:bg-slate-300">
              {loading ? "Recalculando…" : "Recalcular y verificar"}
            </button>
          )}
        </div>
      )}

      {result && (
        <>
          <div className={`mt-4 rounded-2xl border p-6 ${verified ? "border-emerald-300 bg-emerald-50" : "border-red-300 bg-red-50"}`}>
            <div className="text-3xl">{verified ? "✅" : "❌"}</div>
            <h3 className={`mt-2 text-lg font-bold ${verified ? "text-emerald-800" : "text-red-800"}`}>
              {verified ? "Verificado: el sorteo fue justo" : "¡Discrepancia detectada!"}
            </h3>
            <ul className="mt-3 space-y-1 text-sm">
              <li className={result.commitmentOk ? "text-emerald-700" : "text-red-700"}>{result.commitmentOk ? "✓" : "✗"} La semilla revelada coincide con el compromiso público</li>
              <li className={winnersMatch ? "text-emerald-700" : "text-red-700"}>{winnersMatch ? "✓" : "✗"} Los ganadores recalculados coinciden con los publicados</li>
              <li className="text-slate-600">{result.stages.length} etapas recalculadas desde la semilla</li>
            </ul>
          </div>

          {/* Static stage-by-stage history (no animation) */}
          <div className="mt-6">
            <h3 className="mb-1 text-lg font-bold text-slate-900">Historial del sorteo</h3>
            <p className="mb-4 text-sm text-slate-500">Reconstruido desde la semilla. Cada etapa muestra los boletos descartados; al final, el ganador.</p>

            <div className="space-y-4">
              {result.stages.map((st: any, i: number) => (
                <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-base">{GAME_ICON[st.game] ?? "•"}</span>
                    <div>
                      <div className="font-semibold text-slate-900">
                        Etapa {i + 1}: {GAME_LABEL[st.game] ?? st.game}
                        {st.isFinale && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">final</span>}
                      </div>
                      <div className="text-xs text-slate-500">{st.eliminated.length} boleto(s) descartado(s)</div>
                    </div>
                  </div>
                  {st.game === "DIGIT_REVEAL" && st.data?.winnerNumbers && (
                    <div className="mb-3 text-sm text-slate-600">Número(s) ganador(es) revelado(s): <strong>{(st.data.winnerNumbers as string[]).join(", ")}</strong></div>
                  )}
                  <div className="flex max-h-40 flex-wrap gap-1 overflow-auto">
                    {st.eliminated.map((idx: number) => (
                      <span key={idx} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-500">#{num(idx)}</span>
                    ))}
                  </div>
                </div>
              ))}

              {/* Winner(s) at the very end */}
              <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5">
                <div className="text-2xl">🏆</div>
                <h4 className="mt-1 font-bold text-emerald-800">{recomputedWinners.length > 1 ? "Ganadores" : "Ganador"}</h4>
                <div className="mt-3 flex flex-wrap gap-3">
                  {(result.winners ?? []).map((idx: number, k: number) => {
                    const p = part(idx);
                    return (
                      <div key={idx} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2">
                        {p?.avatarUrl ? <img src={p.avatarUrl} className="h-9 w-9 rounded-full" alt="" /> : <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-sm font-bold text-slate-500">{(p?.nickname || "?")[0]}</span>}
                        <div>
                          <div className="text-sm font-semibold text-slate-900">{result.winners.length > 1 ? `${k + 1}º · ` : ""}#{num(idx)}</div>
                          {p?.nickname && <div className="text-xs text-slate-500">{p.nickname}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {raffle && raffle.status === "DRAWN" && (
        <div className="mt-8">
          <h3 className="mb-3 text-lg font-bold text-slate-900">Chat del sorteo</h3>
          <RaffleChat slug={raffle.slug} compact />
        </div>
      )}
    </div>
  );
}
