import { useEffect, useState } from "react";
import Lingote from "./Lingote";
import Icon from "./Icon";
import ImageUpload from "./ImageUpload";
import Skeleton from "./Skeleton";

const GAMES = ["ROCKETS", "BOMBS", "ROULETTE"];

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
  const [tab, setTab] = useState<"metrics" | "growth" | "purchases" | "recharges" | "users" | "raffles" | "winners" | "create">("metrics");
  const [raffles, setRaffles] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any>(null);
  const [growth, setGrowth] = useState<any>(null);
  const [purchases, setPurchases] = useState<any>(null);
  const [pendingTopups, setPendingTopups] = useState<any[] | null>(null);
  const [users, setUsers] = useState<any[] | null>(null);
  const [winners, setWinners] = useState<any[] | null>(null);
  const [msg, setMsg] = useState("");

  function reload() {
    adminFetch("/admin/raffles").then((r) => r.ok && setRaffles(r.data));
    adminFetch("/admin/metrics").then((r) => r.ok && setMetrics(r.data));
    adminFetch("/admin/growth").then((r) => r.ok && setGrowth(r.data));
    adminFetch("/admin/purchases").then((r) => r.ok && setPurchases(r.data));
    adminFetch("/admin/topups?status=PENDING").then((r) => r.ok && setPendingTopups(r.data));
    adminFetch("/admin/users").then((r) => r.ok && setUsers(r.data));
    adminFetch("/admin/winners").then((r) => r.ok && setWinners(r.data));
  }
  async function setPrizeStatus(id: string, prizeStatus: string) {
    const res = await adminFetch(`/admin/winners/${id}`, { method: "PATCH", body: JSON.stringify({ prizeStatus }) });
    if (res.ok) adminFetch("/admin/winners").then((r) => r.ok && setWinners(r.data));
    else setMsg(`Error: ${res.data?.error ?? "no se pudo"}`);
  }
  async function notifyWinners() {
    const dry = await adminFetch("/admin/winners/notify?dryRun=1", { method: "POST" });
    if (!dry.ok) { setMsg(`Error: ${dry.data?.error ?? "no se pudo"}`); return; }
    const n = dry.data?.count ?? 0;
    if (n === 0) { setMsg("No hay ganadores pendientes de notificar."); return; }
    if (!confirm(`Se enviará el correo de premio (con código de canje) a ${n} ganador(es) que aún no han sido notificados. ¿Continuar?`)) return;
    setMsg("Enviando correos...");
    const res = await adminFetch("/admin/winners/notify", { method: "POST" });
    setMsg(res.ok ? `Correos enviados: ${res.data.sent}` : `Error: ${res.data?.error ?? "no se pudo"}`);
    adminFetch("/admin/winners").then((r) => r.ok && setWinners(r.data));
  }
  async function confirmTopup(id: string) {
    if (!confirm("¿Confirmar esta recarga? Se acreditarán los lingotes al usuario y se le enviará el correo de aprobación. Verifica primero que el pago llegó.")) return;
    const res = await adminFetch(`/admin/topups/${id}/confirm`, { method: "POST" });
    setMsg(res.ok ? (res.data.credited ? "Recarga confirmada y lingotes acreditados." : "Ya estaba acreditada.") : `Error: ${res.data?.error ?? "no se pudo"}`);
    adminFetch("/admin/topups?status=PENDING").then((r) => r.ok && setPendingTopups(r.data));
  }
  async function rejectTopup(id: string) {
    if (!confirm("¿Rechazar esta recarga? Quedará marcada como fallida.")) return;
    const res = await adminFetch(`/admin/topups/${id}/reject`, { method: "POST" });
    setMsg(res.ok ? "Recarga rechazada." : `Error: ${res.data?.error ?? "no se pudo"}`);
    adminFetch("/admin/topups?status=PENDING").then((r) => r.ok && setPendingTopups(r.data));
  }
  async function toggleUserFlag(id: string, patch: any) {
    const res = await adminFetch(`/admin/users/${id}/flags`, { method: "POST", body: JSON.stringify(patch) });
    if (res.ok) adminFetch("/admin/users").then((r) => r.ok && setUsers(r.data));
    else setMsg(`Error: ${res.data?.error ?? "no se pudo"}`);
  }
  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!d?.user) { window.location.href = "/entrar"; return; }
      if (d.user.role !== "ADMIN") { window.location.href = "/"; return; }
      setMe(d.user); reload();
    });
  }, []);

  async function draw(id: string) {
    if (!confirm("¿Sortear AHORA? Esto cierra la venta, ejecuta el sorteo y publica el resultado. No se puede deshacer.")) return;
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
  if (!me)
    return (
      <div className="mx-auto max-w-5xl px-5 py-10">
        <Skeleton className="h-8 w-64" />
        <div className="mt-6 flex gap-4 border-b border-slate-200 pb-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-4 w-24" />)}
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}
        </div>
      </div>
    );

  return (
    <div className="mx-auto max-w-5xl px-5 py-10">
      <h1 className="text-2xl font-bold text-slate-900">Panel de administración</h1>
      {msg && <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{msg}</p>}

      <div className="mt-5 flex gap-1 overflow-x-auto border-b border-slate-200">
        {([["metrics", "Métricas"], ["growth", "Crecimiento"], ["purchases", "Compras"], ["recharges", pendingTopups && pendingTopups.length ? `Recargas (${pendingTopups.length})` : "Recargas"], ["users", "Usuarios"], ["raffles", "Sorteos"], ["winners", "Ganadores"], ["create", "Crear sorteo"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`shrink-0 whitespace-nowrap px-4 py-2.5 text-sm font-semibold transition ${tab === k ? "border-b-2 border-emerald-500 text-slate-900" : "text-slate-500 hover:text-slate-700"}`}>{l}</button>
        ))}
      </div>

      {tab === "metrics" && <Metrics m={metrics} />}

      {tab === "growth" && <Growth g={growth} />}

      {tab === "recharges" && <Recharges topups={pendingTopups} onConfirm={confirmTopup} onReject={rejectTopup} />}

      {tab === "purchases" && <Purchases p={purchases} />}

      {tab === "users" && <Users users={users} onToggle={toggleUserFlag} />}

      {tab === "raffles" && (
        <div className="mt-6 space-y-3">
          {raffles.map((r) => (
            <RaffleRow key={r.id} r={r} onDraw={draw} onCancel={cancel} onChanged={reload} setMsg={setMsg} />
          ))}
          {raffles.length === 0 && <p className="text-slate-400">No hay sorteos.</p>}
        </div>
      )}

      {tab === "winners" && <WinnersPanel winners={winners} onStatus={setPrizeStatus} onNotify={notifyWinners} />}

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

const CUR_SYM: Record<string, string> = { PEN: "S/ ", USD: "$", MXN: "MX$", COP: "COL$", CLP: "CLP$", ARS: "AR$" };
const money = (cur: string | null, minor: number | null) =>
  minor == null ? "-" : `${CUR_SYM[cur ?? ""] ?? (cur ? cur + " " : "")}${(minor / 100).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pctFmt = (p: number | null) => (p == null ? "-" : (p * 100).toFixed(2) + "%");
const METHOD: Record<string, string> = { MERCADOPAGO: "MercadoPago", PAYPAL: "PayPal", YAPE: "Yape", PLIN: "Plin", TRANSFER: "Transferencia", CRYPTO: "Cripto" };
const PSTATUS: Record<string, string> = { PAID: "Pagado", PENDING: "Pendiente", FAILED: "Fallido", REFUNDED: "Reembolsado" };

function Growth({ g }: { g: any }) {
  if (!g) return <p className="mt-6 text-slate-400">Cargando crecimiento…</p>;
  const pct = (n: number) => (n * 100).toFixed(n < 0.1 ? 1 : 0) + "%";
  const days: { date: string; count: number }[] = g.newUsersByDay ?? [];
  const max = Math.max(1, ...days.map((d) => d.count));
  return (
    <div className="mt-6 space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card icon="users" label="Usuarios totales" value={nf(g.totalUsers)} sub={`+${nf(g.newLast30)} en 30 días`} />
        <Card icon="ticket" label="Compraron ticket" value={nf(g.buyers)} sub={`${pct(g.totalUsers ? g.buyers / g.totalUsers : 0)} de los registrados`} />
        <Card icon="cash" label="Recargaron (pagaron)" value={nf(g.rechargers)} sub={`${pct(g.conv.registeredToRecharged)} de conversión`} />
        <Card icon="chart" label="Recargaron 2+ veces" value={nf(g.repeatRechargers)} sub={`${pct(g.conv.rechargedToRepeat)} de los que recargaron`} />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-slate-900">Usuarios nuevos por día (30 días)</h3>
        <div className="mt-4 flex h-32 items-end gap-[3px]">
          {days.map((d) => (
            <div key={d.date} className="group relative flex-1" title={`${d.date}: ${d.count}`}>
              <div className="w-full rounded-t bg-emerald-400 transition group-hover:bg-emerald-600" style={{ height: `${Math.max(2, (d.count / max) * 100)}%` }} />
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-slate-400">
          <span>{days[0]?.date.slice(5)}</span>
          <span>hoy</span>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-slate-900">Embudo</h3>
        <p className="mt-1 text-xs text-slate-500">Lo que hace rentable un sorteo gancho no es cuánta gente entra, sino cuántos vuelven a recargar.</p>
        <div className="mt-4 space-y-2">
          {[
            { label: "Registrados", n: g.totalUsers, base: g.totalUsers, color: "bg-slate-300" },
            { label: "Compraron al menos un ticket", n: g.buyers, base: g.totalUsers, color: "bg-emerald-300" },
            { label: "Recargaron dinero real", n: g.rechargers, base: g.totalUsers, color: "bg-emerald-500" },
            { label: "Recargaron 2 o más veces (recompra)", n: g.repeatRechargers, base: g.totalUsers, color: "bg-emerald-700" },
          ].map((row) => (
            <div key={row.label}>
              <div className="flex justify-between text-xs"><span className="text-slate-600">{row.label}</span><span className="font-semibold text-slate-900">{nf(row.n)}</span></div>
              <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full rounded-full ${row.color}`} style={{ width: `${row.base ? Math.max(2, (row.n / row.base) * 100) : 0}%` }} />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-slate-500">Ingresos por recargas (histórico): <strong className="text-slate-800">${nf(Math.round(g.revenueUsd))}</strong></p>
      </div>
    </div>
  );
}

