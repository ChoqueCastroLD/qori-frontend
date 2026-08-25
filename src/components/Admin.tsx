import { useEffect, useState } from "react";
import Lingote from "./Lingote";
import Icon from "./Icon";

const GAMES = ["ELIMINATION", "DIGIT_REVEAL", "BOMBS", "SQUID", "HORSE_RACE"];

async function adminFetch(path: string, init?: RequestInit) {
  const res = await fetch(`/api${path}`, { credentials: "include", headers: { "content-type": "application/json" }, ...init });
  return { ok: res.ok, status: res.status, data: res.status === 204 ? null : await res.json().catch(() => null) };
}

const usd = (c: number) => `$${((c ?? 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const nf = (n: number) => new Intl.NumberFormat("es-PE").format(n ?? 0);
const fmt = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "sin fecha";

// ISO -> value for <input type="datetime-local"> in the admin's local time.
function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function accountAge(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days < 1) return "hoy";
  if (days === 1) return "1 día";
  if (days < 30) return `${days} días`;
  const m = Math.floor(days / 30);
  return m === 1 ? "1 mes" : `${m} meses`;
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Borrador", OPEN: "Abierto", CLOSED: "Cerrado", DRAWING: "En vivo", DRAWN: "Finalizado", CANCELLED: "Cancelado",
};

export default function Admin() {
  const [me, setMe] = useState<any>(null);
  const [tab, setTab] = useState<"metrics" | "raffles" | "create">("metrics");
  const [raffles, setRaffles] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any>(null);
  const [msg, setMsg] = useState("");

  function reload() {
    adminFetch("/admin/raffles").then((r) => r.ok && setRaffles(r.data));
    adminFetch("/admin/metrics").then((r) => r.ok && setMetrics(r.data));
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
    setMsg(r.ok ? `Sorteado. Ganador(es): ${r.data.winners.map((w: any) => "#" + w.number).join(", ")}` : `Error: ${r.data?.error ?? "no se pudo"}`);
    reload();
  }
  async function cancel(id: string) {
    if (!confirm("¿Cancelar este sorteo? Los lingotes gastados vuelven al saldo de cada participante.")) return;
    const r = await adminFetch(`/admin/raffles/${id}/cancel`, { method: "POST" });
    setMsg(r.ok ? `Cancelado. ${r.data.refundedOrders} órdenes con lingotes devueltos al saldo.` : "Error al cancelar");
    reload();
  }
  if (!me) return <p className="py-20 text-center text-slate-400">Cargando…</p>;

  return (
    <div className="mx-auto max-w-5xl px-5 py-10">
      <h1 className="text-2xl font-bold text-slate-900">Panel de administración</h1>
      {msg && <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{msg}</p>}

      <div className="mt-5 flex gap-1 border-b border-slate-200">
        {([["metrics", "Métricas"], ["raffles", "Sorteos"], ["create", "Crear sorteo"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2.5 text-sm font-semibold ${tab === k ? "border-b-2 border-emerald-500 text-slate-900" : "text-slate-500"}`}>{l}</button>
        ))}
      </div>

      {tab === "metrics" && <Metrics m={metrics} />}

      {tab === "raffles" && (
        <div className="mt-6 space-y-3">
          {raffles.map((r) => (
            <RaffleRow key={r.id} r={r} onDraw={draw} onCancel={cancel} onChanged={reload} setMsg={setMsg} />
          ))}
          {raffles.length === 0 && <p className="text-slate-400">No hay sorteos.</p>}
        </div>
      )}

      {tab === "create" && <CreateRaffle onCreated={() => { setMsg("Sorteo creado"); setTab("raffles"); reload(); }} />}
    </div>
  );
}

