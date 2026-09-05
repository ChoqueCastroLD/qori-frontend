import { useEffect, useState } from "react";
import Icon from "./Icon";
import { subscribeRaffles, openByRecent, type RaffleLite } from "../lib/rafflesStore";

// Compact "active raffles" navigator, most-recent-first, always in sync with the
// shared store (no extra fetches). Desktop: a thin fixed rail in the left gutter
// that expands on hover. Mobile/tablet: a horizontal chip strip under the header.
// Mounted once in Layout.astro with transition:persist so countdowns never reset.

function fmt(closesAt: string | null, now: number): string {
  if (!closesAt) return "";
  const ms = new Date(closesAt).getTime() - now;
  if (ms <= 0) return "en vivo";
  const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function RaffleRail() {
  const [raffles, setRaffles] = useState<RaffleLite[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [path, setPath] = useState(() => (typeof location !== "undefined" ? location.pathname : ""));

  useEffect(() => {
    const unsub = subscribeRaffles((rs) => setRaffles(openByRecent(rs).slice(0, 8)));
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const onNav = () => setPath(location.pathname);
    document.addEventListener("astro:page-load", onNav);
    return () => { unsub(); clearInterval(tick); document.removeEventListener("astro:page-load", onNav); };
  }, []);

  if (raffles.length === 0) return null;
  const isActive = (slug: string) => path === `/sorteos/${slug}`;

  return (
    <>
      {/* Desktop: fixed rail in the left gutter, expands on hover */}
      <aside className="group fixed left-0 top-1/2 z-30 hidden -translate-y-1/2 xl:block">
        <div className="ml-2 flex max-h-[80vh] w-14 flex-col gap-1 overflow-hidden rounded-2xl border border-slate-200 bg-white/95 p-1.5 shadow-lg shadow-slate-200/60 backdrop-blur transition-all duration-300 group-hover:w-64">
          <div className="flex items-center gap-2 px-1.5 py-1">
            <Icon name="ticket" className="h-4 w-4 shrink-0 text-emerald-600" />
            <span className="hidden whitespace-nowrap text-xs font-bold text-slate-700 group-hover:inline">Sorteos activos</span>
          </div>
          {raffles.map((r) => (
            <a key={r.slug} href={(r as any).kind === "BINGO" ? `/bingo/${r.slug}` : `/sorteos/${r.slug}`} title={r.title}
              className={`flex items-center gap-2 rounded-xl p-1 transition ${isActive(r.slug) ? "bg-emerald-50 ring-1 ring-emerald-300" : "hover:bg-slate-50"}`}>
              <span className="relative shrink-0">
                {r.images?.[0]
                  ? <img src={r.images[0]} alt="" className={`h-9 w-9 rounded-lg object-cover ${isActive(r.slug) ? "ring-2 ring-emerald-500" : ""}`} />
                  : <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-200 text-[10px] font-bold text-slate-500">{r.title[0]}</span>}
              </span>
              <span className="hidden min-w-0 flex-1 group-hover:block">
                <span className="block truncate text-xs font-semibold text-slate-800">{r.title}</span>
                <span className="block font-mono text-[11px] font-bold tabular-nums text-emerald-600">{fmt(r.closesAt, now)}</span>
              </span>
              <span className="block font-mono text-[8px] font-bold leading-none text-emerald-600 group-hover:hidden">{fmt(r.closesAt, now).replace(" ", "")}</span>
            </a>
          ))}
        </div>
      </aside>

      {/* Mobile/tablet: horizontal chip strip under the header */}
      <div className="border-b border-slate-100 bg-white xl:hidden">
        <div className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {raffles.map((r) => (
            <a key={r.slug} href={(r as any).kind === "BINGO" ? `/bingo/${r.slug}` : `/sorteos/${r.slug}`}
              className={`flex shrink-0 snap-start items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-xs transition ${isActive(r.slug) ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
              {r.images?.[0]
                ? <img src={r.images[0]} alt="" className="h-5 w-5 rounded-full object-cover" />
                : <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-300 text-[9px] font-bold text-slate-600">{r.title[0]}</span>}
              <span className="max-w-[9rem] truncate font-medium">{r.title}</span>
              <span className="font-mono font-bold tabular-nums text-emerald-600">{fmt(r.closesAt, now)}</span>
            </a>
          ))}
        </div>
      </div>
    </>
  );
}
