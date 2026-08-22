import Lingote from "./Lingote";
import TicketIcon from "./TicketIcon";
import { useEffect, useState } from "react";

const LTYPE: Record<string, string> = {
  TOPUP: "Recarga", TICKET_BONUS: "Bono", REFERRAL: "Referido",
  TICKET_SPEND: "Compra", REFUND: "Reembolso", ADJUSTMENT: "Ajuste",
};

export default function Account() {
  const [me, setMe] = useState<any>(null);
  const [tab, setTab] = useState<"tickets" | "wallet" | "referrals">("tickets");
  const [tickets, setTickets] = useState<any[]>([]);
  const [wallet, setWallet] = useState<any>(null);
  const [refs, setRefs] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [nickname, setNickname] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  async function saveProfile() {
    setSaving(true);
    const res = await fetch("/api/me/profile", {
      method: "PATCH", credentials: "include", headers: { "content-type": "application/json" },
      body: JSON.stringify({ nickname: nickname || undefined, avatarUrl: avatarUrl || undefined }),
    });
    if (res.ok) {
      const d = await res.json();
      setMe(d.user);
      setEditing(false);
      window.dispatchEvent(new CustomEvent("qori:refresh"));
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
        ]);
      })
      .then((res) => {
        if (!res) return;
        setTickets(res[0].tickets ?? []);
        setWallet(res[1]);
        setRefs(res[2]);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="py-20 text-center text-slate-400">Cargando…</p>;
  if (!me) return null;

  const refLink = typeof window !== "undefined" ? `${location.origin}/registro?ref=${refs?.code}` : "";

  return (
    <div className="mx-auto max-w-4xl px-5 py-10">
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          {me.avatarUrl ? <img src={me.avatarUrl} className="h-14 w-14 rounded-full" alt="" /> : <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-200 text-xl font-bold text-slate-500">{(me.nickname || me.email)[0].toUpperCase()}</div>}
          <div>
            <h1 className="text-xl font-bold text-slate-900">{me.nickname || me.name || "Mi cuenta"}</h1>
            <p className="text-sm text-slate-500">{me.email}</p>
            <button
              onClick={() => { setNickname(me.nickname || ""); setAvatarUrl(me.avatarUrl || ""); setEditing((v) => !v); }}
              className="mt-1 text-xs font-semibold text-slate-500 hover:text-slate-900"
            >
              {editing ? "Cancelar" : "Editar perfil"}
            </button>
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold text-emerald-600">{new Intl.NumberFormat("es-PE").format(me.balance)} <Lingote /></div>
          <a href="/recargar" className="text-sm font-semibold text-emerald-600 hover:underline">Recargar →</a>
        </div>
      </div>

      {editing && (
        <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Apodo público</label>
              <input value={nickname} onChange={(e) => setNickname(e.target.value.slice(0, 40))} placeholder="Cómo te verán en el show" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">URL de avatar</label>
              <input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://…foto.jpg" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
          </div>
          {avatarUrl && <img src={avatarUrl} className="mt-3 h-12 w-12 rounded-full object-cover" alt="" />}
          <p className="mt-2 text-xs text-slate-400">Por privacidad, puedes usar un apodo y un avatar en lugar de tu foto real.</p>
          <button onClick={saveProfile} disabled={saving} className="mt-3 rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:bg-slate-400">
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      )}

      <div className="mt-6 flex gap-1 border-b border-slate-200">
        {([["tickets", "Mis boletos"], ["wallet", "Movimientos"], ["referrals", "Referidos"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2.5 text-sm font-semibold ${tab === k ? "border-b-2 border-emerald-500 text-slate-900" : "text-slate-500 hover:text-slate-700"}`}>{label}</button>
        ))}
      </div>

      {tab === "tickets" && (
        <div className="mt-6">
          {tickets.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 p-10 text-center text-slate-400">Aún no tienes boletos. <a href="/sorteos" className="font-semibold text-emerald-600">Ver sorteos</a></p>
          ) : (
            <div className="space-y-3">
              {tickets.map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center gap-3">
                    {t.raffle.images?.[0] && <img src={t.raffle.images[0]} className="h-12 w-12 rounded-lg object-cover" alt="" />}
                    <div>
                      <a href={`/sorteos/${t.raffle.slug}`} className="font-semibold text-slate-900 hover:underline">{t.raffle.title}</a>
                      <div className="text-xs text-slate-500">{t.raffle.status === "DRAWN" ? "Finalizado" : "Activo"}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-1 font-mono text-sm font-bold text-slate-700"><TicketIcon />#{t.number}</span>
                    {t.win && <div className="mt-1 text-xs font-bold text-emerald-600">🏆 ¡Ganador!</div>}
                  </div>
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
              <span className={e.amount >= 0 ? "font-semibold text-emerald-600" : "font-semibold text-slate-500"}>{e.amount >= 0 ? "+" : ""}{e.amount} <Lingote /></span>
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
              <div><span className="text-2xl font-bold text-emerald-600">{refs.lingotesEarned} <Lingote /></span><span className="ml-1 text-slate-500">ganados</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
