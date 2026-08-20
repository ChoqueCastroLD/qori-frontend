import { useEffect, useState } from "react";

const GAMES = ["ELIMINATION", "DIGIT_REVEAL", "BOMBS", "SQUID", "HORSE_RACE"];

async function adminFetch(path: string, init?: RequestInit) {
  const res = await fetch(`/api${path}`, { credentials: "include", headers: { "content-type": "application/json" }, ...init });
  return { ok: res.ok, status: res.status, data: res.status === 204 ? null : await res.json().catch(() => null) };
}

export default function Admin() {
  const [me, setMe] = useState<any>(null);
  const [tab, setTab] = useState<"raffles" | "topups" | "create">("raffles");
  const [raffles, setRaffles] = useState<any[]>([]);
  const [topups, setTopups] = useState<any[]>([]);
  const [msg, setMsg] = useState("");

  function reload() {
    adminFetch("/admin/raffles").then((r) => r.ok && setRaffles(r.data));
    adminFetch("/admin/topups?status=PENDING").then((r) => r.ok && setTopups(r.data));
  }
  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!d?.user) { window.location.href = "/entrar"; return; }
      if (d.user.role !== "ADMIN") { window.location.href = "/"; return; }
      setMe(d.user); reload();
    });
  }, []);

  async function draw(id: string) {
    setMsg("Sorteando…");
    const r = await adminFetch(`/admin/raffles/${id}/draw`, { method: "POST" });
    setMsg(r.ok ? `✓ Sorteado. Ganador(es): ${r.data.winners.map((w: any) => "#" + w.number).join(", ")}` : `✗ ${r.data?.error}`);
    reload();
  }
  async function cancel(id: string) {
    if (!confirm("¿Cancelar y reembolsar este sorteo?")) return;
    const r = await adminFetch(`/admin/raffles/${id}/cancel`, { method: "POST" });
    setMsg(r.ok ? `✓ Cancelado, ${r.data.refundedOrders} órdenes reembolsadas` : "✗ Error");
    reload();
  }
  async function approve(id: string) {
    const r = await adminFetch(`/admin/topups/${id}/approve`, { method: "POST" });
    setMsg(r.ok ? `✓ Recarga aprobada (+${r.data.lingotes} ⧉)` : "✗ Error");
    reload();
  }
  async function reject(id: string) {
    await adminFetch(`/admin/topups/${id}/reject`, { method: "POST" });
    reload();
  }

  if (!me) return <p className="py-20 text-center text-slate-400">Cargando…</p>;

  return (
    <div className="mx-auto max-w-4xl px-5 py-10">
      <h1 className="text-2xl font-bold text-slate-900">Panel de administración</h1>
      {msg && <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{msg}</p>}

      <div className="mt-5 flex gap-1 border-b border-slate-200">
        {([["raffles", "Sorteos"], ["topups", `Recargas (${topups.length})`], ["create", "Crear sorteo"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2.5 text-sm font-semibold ${tab === k ? "border-b-2 border-emerald-500 text-slate-900" : "text-slate-500"}`}>{l}</button>
        ))}
      </div>

      {tab === "raffles" && (
        <div className="mt-6 space-y-3">
          {raffles.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
              <div>
                <div className="font-semibold text-slate-900">{r.title}</div>
                <div className="text-xs text-slate-500">{r.status} · {r._count?.tickets ?? 0}/{r.totalTickets} boletos · min {r.minTickets}</div>
              </div>
              <div className="flex gap-2">
                {r.status !== "DRAWN" && r.status !== "CANCELLED" && (
                  <button onClick={() => draw(r.id)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500">Sortear</button>
                )}
                {r.status !== "DRAWN" && r.status !== "CANCELLED" && (
                  <button onClick={() => cancel(r.id)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600">Cancelar</button>
                )}
                {r.status === "DRAWN" && <a href={`/sorteos/${r.slug}/show`} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600">Ver show</a>}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "topups" && (
        <div className="mt-6 space-y-3">
          {topups.length === 0 ? <p className="text-slate-400">No hay recargas pendientes.</p> : topups.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
              <div>
                <div className="font-semibold text-slate-900">{t.lingotes} ⧉ · ${(t.amountUsd / 100).toFixed(2)}</div>
                <div className="text-xs text-slate-500">{t.user?.email} · {t.method} {t.proofUrl && <a href={t.proofUrl} target="_blank" className="text-emerald-600 underline">comprobante</a>}</div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => approve(t.id)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white">Aprobar</button>
                <button onClick={() => reject(t.id)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600">Rechazar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "create" && <CreateRaffle onCreated={() => { setTab("raffles"); reload(); }} />}
    </div>
  );
}

function CreateRaffle({ onCreated }: { onCreated: () => void }) {
  const [f, setF] = useState<any>({
    slug: "", title: "", description: "", prizeUsd: 500, ticketPrice: 10, totalTickets: 200,
    minTickets: 50, winnersCount: 1, games: ["ELIMINATION", "DIGIT_REVEAL"], finale: "DIGIT_REVEAL",
    image: "https://picsum.photos/seed/new/900/600", closesInHours: 48,
  });
  const [err, setErr] = useState("");
  function toggleGame(g: string) {
    setF((s: any) => ({ ...s, games: s.games.includes(g) ? s.games.filter((x: string) => x !== g) : [...s.games, g] }));
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    const body = {
      slug: f.slug, title: f.title, description: f.description, images: [f.image],
      prizeValue: Math.round(f.prizeUsd * 100), ticketPrice: Number(f.ticketPrice),
      totalTickets: Number(f.totalTickets), minTickets: Number(f.minTickets),
      winnersCount: Number(f.winnersCount), games: f.games, finale: f.finale,
      closesAt: new Date(Date.now() + f.closesInHours * 3600000).toISOString(),
    };
    const r = await adminFetch("/admin/raffles", { method: "POST", body: JSON.stringify(body) });
    if (r.ok) onCreated(); else setErr(JSON.stringify(r.data));
  }
  const inp = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm";
  return (
    <form onSubmit={submit} className="mt-6 space-y-3 rounded-xl border border-slate-200 bg-white p-5">
      <div className="grid grid-cols-2 gap-3">
        <div><label className="text-xs text-slate-500">Slug</label><input required className={inp} value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} /></div>
        <div><label className="text-xs text-slate-500">Título</label><input required className={inp} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
      </div>
      <div><label className="text-xs text-slate-500">Descripción</label><textarea required className={inp} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
      <div><label className="text-xs text-slate-500">Imagen (URL)</label><input className={inp} value={f.image} onChange={(e) => setF({ ...f, image: e.target.value })} /></div>
      <div className="grid grid-cols-3 gap-3">
        <div><label className="text-xs text-slate-500">Valor USD</label><input type="number" className={inp} value={f.prizeUsd} onChange={(e) => setF({ ...f, prizeUsd: e.target.value })} /></div>
        <div><label className="text-xs text-slate-500">Precio (⧉)</label><input type="number" className={inp} value={f.ticketPrice} onChange={(e) => setF({ ...f, ticketPrice: e.target.value })} /></div>
        <div><label className="text-xs text-slate-500"># Ganadores</label><input type="number" className={inp} value={f.winnersCount} onChange={(e) => setF({ ...f, winnersCount: e.target.value })} /></div>
        <div><label className="text-xs text-slate-500">Total boletos</label><input type="number" className={inp} value={f.totalTickets} onChange={(e) => setF({ ...f, totalTickets: e.target.value })} /></div>
        <div><label className="text-xs text-slate-500">Mín. boletos</label><input type="number" className={inp} value={f.minTickets} onChange={(e) => setF({ ...f, minTickets: e.target.value })} /></div>
        <div><label className="text-xs text-slate-500">Cierra en (h)</label><input type="number" className={inp} value={f.closesInHours} onChange={(e) => setF({ ...f, closesInHours: e.target.value })} /></div>
      </div>
      <div>
        <label className="text-xs text-slate-500">Juegos</label>
        <div className="mt-1 flex flex-wrap gap-2">
          {GAMES.map((g) => (
            <button type="button" key={g} onClick={() => toggleGame(g)} className={`rounded-full px-3 py-1 text-xs font-medium ${f.games.includes(g) ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{g}</button>
          ))}
        </div>
      </div>
      <div><label className="text-xs text-slate-500">Juego final</label>
        <select className={inp} value={f.finale} onChange={(e) => setF({ ...f, finale: e.target.value })}>{f.games.map((g: string) => <option key={g} value={g}>{g}</option>)}</select>
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <button className="rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white">Crear sorteo</button>
    </form>
  );
}
