import Icon from "./Icon";
import Skeleton from "./Skeleton";
import { useEffect, useState } from "react";

const COUNTRY: Record<string, string> = {
  PE: "Perú", MX: "México", CO: "Colombia", CL: "Chile",
  AR: "Argentina", EC: "Ecuador", BO: "Bolivia", VE: "Venezuela",
};

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const fmtDay = (iso: string) =>
  new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(iso));

export default function PublicProfile({ username }: { username: string }) {
  const [data, setData] = useState<any>(undefined);

  useEffect(() => {
    fetch(`/api/u/${encodeURIComponent(username)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null));
  }, [username]);

  if (data === undefined)
    return (
      <div className="mx-auto max-w-3xl px-5 py-10">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <div className="mt-6 space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
      </div>
    );
  if (!data) return <div className="mx-auto max-w-3xl px-5 py-20 text-center text-slate-400">Este perfil no existe.</div>;

  const p = data.profile;
  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white p-6 text-center sm:flex-row sm:items-center sm:gap-5 sm:text-left">
        {p.avatarUrl
          ? <img src={p.avatarUrl} className={`h-20 w-20 rounded-full object-cover ${p.suertudo ? "ring-4 ring-amber-400 ring-offset-2" : ""}`} alt="" />
          : <div className={`flex h-20 w-20 items-center justify-center rounded-full bg-slate-200 text-2xl font-bold text-slate-500 ${p.suertudo ? "ring-4 ring-amber-400 ring-offset-2" : ""}`}>{(p.nickname || p.username)[0].toUpperCase()}</div>}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            {p.nickname && <h1 className="text-xl font-bold text-slate-900">{p.nickname}</h1>}
            {p.suertudo && (
              <span className="group relative inline-flex cursor-help items-center gap-1 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 px-2.5 py-0.5 text-xs font-black uppercase tracking-wide text-white shadow-sm">
                <Icon name="star" className="h-3.5 w-3.5" /> Suertudo
                <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-1.5 w-56 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-center text-[11px] font-normal normal-case tracking-normal text-white opacity-0 shadow-lg transition group-hover:opacity-100">
                  Es un Suertudo por haber comprado lingotes con dinero real. Los Suertudos participan en sorteos exclusivos.
                </span>
              </span>
            )}
          </div>
          <div className="text-sm font-medium text-emerald-700">@{p.username}</div>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-slate-500 sm:justify-start">
            <span>Miembro desde {fmtDay(p.createdAt)}</span>
            {p.country && (
              <span className="inline-flex items-center gap-1.5">
                {COUNTRY[p.country] && <img src={`/flags/${p.country.toLowerCase()}.svg`} alt="" width="16" height="12" className="h-3 w-4 rounded-[2px] border border-slate-200 object-cover" />}
                {COUNTRY[p.country] ?? p.country}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-3">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-xl font-bold text-slate-900"><img src="/ticket.png" className="h-4 w-4" alt="" />{new Intl.NumberFormat("es-PE").format(p.ticketsTotal)}</div>
            <div className="text-xs text-slate-500">tickets</div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-xl font-bold text-amber-500"><Icon name="trophy" className="h-4 w-4" />{p.winsCount}</div>
            <div className="text-xs text-slate-500">ganados</div>
          </div>
        </div>
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold text-slate-900">Actividad</h2>
      {data.feed.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 p-10 text-center text-slate-400">Sin actividad pública todavía.</p>
      ) : (
        <ul className="space-y-2">
          {data.feed.map((f: any, i: number) => <FeedItem key={i} f={f} />)}
        </ul>
      )}
      <p className="mt-6 text-center text-xs text-slate-400">Este es un perfil público. Los montos en dinero no se muestran; solo la actividad de tickets y cambios de perfil, por transparencia.</p>
    </div>
  );
}

function FeedItem({ f }: { f: any }) {
  if (f.type === "purchase") {
    return (
      <li className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
        {f.raffle.image
          ? <img src={f.raffle.image} className="h-10 w-14 rounded-lg object-cover" alt="" />
          : <span className="flex h-10 w-14 items-center justify-center rounded-lg bg-slate-100"><img src="/ticket.png" className="h-5 w-5" alt="" /></span>}
        <div className="min-w-0 flex-1">
          <div className="text-sm text-slate-800">
            Compró <strong>{f.quantity}</strong> ticket{f.quantity > 1 ? "s" : ""} en <a href={`/sorteos/${f.raffle.slug}`} className="font-semibold text-emerald-700 hover:underline">{f.raffle.title}</a>
          </div>
          <div className="text-xs text-slate-400">{fmtDate(f.at)}</div>
        </div>
      </li>
    );
  }
  if (f.type === "avatar_change") {
    return (
      <li className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
        {f.data?.to && <img src={f.data.to} className="h-10 w-10 rounded-full object-cover" alt="" />}
        <div className="min-w-0 flex-1">
          <div className="text-sm text-slate-800">Cambió su foto de perfil</div>
          <div className="text-xs text-slate-400">{fmtDate(f.at)}</div>
        </div>
      </li>
    );
  }
  if (f.type === "username_change") {
    return (
      <li className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100"><Icon name="user" className="h-5 w-5 text-slate-400" /></span>
        <div className="min-w-0 flex-1">
          <div className="text-sm text-slate-800">{f.data?.from ? <>Cambió su usuario de <strong>@{f.data.from}</strong> a <strong>@{f.data.to}</strong></> : <>Eligió su nombre de usuario <strong>@{f.data?.to}</strong></>}</div>
          <div className="text-xs text-slate-400">{fmtDate(f.at)}</div>
        </div>
      </li>
    );
  }
  return null;
}
