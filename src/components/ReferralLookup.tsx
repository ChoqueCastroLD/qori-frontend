import { useState } from "react";

const nf = (n: number) => new Intl.NumberFormat("es-PE").format(n);
const dm = (iso: string) => { const d = new Date(iso); return `${d.getDate()}/${d.getMonth() + 1}`; };

function Avatar({ url, name, ring }: { url: string | null; name: string; ring?: boolean }) {
  const cls = `h-9 w-9 shrink-0 rounded-full object-cover ${ring ? "ring-2 ring-amber-400" : ""}`;
  return url
    ? <img src={url} className={cls} alt="" />
    : <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-bold text-slate-500 ${ring ? "ring-2 ring-amber-400" : ""}`}>{(name || "?")[0].toUpperCase()}</span>;
}

function PersonList({ people, ring }: { people: any[]; ring?: boolean }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {people.map((u: any, i: number) => {
        const inner = (
          <>
            <Avatar url={u.avatarUrl} name={u.nickname || u.username || "?"} ring={ring} />
            <span className="min-w-0 truncate text-sm font-medium text-slate-700">{u.nickname || (u.username ? `@${u.username}` : "Usuario")}</span>
          </>
        );
        return u.username
          ? <li key={i}><a href={`/u/${u.username}`} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 transition hover:border-emerald-400">{inner}</a></li>
          : <li key={i} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2">{inner}</li>;
      })}
    </ul>
  );
}

// 7-day stacked bars: bought (emerald) over registered-not-bought (slate).
function Chart({ daily }: { daily: any[] }) {
  const max = Math.max(1, ...daily.map((d) => d.total));
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-semibold text-slate-700">Ultimos 7 dias</span>
        <span className="flex items-center gap-3 text-slate-400">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-emerald-500" /> compraron</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-slate-300" /> sin comprar</span>
        </span>
      </div>
      <div className="flex h-28 items-end gap-1.5">
        {daily.map((d) => {
          const h = (d.total / max) * 100;
          const boughtH = d.total > 0 ? (d.bought / d.total) * h : 0;
          return (
            <div key={d.date} className="group relative flex flex-1 flex-col items-center justify-end" title={`${d.date}: ${d.total} registrados, ${d.bought} compraron`}>
              <div className="flex w-full flex-col justify-end rounded-t bg-slate-200" style={{ height: `${Math.max(2, h)}%` }}>
                <div className="w-full rounded-t bg-emerald-500" style={{ height: `${boughtH}%` }} />
              </div>
              <span className="mt-1 text-[9px] text-slate-400">{dm(d.date)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ReferralLookup() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<any>(undefined);

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    const c = code.trim();
    if (!c) return;
    setLoading(true);
    try {
      const d = await fetch(`/api/referrals/lookup?code=${encodeURIComponent(c)}`).then((r) => r.json());
      setRes(d);
    } catch { setRes({ found: false }); }
    setLoading(false);
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-slate-900">Buscar un código de referido</h2>
      <p className="mt-1 text-xs text-slate-500">Escribe un código (de usuario o de marca) para ver cuántos referidos tiene y quiénes son.</p>
      <form onSubmit={search} className="mt-3 flex gap-2">
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ej: breakscan o D8M7L4DW" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        <button disabled={loading || !code.trim()} className="shrink-0 rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:bg-slate-400">{loading ? "Buscando…" : "Buscar"}</button>
      </form>

      {res !== undefined && (res.found ? (
        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
            {res.type === "user"
              ? <Avatar url={res.owner.avatarUrl} name={res.owner.name || res.owner.username || "?"} />
              : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-yellow-500 text-white"><svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 7h-9M14 17H5M5 7a3 3 0 1 0 6 0 3 3 0 0 0-6 0ZM13 17a3 3 0 1 0 6 0 3 3 0 0 0-6 0Z" /></svg></span>}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                {res.type === "affiliate" && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs">marca</span>}
                <span className="truncate">{res.owner.name || (res.owner.username ? `@${res.owner.username}` : res.owner.code)}</span>
              </div>
              <div className="font-mono text-xs text-slate-400">{res.owner.code}</div>
            </div>
            <div className="flex gap-4 text-right">
              <div><div className="text-2xl font-bold text-emerald-700">{nf(res.boughtCount)}</div><div className="text-xs text-slate-500">compraron</div></div>
              <div><div className="text-2xl font-bold text-slate-900">{nf(res.count)}</div><div className="text-xs text-slate-500">referidos</div></div>
            </div>
          </div>

          {res.count > 0 && <Chart daily={res.daily} />}

          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Se registraron y compraron ({res.boughtCount})
            </div>
            {res.bought.length === 0 ? <p className="text-xs text-slate-400">Nadie ha comprado todavía con este código.</p> : <PersonList people={res.bought} ring />}
          </div>

          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
              <span className="h-2 w-2 rounded-full bg-slate-300" /> Se registraron pero aún no compran ({res.notBought.length})
            </div>
            {res.notBought.length === 0 ? <p className="text-xs text-slate-400">Todos los referidos ya compraron.</p> : <PersonList people={res.notBought} />}
          </div>
        </div>
      ) : (
        <p className="mt-4 rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-400">No encontramos ese código.</p>
      ))}
    </div>
  );
}