function Card({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-2 text-slate-400"><Icon name={icon} className="h-4 w-4" /><span className="text-xs font-medium">{label}</span></div>
      <div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function Metrics({ m }: { m: any }) {
  if (!m) return <p className="mt-6 text-slate-400">Cargando métricas…</p>;
  const byStatus = m.raffles.byStatus ?? {};
  const statusStr = Object.keys(byStatus).map((k) => `${STATUS_LABEL[k] ?? k}: ${byStatus[k]}`).join(" · ") || "sin sorteos";
  return (
    <div className="mt-6 space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Card icon="cash" label="Ingresos (recargas pagadas)" value={usd(m.money.revenueUsdCents)} sub={`${m.money.topups} recargas`} />
        <Card icon="trophy" label="Premios entregados" value={usd(m.money.prizeAwardedUsdCents)} sub={`${m.raffles.drawn} sorteos realizados`} />
        <Card icon="chart" label="Margen bruto" value={usd(m.money.grossMarginUsdCents)} sub="ingresos - premios entregados" />
        <Card icon="users" label="Usuarios" value={nf(m.users.total)} sub={`${m.users.verified} verificados · +${m.users.new7d} esta semana`} />
        <Card icon="ticket" label="Tickets vendidos" value={nf(m.tickets.sold)} sub={`${m.money.orders} órdenes`} />
        <Card icon="document" label="Sorteos" value={statusStr} />
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Lingote /> Economía de lingotes</h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <div><div className="text-xs text-slate-500">Vendidos (recargas)</div><div className="text-lg font-bold text-slate-900">{nf(m.money.lingotesSold)}</div></div>
          <div><div className="text-xs text-slate-500">Gastados en tickets</div><div className="text-lg font-bold text-slate-900">{nf(m.money.lingotesSpent)}</div></div>
          <div><div className="text-xs text-slate-500">En circulación (saldos)</div><div className="text-lg font-bold text-slate-900">{nf(m.money.lingotesCirculating)}</div></div>
        </div>
      </div>
    </div>
  );
}

function RaffleRow({ r, onDraw, onCancel, onChanged, setMsg }: any) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [closesAt, setClosesAt] = useState("");
  const [savingDate, setSavingDate] = useState(false);
  const locked = r.status === "DRAWN" || r.status === "CANCELLED";

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !detail) {
      const d = await adminFetch(`/admin/raffles/${r.id}/detail`);
      if (d.ok) { setDetail(d.data); setClosesAt(toLocalInput(d.data.raffle.closesAt)); }
    }
  }
  async function saveDate() {
    setSavingDate(true);
    const iso = closesAt ? new Date(closesAt).toISOString() : null;
    const res = await adminFetch(`/admin/raffles/${r.id}`, { method: "PATCH", body: JSON.stringify({ closesAt: iso }) });
    setSavingDate(false);
    setMsg(res.ok ? "Fecha del sorteo actualizada" : `Error: ${res.data?.error ?? "no se pudo"}`);
    if (res.ok) onChanged();
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <div className="font-semibold text-slate-900">{r.title}{r.legacy && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">histórico</span>}</div>
          <div className="text-xs text-slate-500">{STATUS_LABEL[r.status] ?? r.status} · {r._count?.tickets ?? 0}/{r.totalTickets} tickets · mín {r.minTickets} · sorteo {fmt(r.closesAt)}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={toggle} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            <Icon name="chart" className="h-4 w-4" /> {open ? "Ocultar" : "Detalle"}
          </button>
          {!locked && <button onClick={() => onDraw(r.id)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500">Sortear</button>}
          {!locked && <button onClick={() => onCancel(r.id)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>}
          {r.status === "DRAWN" && <a href={`/sorteos/${r.slug}/show`} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Ver show</a>}
        </div>
      </div>

      {open && (
        <div className="border-t border-slate-100 p-4">
          {!detail ? <p className="text-sm text-slate-400">Cargando…</p> : (
            <>
              {!locked && (
                <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg bg-slate-50 p-3">
                  <div>
                    <label className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-600"><Icon name="clock" className="h-3.5 w-3.5" /> Fecha y hora del sorteo</label>
                    <input type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  </div>
                  <button onClick={saveDate} disabled={savingDate} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:bg-slate-400">{savingDate ? "Guardando…" : "Guardar fecha"}</button>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-4">
                <Mini label="Tickets" value={`${detail.metrics.soldTickets}/${detail.raffle.totalTickets}`} sub={`${detail.metrics.fillPct}% · ${detail.metrics.reachedMin ? "mínimo alcanzado" : "bajo el mínimo"}`} />
                <Mini label="Compradores" value={nf(detail.metrics.uniqueBuyers)} sub={`${detail.metrics.orders} órdenes`} />
                <Mini label="Ingreso (tickets)" value={usd(detail.metrics.revenueUsdCents)} sub={`${nf(detail.metrics.revenueLingotes)} lingotes`} />
                <Mini label="Rentabilidad" value={usd(detail.metrics.profitUsdCents)} sub={`premio ${usd(detail.metrics.prizeCostUsdCents)}`} />
              </div>

              <h4 className="mt-5 mb-2 text-sm font-semibold text-slate-900">Participantes</h4>
              {detail.participants.length === 0 ? <p className="text-sm text-slate-400">Nadie ha comprado todavía.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs text-slate-400">
                      <tr>
                        <th className="py-1.5 pr-3">Usuario</th>
                        <th className="py-1.5 pr-3">País</th>
                        <th className="py-1.5 pr-3">Cuenta</th>
                        <th className="py-1.5 pr-3">Tickets</th>
                        <th className="py-1.5 pr-3">Gastó</th>
                        <th className="py-1.5 pr-3">Saldo</th>
                        <th className="py-1.5 pr-3">Compró</th>
                        <th className="py-1.5">Comentario</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.participants.map((p: any) => (
                        <tr key={p.userId} className="border-t border-slate-100 align-top">
                          <td className="py-2 pr-3"><div className="font-medium text-slate-800">{p.nickname || "—"}</div><div className="text-xs text-slate-400">{p.email}</div></td>
                          <td className="py-2 pr-3 text-slate-600">{p.country || "—"}</td>
                          <td className="py-2 pr-3 text-slate-600">{accountAge(p.accountCreatedAt)}</td>
                          <td className="py-2 pr-3 font-semibold text-slate-800">{p.tickets}</td>
                          <td className="py-2 pr-3 text-slate-600">{nf(p.lingotesSpent)}</td>
                          <td className="py-2 pr-3 text-slate-600">{nf(p.balance)}</td>
                          <td className="py-2 pr-3 text-xs text-slate-500">{fmt(p.firstBoughtAt)}</td>
                          <td className="py-2 text-xs italic text-slate-500">{p.comments?.length ? p.comments.map((c: string, i: number) => <div key={i}>“{c}”</div>) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Mini({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-bold text-slate-900">{value}</div>
      {sub && <div className="text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

function CreateRaffle({ onCreated }: { onCreated: () => void }) {
  // Default draw time: 48h from now, in local time for the datetime picker.
  const [f, setF] = useState<any>({
    slug: "", title: "", description: "", prizeUsd: 500, ticketPrice: 10, totalTickets: 200,
    minTickets: 50, winnersCount: 1, games: ["ELIMINATION", "DIGIT_REVEAL", "SQUID", "HORSE_RACE", "BOMBS"], finale: "BOMBS",
    image: "https://picsum.photos/seed/new/900/600", closesAt: toLocalInput(new Date(Date.now() + 48 * 3600000).toISOString()),
  });
  const [err, setErr] = useState("");
  function toggleGame(g: string) {
    setF((s: any) => ({ ...s, games: s.games.includes(g) ? s.games.filter((x: string) => x !== g) : [...s.games, g] }));
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    if (!f.closesAt) { setErr("Elige la fecha y hora del sorteo."); return; }
    const body = {
      slug: f.slug, title: f.title, description: f.description, images: [f.image],
      prizeValue: Math.round(f.prizeUsd * 100), ticketPrice: Number(f.ticketPrice),
      totalTickets: Number(f.totalTickets), minTickets: Number(f.minTickets),
      winnersCount: Number(f.winnersCount), games: f.games, finale: f.finale,
      closesAt: new Date(f.closesAt).toISOString(),
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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div><label className="text-xs text-slate-500">Valor USD</label><input type="number" className={inp} value={f.prizeUsd} onChange={(e) => setF({ ...f, prizeUsd: e.target.value })} /></div>
        <div><label className="text-xs text-slate-500">Precio (lingotes)</label><input type="number" className={inp} value={f.ticketPrice} onChange={(e) => setF({ ...f, ticketPrice: e.target.value })} /></div>
        <div><label className="text-xs text-slate-500"># Ganadores</label><input type="number" className={inp} value={f.winnersCount} onChange={(e) => setF({ ...f, winnersCount: e.target.value })} /></div>
        <div><label className="text-xs text-slate-500">Total tickets</label><input type="number" className={inp} value={f.totalTickets} onChange={(e) => setF({ ...f, totalTickets: e.target.value })} /></div>
        <div><label className="text-xs text-slate-500">Mín. tickets</label><input type="number" className={inp} value={f.minTickets} onChange={(e) => setF({ ...f, minTickets: e.target.value })} /></div>
        <div>
          <label className="flex items-center gap-1 text-xs text-slate-500"><Icon name="clock" className="h-3.5 w-3.5" /> Fecha y hora del sorteo</label>
          <input type="datetime-local" required className={inp} value={f.closesAt} onChange={(e) => setF({ ...f, closesAt: e.target.value })} />
        </div>
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
