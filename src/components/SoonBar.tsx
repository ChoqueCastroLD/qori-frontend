import { useEffect, useState } from "react";

const pad = (n: number) => String(n).padStart(2, "0");

// Slim site-wide bar shown only when a raffle draws in under 1 hour, with a live
// countdown. Links to the raffle (which auto-enters the show at draw time).
export default function SoonBar() {
  const [raffle, setRaffle] = useState<{ slug: string; title: string; closesAt: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let stop = false;
    const refetch = async () => {
      try {
        const list = await fetch("/api/raffles").then((r) => (r.ok ? r.json() : []));
        const t = Date.now();
        const soon = (Array.isArray(list) ? list : [])
          .filter((r: any) => r.status === "OPEN" && !r.blocked && r.closesAt && new Date(r.closesAt).getTime() > t && new Date(r.closesAt).getTime() <= t + 3600_000)
          .sort((a: any, b: any) => new Date(a.closesAt).getTime() - new Date(b.closesAt).getTime());
        if (!stop) setRaffle(soon[0] ?? null);
      } catch {}
    };
    refetch();
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const rf = setInterval(refetch, 20000);
    return () => { stop = true; clearInterval(tick); clearInterval(rf); };
  }, []);

  if (!raffle) return null;
  const rem = Math.floor((new Date(raffle.closesAt).getTime() - now) / 1000);
  if (rem > 3600) return null;
  const live = rem <= 0;
  const m = Math.max(0, Math.floor(rem / 60));
  const s = Math.max(0, rem % 60);

  return (
    <a href={`/sorteos/${raffle.slug}`} className={`block ${live ? "bg-red-600" : "bg-slate-900"} text-white`}>
      <div className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-4 py-1.5 text-xs sm:text-sm">
        <span className={`h-2 w-2 shrink-0 animate-pulse rounded-full ${live ? "bg-white" : "bg-red-500"}`} />
        {live ? (
          <span className="truncate font-semibold">EN VIVO ahora: {raffle.title} · entrar</span>
        ) : (
          <>
            <span className="truncate">Sorteo <strong>{raffle.title}</strong> en</span>
            <span className={`shrink-0 font-bold tabular-nums ${rem <= 60 ? "text-red-300" : "text-emerald-300"}`}>{pad(m)}:{pad(s)}</span>
            <span className="hidden shrink-0 underline sm:inline">Ver</span>
          </>
        )}
      </div>
    </a>
  );
}