function Recharges({ topups, onConfirm, onReject }: { topups: any[] | null; onConfirm: (id: string) => void; onReject: (id: string) => void }) {
  if (!topups) return <p className="mt-6 text-slate-400">Cargando recargas…</p>;
  const MANUAL = ["CRYPTO", "YAPE", "PLIN", "TRANSFER"];
  const manual = topups.filter((t) => MANUAL.includes(t.method));
  const auto = topups.filter((t) => !MANUAL.includes(t.method));
  const label = (m: string) => (m === "CRYPTO" ? "Binance / USDT" : (METHOD[m] ?? m));
  const isLink = (s: string) => /^https?:\/\//i.test(s);
  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-slate-900">Recargas manuales por confirmar</h3>
        <p className="mt-1 text-xs text-slate-500">Verifica que el pago llegó a tu cuenta antes de confirmar. Al confirmar se acreditan los lingotes y se envía el correo de aprobación.</p>
        {manual.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">No hay recargas manuales pendientes.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {manual.map((t) => (
              <li key={t.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">{label(t.method)}</span>
                    <span className="ml-2 text-sm font-bold text-slate-900">${(t.amountUsd / 100).toFixed(2)}</span>
                    <span className="ml-1 text-sm text-slate-500">→ {nf(t.lingotes)} lingotes</span>
                  </div>
                  <span className="text-xs text-slate-400">{new Date(t.createdAt).toLocaleString("es-PE")}</span>
                </div>
                <div className="mt-1 text-xs text-slate-500">{t.user?.nickname || "Usuario"} · {t.user?.email}</div>
                <div className="mt-2 text-xs">
                  <span className="text-slate-400">Comprobante: </span>
                  {t.proofUrl
                    ? (isLink(t.proofUrl)
                        ? <a href={t.proofUrl} target="_blank" rel="noreferrer" className="font-medium text-emerald-700 hover:underline">ver comprobante</a>
                        : <span className="break-all font-mono text-slate-700">{t.proofUrl}</span>)
                    : <span className="text-red-500">sin comprobante aún</span>}
                </div>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => onConfirm(t.id)} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">
                    <Icon name="check" className="h-4 w-4" /> Confirmar y acreditar
                  </button>
                  <button onClick={() => onReject(t.id)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Rechazar</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {auto.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-slate-900">Pendientes automáticas (MercadoPago / PayPal)</h3>
          <p className="mt-1 text-xs text-slate-500">Estas se acreditan solas al confirmarse el pago. Si quedan pendientes suele ser un pago abandonado; no se confirman a mano.</p>
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {auto.map((t) => (
              <li key={t.id} className="flex justify-between py-2">
                <span className="text-slate-600">{label(t.method)} · {t.user?.email}</span>
                <span className="text-slate-400">${(t.amountUsd / 100).toFixed(2)} · {new Date(t.createdAt).toLocaleDateString("es-PE")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Purchases({ p }: { p: any }) {
  if (!p) return <p className="mt-6 text-slate-400">Cargando compras…</p>;
  const t = p.totals;
  return (
    <div className="mt-6 space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card icon="cash" label="Ingresos brutos" value={usd(t.grossUsd)} sub={`${t.count} compras`} />
        <Card icon="chart" label="Comisión pasarela" value={usd(t.feeUsd)} sub={t.avgFeePct != null ? `~${(t.avgFeePct * 100).toFixed(2)}% promedio` : "sin datos"} />
        <Card icon="trophy" label="Neto recibido" value={usd(t.netUsd)} sub="después de comisión" />
        <Card icon="ticket" label="Lingotes vendidos" value={nf(t.lingotes)} sub="en compras pagadas" />
      </div>
      {t.missingFee > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {t.missingFee} compra(s) pagada(s) aún sin desglose de comisión (se completan solo al leer del proveedor; recarga en unos segundos).
        </p>
      )}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 text-xs text-slate-400">
            <tr>
              <th className="p-3">Fecha</th>
              <th className="p-3">Usuario</th>
              <th className="p-3">Método</th>
              <th className="p-3 text-right">Pagó (bruto)</th>
              <th className="p-3 text-right">Comisión</th>
              <th className="p-3 text-right">Neto</th>
              <th className="p-3 text-right">Lingotes</th>
              <th className="p-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {p.purchases.map((r: any) => (
              <tr key={r.id} className="border-b border-slate-50 last:border-0">
                <td className="p-3 text-xs text-slate-500">{fmt(r.confirmedAt || r.createdAt)}</td>
                <td className="p-3"><div className="font-medium text-slate-800">{r.user?.nickname || "-"}</div><div className="text-xs text-slate-400">{r.user?.email}</div></td>
                <td className="p-3 text-slate-600">{METHOD[r.method] ?? r.method}</td>
                <td className="p-3 text-right">
                  <div className="font-medium text-slate-800">{r.grossAmount != null ? money(r.chargeCurrency, r.grossAmount) : usd(r.amountUsd)}</div>
                  {r.grossAmount != null && <div className="text-xs text-slate-400">{usd(r.amountUsd)}</div>}
                </td>
                <td className="p-3 text-right">
                  {r.feeAmount != null ? (
                    <><div className="font-medium text-red-600">-{money(r.chargeCurrency, r.feeAmount)}</div><div className="text-xs text-slate-400">{pctFmt(r.feePct)}</div></>
                  ) : <span className="text-slate-300">-</span>}
                </td>
                <td className="p-3 text-right font-medium text-emerald-700">{r.netAmount != null ? money(r.chargeCurrency, r.netAmount) : "-"}</td>
                <td className="p-3 text-right text-slate-700">{nf(r.lingotes)}</td>
                <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.status === "PAID" ? "bg-emerald-100 text-emerald-700" : r.status === "PENDING" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>{PSTATUS[r.status] ?? r.status}</span></td>
              </tr>
            ))}
            {p.purchases.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-slate-400">Aún no hay compras.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="flex items-center gap-1.5 text-xs">
      <span className={`relative h-5 w-9 rounded-full transition ${on ? "bg-emerald-500" : "bg-slate-300"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
      </span>
      <span className={on ? "font-medium text-slate-700" : "text-slate-400"}>{label}</span>
    </button>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><div className="text-slate-400">{label}</div><div className="font-medium text-slate-700">{value}</div></div>;
}

function UserRow({ u, onToggle }: { u: any; onToggle: (id: string, patch: any) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 p-3">
        <button onClick={() => setOpen((o) => !o)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          {u.avatarUrl
            ? <img src={u.avatarUrl} className="h-9 w-9 shrink-0 rounded-full object-cover" alt="" />
            : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-bold text-slate-500">{(u.nickname || u.email)[0].toUpperCase()}</span>}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 font-medium text-slate-800">
              <span className="truncate">{u.nickname || "sin apodo"}</span>
              {u.role === "ADMIN" && <span className="rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-white">ADMIN</span>}
              {u.emailVerified ? <Icon name="check-circle" className="h-3.5 w-3.5 text-emerald-600" /> : <Icon name="info" className="h-3.5 w-3.5 text-amber-500" />}
            </div>
            <div className="truncate text-xs text-slate-400">{u.email}</div>
          </div>
        </button>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          <span title="Antigüedad de la cuenta">{accountAge(u.createdAt)}</span>
          <span className="inline-flex items-center gap-1" title="Tickets"><img src="/ticket.png" className="h-3 w-3" alt="" />{u.ticketsOwned}</span>
          <span className="inline-flex items-center gap-1" title="Saldo"><Lingote />{nf(u.balance)}</span>
          <span title="Total recargado">{usd(u.spentUsd)}</span>
        </div>
        <div className="flex items-center gap-3">
          <Toggle on={u.canChat} onChange={(v) => onToggle(u.id, { canChat: v })} label="Chat" />
          <Toggle on={u.canBuy} onChange={(v) => onToggle(u.id, { canBuy: v })} label="Comprar" />
        </div>
      </div>
      {open && (
        <div className="grid gap-3 border-t border-slate-100 p-3 text-xs sm:grid-cols-3 lg:grid-cols-4">
          <Detail label="País" value={u.country || "-"} />
          <Detail label="Registrado" value={fmt(u.createdAt)} />
          <Detail label="Compras / intentos" value={`${u.orders} / ${u.buyAttempts}`} />
          <Detail label="Tickets" value={String(u.ticketsOwned)} />
          <Detail label="Lingotes gastados" value={nf(u.lingotesSpent)} />
          <Detail label="Saldo lingotes" value={nf(u.balance)} />
          <Detail label="Recargas" value={`${u.topupCount} · ${usd(u.spentUsd)}`} />
          <Detail label="Medios de pago" value={u.methods?.length ? u.methods.map((m: string) => METHOD[m] ?? m).join(", ") : "-"} />
          <Detail label="Referidos" value={String(u.referralsCount)} />
          <Detail label="Código referido" value={u.referralCode} />
          <Detail label="Correo verificado" value={u.emailVerified ? "sí" : "no"} />
          <Detail label="Rol" value={u.role} />
        </div>
      )}
    </div>
  );
}

function Users({ users, onToggle }: { users: any[] | null; onToggle: (id: string, patch: any) => void }) {
  if (!users) return <p className="mt-6 text-slate-400">Cargando usuarios…</p>;
  return (
    <div className="mt-6">
      <p className="mb-3 text-xs text-slate-400">{users.length} usuarios · toca una fila para ver el detalle</p>
      <div className="space-y-2">
        {users.map((u) => <UserRow key={u.id} u={u} onToggle={onToggle} />)}
        {users.length === 0 && <p className="text-slate-400">No hay usuarios.</p>}
      </div>
    </div>
  );
}

function RaffleRow({ r, onDraw, onCancel, onChanged, setMsg }: any) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [blockReason, setBlockReason] = useState(r.blockReason ?? "");
  const [blocking, setBlocking] = useState(false);
  const [images, setImages] = useState<string[]>(Array.isArray(r.images) ? r.images : []);
  const [form, setForm] = useState({
    title: r.title ?? "",
    description: r.description ?? "",
    prizeUsd: (r.prizeValue ?? 0) / 100,
    ticketPrice: r.ticketPrice ?? 0,
    totalTickets: r.totalTickets ?? 1,
    minTickets: r.minTickets ?? 1,
    maxPerUser: r.maxTicketsPerUser ?? "",
    winnersCount: r.winnersCount ?? 1,
    closesAt: toLocalInput(r.closesAt),
  });
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));
  const inpS = "mt-0.5 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm";
  const locked = r.status === "DRAWN" || r.status === "CANCELLED";
  const blockHistory: any[] = Array.isArray(r.blockHistory) ? r.blockHistory : [];

  async function toggleBlock(block: boolean) {
    if (block && !blockReason.trim()) { setMsg("Escribe una razón para bloquear el sorteo."); return; }
    setBlocking(true);
    const res = await adminFetch(`/admin/raffles/${r.id}/block`, {
      method: "POST",
      body: JSON.stringify({ blocked: block, reason: block ? blockReason.trim() : undefined }),
    });
    setBlocking(false);
    setMsg(res.ok ? (block ? "Sorteo bloqueado" : "Sorteo reactivado") : `Error: ${res.data?.error ?? "no se pudo"}`);
    if (res.ok) onChanged();
  }

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !detail) {
      const d = await adminFetch(`/admin/raffles/${r.id}/detail`);
      if (d.ok) setDetail(d.data);
    }
  }

  async function saveEdit() {
    if (!form.title.trim()) { setMsg("El título no puede estar vacío."); return; }
    if (images.length === 0) { setMsg("El sorteo necesita al menos una foto."); return; }
    setSaving(true);
    const body: any = {
      title: form.title.trim(),
      description: form.description,
      images,
      prizeValue: Math.round(Number(form.prizeUsd) * 100),
      ticketPrice: Number(form.ticketPrice),
      totalTickets: Number(form.totalTickets),
      minTickets: Number(form.minTickets),
      winnersCount: Number(form.winnersCount),
      closesAt: form.closesAt ? new Date(form.closesAt).toISOString() : null,
    };
    if (form.maxPerUser !== "" && Number(form.maxPerUser) > 0) body.maxTicketsPerUser = Number(form.maxPerUser);
    const res = await adminFetch(`/admin/raffles/${r.id}`, { method: "PATCH", body: JSON.stringify(body) });
    setSaving(false);
    setMsg(res.ok ? "Sorteo actualizado" : `Error: ${res.data?.error ?? "no se pudo"}`);
    if (res.ok) onChanged();
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <div className="font-semibold text-slate-900">{r.title}
            {r.legacy && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">histórico</span>}
            {r.blocked && <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700"><Icon name="lock" className="h-3 w-3" /> bloqueado</span>}
          </div>
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
              {(!locked || r.legacy) && (
                <div className="mb-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{r.legacy ? "Editar sorteo histórico (nombre, descripción y fotos)" : "Editar sorteo"}</div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-500">Título</label>
                    <input value={form.title} onChange={(e) => set("title", e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-500">Descripción</label>
                    <textarea rows={4} value={form.description} onChange={(e) => set("description", e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-500">Fotos</label>
                    <div className="flex flex-wrap items-start gap-2">
                      {images.map((img, i) => (
                        <div key={i} className="relative">
                          <img src={img} className="h-16 w-24 rounded-lg border border-slate-200 object-cover" alt="" />
                          <button type="button" onClick={() => setImages(images.filter((_, j) => j !== i))} className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow" title="Quitar">
                            <Icon name="x" className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                      <div className="w-24">
                        <ImageUpload value="" onChange={(url) => url && setImages((im) => [...im, url])} endpoint="/admin/upload" hint="" />
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">La primera foto es la principal. JPG/PNG/WEBP, máx 6 MB.</p>
                  </div>
                  {!locked && (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <div><label className="text-xs text-slate-500">Valor USD</label><input type="number" value={form.prizeUsd} onChange={(e) => set("prizeUsd", e.target.value)} className={inpS} /></div>
                      <div><label className="text-xs text-slate-500">Precio (lingotes)</label><input type="number" value={form.ticketPrice} onChange={(e) => set("ticketPrice", e.target.value)} className={inpS} /></div>
                      <div><label className="text-xs text-slate-500"># Ganadores</label><input type="number" value={form.winnersCount} onChange={(e) => set("winnersCount", e.target.value)} className={inpS} /></div>
                      <div><label className="text-xs text-slate-500">Total tickets</label><input type="number" value={form.totalTickets} onChange={(e) => set("totalTickets", e.target.value)} className={inpS} /></div>
                      <div><label className="text-xs text-slate-500">Mín. tickets</label><input type="number" value={form.minTickets} onChange={(e) => set("minTickets", e.target.value)} className={inpS} /></div>
                      <div><label className="text-xs text-slate-500">Máx. por persona</label><input type="number" value={form.maxPerUser} onChange={(e) => set("maxPerUser", e.target.value)} placeholder="sin límite" className={inpS} /></div>
                      <div className="col-span-2 sm:col-span-3"><label className="flex items-center gap-1 text-xs text-slate-500"><Icon name="clock" className="h-3.5 w-3.5" /> Fecha y hora del sorteo</label><input type="datetime-local" value={form.closesAt} onChange={(e) => set("closesAt", e.target.value)} className={inpS} /></div>
                    </div>
                  )}
                  <button onClick={saveEdit} disabled={saving} className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:bg-slate-400">{saving ? "Guardando…" : "Guardar cambios"}</button>
                </div>
              )}

              {/* Block switch */}
              <div className={`mb-4 rounded-lg border p-3 ${r.blocked ? "border-red-200 bg-red-50" : "border-slate-200 bg-slate-50"}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Icon name="lock" className={`h-4 w-4 ${r.blocked ? "text-red-600" : "text-slate-500"}`} />
                    <span className="text-sm font-semibold text-slate-800">{r.blocked ? "Sorteo bloqueado" : "Bloquear sorteo"}</span>
                  </div>
                  <button
                    type="button" role="switch" aria-checked={r.blocked} disabled={blocking}
                    onClick={() => toggleBlock(!r.blocked)}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition ${r.blocked ? "bg-red-500" : "bg-slate-300"} disabled:opacity-50`}
                  >
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${r.blocked ? "left-[22px]" : "left-0.5"}`} />
                  </button>
                </div>
                {r.blocked ? (
                  <p className="mt-2 text-sm text-red-700"><span className="font-medium">Razón:</span> {r.blockReason || "-"}</p>
                ) : (
                  <input
                    value={blockReason} onChange={(e) => setBlockReason(e.target.value)}
                    placeholder="Razón del bloqueo (obligatoria)"
                    className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                )}
                {blockHistory.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-medium text-slate-500">Historial de bloqueos ({blockHistory.length})</summary>
                    <ul className="mt-2 space-y-1">
                      {blockHistory.slice().reverse().map((h, i) => (
                        <li key={i} className="text-xs text-slate-500">
                          <span className={h.action === "block" ? "font-semibold text-red-600" : "font-semibold text-emerald-700"}>{h.action === "block" ? "Bloqueado" : "Reactivado"}</span>
                          {" · "}{fmt(h.at)}{h.reason ? ` · ${h.reason}` : ""}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>

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
                          <td className="py-2 pr-3"><div className="font-medium text-slate-800">{p.nickname || "-"}</div><div className="text-xs text-slate-400">{p.email}</div></td>
                          <td className="py-2 pr-3 text-slate-600">{p.country || "-"}</td>
                          <td className="py-2 pr-3 text-slate-600">{accountAge(p.accountCreatedAt)}</td>
                          <td className="py-2 pr-3 font-semibold text-slate-800">{p.tickets}</td>
                          <td className="py-2 pr-3 text-slate-600">{nf(p.lingotesSpent)}</td>
                          <td className="py-2 pr-3 text-slate-600">{nf(p.balance)}</td>
                          <td className="py-2 pr-3 text-xs text-slate-500">{fmt(p.firstBoughtAt)}</td>
                          <td className="py-2 text-xs italic text-slate-500">{p.comments?.length ? p.comments.map((c: string, i: number) => <div key={i}>“{c}”</div>) : "-"}</td>
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
    minTickets: 50, winnersCount: 1, maxPerUser: "", games: ["ROCKETS", "BOMBS", "ROULETTE"], finale: "ROULETTE",
    image: "", closesAt: toLocalInput(new Date(Date.now() + 48 * 3600000).toISOString()),
  });
  const [err, setErr] = useState("");
  function toggleGame(g: string) {
    setF((s: any) => {
      const games = s.games.includes(g) ? s.games.filter((x: string) => x !== g) : [...s.games, g];
      // If the current finale was deselected, fall back to the last remaining game.
      const finale = games.includes(s.finale) ? s.finale : (games[games.length - 1] ?? "");
      return { ...s, games, finale };
    });
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    if (!f.image) { setErr("Sube una imagen para el sorteo."); return; }
    if (!f.closesAt) { setErr("Elige la fecha y hora del sorteo."); return; }
    if (f.games.length === 0) { setErr("Elige al menos un juego para el show."); return; }
    const body = {
      slug: f.slug, title: f.title, description: f.description, images: [f.image],
      prizeValue: Math.round(f.prizeUsd * 100), ticketPrice: Number(f.ticketPrice),
      totalTickets: Number(f.totalTickets), minTickets: Number(f.minTickets),
      winnersCount: Number(f.winnersCount), games: f.games, finale: f.finale,
      closesAt: new Date(f.closesAt).toISOString(),
      ...(f.maxPerUser !== "" && Number(f.maxPerUser) > 0 ? { maxTicketsPerUser: Number(f.maxPerUser) } : {}),
    };
    const r = await adminFetch("/admin/raffles", { method: "POST", body: JSON.stringify(body) });
    if (r.ok) { onCreated(); return; }
    const ERRS: Record<string, string> = {
      invalid_slug: "Slug inválido: usa solo minúsculas, números y guiones (ej. ps5-octubre).",
      slug_taken: "Ya existe un sorteo con ese slug.",
      finale_not_in_games: "El juego final debe estar entre los juegos elegidos.",
    };
    setErr(ERRS[r.data?.error] ?? `Error: ${r.data?.error ?? JSON.stringify(r.data)}`);
  }
  const inp = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm";
  return (
    <form onSubmit={submit} className="mt-6 space-y-3 rounded-xl border border-slate-200 bg-white p-5">
      <div className="grid grid-cols-2 gap-3">
        <div><label className="text-xs text-slate-500">Slug</label><input required className={inp} value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} /></div>
        <div><label className="text-xs text-slate-500">Título</label><input required className={inp} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
      </div>
      <div><label className="text-xs text-slate-500">Descripción</label><textarea required className={inp} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
      <ImageUpload label="Imagen del sorteo" value={f.image} onChange={(url) => setF({ ...f, image: url })} endpoint="/admin/upload" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div><label className="text-xs text-slate-500">Valor USD</label><input type="number" className={inp} value={f.prizeUsd} onChange={(e) => setF({ ...f, prizeUsd: e.target.value })} /></div>
        <div><label className="text-xs text-slate-500">Precio (lingotes)</label><input type="number" className={inp} value={f.ticketPrice} onChange={(e) => setF({ ...f, ticketPrice: e.target.value })} /></div>
        <div><label className="text-xs text-slate-500"># Ganadores</label><input type="number" className={inp} value={f.winnersCount} onChange={(e) => setF({ ...f, winnersCount: e.target.value })} /></div>
        <div><label className="text-xs text-slate-500">Total tickets</label><input type="number" className={inp} value={f.totalTickets} onChange={(e) => setF({ ...f, totalTickets: e.target.value })} /></div>
        <div><label className="text-xs text-slate-500">Mín. tickets</label><input type="number" className={inp} value={f.minTickets} onChange={(e) => setF({ ...f, minTickets: e.target.value })} /></div>
        <div><label className="text-xs text-slate-500">Máx. tickets por persona</label><input type="number" className={inp} value={f.maxPerUser} placeholder="sin límite" onChange={(e) => setF({ ...f, maxPerUser: e.target.value })} /></div>
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

const fmtD = (iso: string | null) => (iso ? new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "-");

function RevealCode({ code }: { code: string | null }) {
  const [show, setShow] = useState(false);
  if (!code) return <span className="text-xs text-slate-400">-</span>;
  return (
    <button onClick={() => setShow((s) => !s)} title="Mostrar/ocultar" className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2 py-1 font-mono text-xs font-bold tracking-wider text-emerald-300 hover:bg-slate-800">
      <Icon name={show ? "eye-off" : "eye"} className="h-3.5 w-3.5" />
      {show ? code : "QORI-****-****"}
    </button>
  );
}

function WinnersPanel({ winners, onStatus, onNotify }: { winners: any[] | null; onStatus: (id: string, s: string) => void; onNotify: () => void }) {
  const [q, setQ] = useState("");
  if (!winners) return <div className="mt-6 space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>;
  const pending = winners.filter((w) => w.email && !w.notifiedAt && !w.raffle?.legacy).length;
  const qn = q.trim().toUpperCase();
  // Exact code match = the "redeem" flow (winner pastes their code on Discord).
  const match = qn.startsWith("QORI-") ? winners.find((w) => (w.claimCode || "").toUpperCase() === qn) : null;
  const shown = qn ? winners.filter((w) => [w.claimCode || "", w.raffle?.title || "", w.name || "", w.email || ""].some((s: string) => s.toUpperCase().includes(qn))) : winners;
  return (
    <div className="mt-6">
      {/* Canjear por código: pega el código que te mandan por Discord */}
      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
        <label className="text-sm font-semibold text-slate-800">Canjear premio por código</label>
        <p className="mb-2 text-xs text-slate-500">Pega el código que te envía el ganador por Discord para ver su premio y marcarlo como entregado.</p>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="QORI-XXXX-XXXX"
          className="w-full rounded-lg border border-slate-200 px-3 py-2.5 font-mono text-sm uppercase tracking-wider"
        />
        {qn.startsWith("QORI-") && !match && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">No se encontró ningún ganador con ese código. Verifica que esté bien escrito.</p>
        )}
        {match && (
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-lg font-bold text-slate-900">{match.raffle?.title}</div>
                <div className="text-sm text-slate-600">
                  {match.raffle?.prizeValue > 0 ? `Premio: valor aprox. ${usd(match.raffle.prizeValue)} · ` : ""}Ticket #{match.ticketNumber}
                </div>
                <div className="mt-1 text-sm text-slate-600">Ganador: <strong>{match.name ?? "sin cuenta"}</strong>{match.email ? ` · ${match.email}` : ""}{match.username ? ` · @${match.username}` : ""}</div>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${match.prizeStatus === "DELIVERED" ? "bg-emerald-200 text-emerald-800" : "bg-amber-100 text-amber-700"}`}>
                {match.prizeStatus === "DELIVERED" ? "Entregado" : "Por entregar"}
              </span>
            </div>
            <div className="mt-3">
              {match.prizeStatus === "DELIVERED" ? (
                <button onClick={() => onStatus(match.id, "PENDING")} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-white">Revertir a pendiente</button>
              ) : (
                <button onClick={() => onStatus(match.id, "DELIVERED")} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500">
                  <Icon name="check" className="h-4 w-4" /> Marcar como entregado
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{winners.length} ganador(es){pending > 0 ? ` · ${pending} sin notificar` : ""}{qn ? ` · ${shown.length} en la búsqueda` : ""}</p>
        <button onClick={onNotify} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700">
          <Icon name="bell" className="h-4 w-4" /> Notificar pendientes
        </button>
      </div>
      {winners.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 p-10 text-center text-slate-400">Aún no hay ganadores.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs text-slate-400">
              <tr><th className="p-3">Sorteo</th><th className="p-3">Ganador</th><th className="p-3">Ticket</th><th className="p-3">Valor</th><th className="p-3">Código</th><th className="p-3">Notificado</th><th className="p-3">Estado</th></tr>
            </thead>
            <tbody>
              {shown.map((w) => (
                <tr key={w.id} className="border-t border-slate-100 align-middle">
                  <td className="p-3"><a href={`/sorteos/${w.raffle?.slug}`} className="font-semibold text-slate-800 hover:underline">{w.raffle?.title}</a></td>
                  <td className="p-3"><div className="font-medium text-slate-800">{w.name ?? "-"}</div><div className="text-xs text-slate-400">{w.email ?? (w.raffle?.legacy ? "histórico" : "sin cuenta")}</div></td>
                  <td className="p-3 font-mono text-slate-600">#{w.ticketNumber ?? "-"}</td>
                  <td className="p-3 text-slate-600">{w.raffle?.prizeValue > 0 ? usd(w.raffle.prizeValue) : "-"}</td>
                  <td className="p-3"><RevealCode code={w.claimCode} /></td>
                  <td className="p-3 text-xs text-slate-500">{fmtD(w.notifiedAt)}</td>
                  <td className="p-3">
                    <button
                      onClick={() => onStatus(w.id, w.prizeStatus === "DELIVERED" ? "PENDING" : "DELIVERED")}
                      className={`rounded-full px-2.5 py-1 text-xs font-bold ${w.prizeStatus === "DELIVERED" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}
                      title="Cambiar estado"
                    >
                      {w.prizeStatus === "DELIVERED" ? "Entregado" : "Pendiente"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
