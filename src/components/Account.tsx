import Lingote from "./Lingote";
import TicketIcon from "./TicketIcon";
import Icon from "./Icon";
import ImageUpload from "./ImageUpload";
import Skeleton from "./Skeleton";
import { useEffect, useState } from "react";

const LTYPE: Record<string, string> = {
  TOPUP: "Recarga", TICKET_BONUS: "Bono", REFERRAL: "Referido",
  TICKET_SPEND: "Compra", REFUND: "Reembolso", ADJUSTMENT: "Ajuste",
};

const METHOD_LABEL: Record<string, string> = {
  MERCADOPAGO: "MercadoPago", PAYPAL: "PayPal", YAPE: "Yape",
  PLIN: "Plin", TRANSFER: "Transferencia", CRYPTO: "Cripto",
};
const TOPUP_STATUS: Record<string, string> = {
  PAID: "Acreditada", PENDING: "Pendiente", FAILED: "Fallida", REFUNDED: "Reembolsada",
};
const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export default function Account() {
  const [me, setMe] = useState<any>(null);
  const [tab, setTab] = useState<"tickets" | "recargas" | "wallet" | "referrals">("tickets");
  const [tickets, setTickets] = useState<any[]>([]);
  const [topups, setTopups] = useState<any[]>([]);
  const [wallet, setWallet] = useState<any>(null);
  const [refs, setRefs] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [nickname, setNickname] = useState("");
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [profErr, setProfErr] = useState("");
  const [copied, setCopied] = useState(false);
  const [resent, setResent] = useState(false);

  async function resendVerification() {
    await fetch("/api/auth/resend-verification", { method: "POST", credentials: "include" }).catch(() => {});
    setResent(true);
  }

  const USERNAME_ERR: Record<string, string> = {
    username_invalid: "El usuario debe tener 3 a 20 caracteres: minúsculas, números o guion bajo.",
    username_reserved: "Ese nombre de usuario está reservado.",
    username_taken: "Ese nombre de usuario ya está en uso.",
  };

  async function saveProfile() {
    setSaving(true); setProfErr("");
    const body: any = { nickname: nickname || undefined, avatarUrl: avatarUrl || undefined };
    const uname = username.trim().toLowerCase();
    if (uname && uname !== (me?.username ?? "")) body.username = uname;
    const res = await fetch("/api/me/profile", {
      method: "PATCH", credentials: "include", headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok) {
      setMe(d.user);
      setEditing(false);
      window.dispatchEvent(new CustomEvent("qori:refresh"));
    } else if (d?.error === "username_cooldown") {
      setProfErr(`Solo puedes cambiar tu nombre de usuario una vez cada 15 días. Espera ${d.daysLeft} día(s) más.`);
    } else {
      setProfErr(USERNAME_ERR[d?.error] ?? "No se pudo guardar. Intenta de nuevo.");
    }
    setSaving(false);
  }

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.user) { window.location.href = "/entrar"; return; }
        setMe(d.user);
        return Promise.all([
          fetch("/api/me/tickets", { credentials: "include" }).then((r) => r.json()),
          fetch("/api/me/wallet", { credentials: "include" }).then((r) => r.json()),
          fetch("/api/me/referrals", { credentials: "include" }).then((r) => r.json()),
          fetch("/api/topups/mine", { credentials: "include" }).then((r) => r.json()),
        ]);
      })
      .then((res) => {
        if (!res) return;
        setTickets(res[0].tickets ?? []);
        setWallet(res[1]);
        setRefs(res[2]);
        setTopups(res[3].topups ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return (
      <div className="mx-auto max-w-4xl px-5 py-10">
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-14 w-14 rounded-full" />
            <div className="space-y-2"><Skeleton className="h-5 w-40" /><Skeleton className="h-3 w-52" /></div>
          </div>
          <Skeleton className="h-8 w-28" />
        </div>
        <div className="mt-6 flex gap-4 border-b border-slate-200 pb-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-4 w-20" />)}
        </div>
        <div className="mt-6 space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      </div>
    );
  if (!me) return null;

  const refLink = typeof window !== "undefined" ? `${location.origin}/registro?ref=${refs?.code}` : "";

  return (
    <div className="mx-auto max-w-4xl px-5 py-10">
      {!me.emailVerified && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>Verifica tu correo para asegurar tu cuenta y poder cobrar si ganas.</span>
          {resent ? (
            <span className="inline-flex items-center gap-1 font-semibold text-amber-700">Correo enviado <Icon name="check" className="h-4 w-4" /></span>
          ) : (
            <button onClick={resendVerification} className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 font-semibold text-white hover:bg-amber-500">Reenviar correo</button>
          )}
        </div>
      )}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          {me.avatarUrl ? <img src={me.avatarUrl} className="h-14 w-14 rounded-full" alt="" /> : <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-200 text-xl font-bold text-slate-500">{(me.nickname || me.email)[0].toUpperCase()}</div>}
          <div>
            <h1 className="text-xl font-bold text-slate-900">{me.nickname || me.name || "Mi cuenta"}</h1>
            {me.username
              ? <a href={`/u/${me.username}`} className="text-sm font-medium text-emerald-700 hover:underline">@{me.username}</a>
              : <p className="text-sm text-slate-400">Elige tu nombre de usuario en “Editar perfil”</p>}
            <p className="text-xs text-slate-400">{me.email}</p>
            <button
              onClick={() => { setNickname(me.nickname || ""); setUsername(me.username || ""); setAvatarUrl(me.avatarUrl || ""); setProfErr(""); setEditing((v) => !v); }}
              className="mt-1 text-xs font-semibold text-slate-500 hover:text-slate-900"
            >
              {editing ? "Cancelar" : "Editar perfil"}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <div className="text-right">
            <div className="flex items-center justify-end gap-1 text-2xl font-bold text-emerald-700">{new Intl.NumberFormat("es-PE").format(me.balance)} <Lingote /></div>
            <a href="/recargar" className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline">Recargar <Icon name="arrow-right" className="h-3 w-3" /></a>
          </div>
          <div className="text-right">
            <div className="flex items-center justify-end gap-1 text-2xl font-bold text-slate-900"><img src="/ticket.png" alt="" className="h-5 w-5" />{new Intl.NumberFormat("es-PE").format(me.ticketCount ?? 0)}</div>
            <div className="text-xs text-slate-500">tickets</div>
          </div>
        </div>
      </div>

      {editing && (
        <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Nombre de usuario (tu URL pública)</label>
              <div className="flex items-center rounded-lg border border-slate-200 px-3 text-sm">
                <span className="text-slate-400">qori.cc/u/</span>
                <input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20))} placeholder="tu_usuario" className="w-full bg-transparent py-2 outline-none" />
              </div>
              <p className="mt-1 text-xs text-slate-400">3 a 20 caracteres (minúsculas, números, guion bajo). Solo se puede cambiar una vez cada 15 días.</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Apodo público</label>
              <input value={nickname} onChange={(e) => setNickname(e.target.value.slice(0, 40))} placeholder="Cómo te verán en el show" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-700">Foto de perfil</label>
              <ImageUpload
                circle
                value={avatarUrl}
                endpoint="/me/avatar"
                onChange={(url) => { setAvatarUrl(url); setMe((m: any) => (m ? { ...m, avatarUrl: url } : m)); window.dispatchEvent(new CustomEvent("qori:refresh")); }}
                hint="Se guarda al subir. JPG, PNG o WEBP, máx 6 MB."
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-400">Por privacidad, puedes usar un apodo y una foto en lugar de tu foto real.</p>
          {profErr && <p className="mt-2 text-sm text-red-600">{profErr}</p>}
          <button onClick={saveProfile} disabled={saving} className="mt-3 rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:bg-slate-400">
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      )}

      <div className="mt-6 flex gap-1 border-b border-slate-200">
        {([["tickets", "Mis tickets"], ["recargas", "Recargas"], ["wallet", "Movimientos"], ["referrals", "Referidos"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2.5 text-sm font-semibold ${tab === k ? "border-b-2 border-emerald-500 text-slate-900" : "text-slate-500 hover:text-slate-700"}`}>{label}</button>
        ))}
      </div>

      {tab === "tickets" && (
        <div className="mt-6">
          {tickets.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 p-10 text-center text-slate-400">Aún no tienes tickets. <a href="/sorteos" className="font-semibold text-emerald-700">Ver sorteos</a></p>
          ) : (
            <div className="space-y-3">
              {tickets.map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center gap-3">
                    {t.raffle.images?.[0] && <img src={t.raffle.images[0]} className="h-12 w-12 rounded-lg object-cover" alt="" />}
                    <div>
                      <a href={`/sorteos/${t.raffle.slug}`} className="font-semibold text-slate-900 hover:underline">{t.raffle.title}</a>
                      <div className="text-xs text-slate-500">{t.raffle.status === "DRAWN" ? "Finalizado" : "Activo"}{t.createdAt ? ` · comprado el ${fmtDate(t.createdAt)}` : ""}</div>
                      {t.comment && <div className="mt-0.5 text-xs italic text-slate-400">“{t.comment}”</div>}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-1 font-mono text-sm font-bold text-slate-700"><TicketIcon />#{t.number}</span>
                    {t.win && <div className="mt-1 flex items-center justify-end gap-1 text-xs font-bold text-emerald-700"><Icon name="trophy" className="h-3.5 w-3.5" /> ¡Ganador!</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "recargas" && (
        <div className="mt-6">
          {topups.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 p-10 text-center text-slate-400">Aún no has recargado lingotes. <a href="/recargar" className="font-semibold text-emerald-700">Recargar</a></p>
          ) : (
            <div className="space-y-3">
              {topups.map((t) => (
                <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
                  <div>
                    <div className="flex items-center gap-2 font-semibold text-slate-900">
                      <Lingote /> {new Intl.NumberFormat("es-PE").format(t.lingotes)} lingotes
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${t.status === "PAID" ? "bg-emerald-100 text-emerald-700" : t.status === "PENDING" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>{TOPUP_STATUS[t.status] ?? t.status}</span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {METHOD_LABEL[t.method] ?? t.method} · USD {(t.amountUsd / 100).toFixed(2)} · {fmtDate(t.confirmedAt || t.createdAt)}
                    </div>
                  </div>
                  {t.status === "PAID" ? (
                    <button
                      onClick={async () => { const { downloadReceipt } = await import("../lib/receipt"); downloadReceipt(t, { email: me.email, nickname: me.nickname }); }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Icon name="document" className="h-4 w-4" /> Descargar recibo
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400">Recibo disponible al acreditarse</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "wallet" && wallet && (
        <div className="mt-6 space-y-2">
          {wallet.entries.length === 0 ? <p className="text-slate-400">Sin movimientos.</p> : wallet.entries.map((e: any) => (
            <div key={e.id} className="flex items-center justify-between rounded-lg border border-slate-100 bg-white px-4 py-2.5 text-sm">
              <span className="text-slate-600">{LTYPE[e.type] ?? e.type}{e.memo ? ` · ${e.memo}` : ""}</span>
              <span className={e.amount >= 0 ? "font-semibold text-emerald-700" : "font-semibold text-slate-500"}>{e.amount >= 0 ? "+" : ""}{e.amount} <Lingote /></span>
            </div>
          ))}
        </div>
      )}

      {tab === "referrals" && refs && (
        <div className="mt-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <p className="text-sm text-slate-500">Comparte tu enlace. Ganas <strong>+10 lingotes</strong> cuando un referido hace su primera compra.</p>
            <div className="mt-3 flex items-center gap-2">
              <input readOnly value={refLink} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600" />
              <button
                onClick={() => { navigator.clipboard.writeText(refLink); setCopied(true); setTimeout(() => setCopied(false), 1800); }}
                className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold text-white ${copied ? "bg-emerald-600" : "bg-slate-900"}`}
              >{copied ? "¡Copiado!" : "Copiar"}</button>
            </div>
            <div className="mt-4 flex gap-6 text-sm">
              <div><span className="text-2xl font-bold text-slate-900">{refs.count}</span><span className="ml-1 text-slate-500">referidos</span></div>
              <div><span className="text-2xl font-bold text-emerald-700">{refs.lingotesEarned} <Lingote /></span><span className="ml-1 text-slate-500">ganados</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
