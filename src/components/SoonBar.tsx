import { useEffect, useState } from "react";
import Icon from "./Icon";
import { subscribeRaffles, openByClosing, type RaffleLite } from "../lib/rafflesStore";

const pad = (n: number) => String(n).padStart(2, "0");

// Site-wide bar for the next raffle to close. Always visible while a raffle is
// open; a live dd:hh:mm:ss countdown for constant urgency. The user can collapse
// it to a minimal strip (never hidden), and it auto-expands under 10 min or when
// a show is live. Persisted across View Transitions (transition:persist) so the
// countdown never resets on navigation.
function Seg({ v, label }: { v: number; label: string }) {
  return (
    <span className="flex w-6 flex-col items-center leading-none sm:w-7">
      <span className="font-mono text-[13px] font-bold tabular-nums text-emerald-50">{pad(v)}</span>
      <span className="mt-0.5 text-[7px] font-medium uppercase tracking-[0.12em] text-emerald-400/60">{label}</span>
    </span>
  );
}

export default function SoonBar() {
  const [raffle, setRaffle] = useState<RaffleLite | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [min, setMin] = useState(() => {
    try { return typeof localStorage !== "undefined" && localStorage.getItem("qori_soonbar") === "min"; } catch { return false; }
  });

  useEffect(() => {
    const unsub = subscribeRaffles((rs) => setRaffle(openByClosing(rs)[0] ?? null));
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { unsub(); clearInterval(tick); };
  }, []);

  if (!raffle || !raffle.closesAt) return null;
  const rem = Math.floor((new Date(raffle.closesAt).getTime() - now) / 1000);
  const live = rem <= 0;
  const urgent = live || rem <= 600; // under 10 min forces the full bar open
  const collapsed = min && !urgent;

  const href = `/sorteos/${raffle.slug}`;
  const d = Math.max(0, Math.floor(rem / 86400));
  const h = Math.max(0, Math.floor((rem % 86400) / 3600));
  const m = Math.max(0, Math.floor((rem % 3600) / 60));
  const s = Math.max(0, rem % 60);

  const toggle = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const v = !min; setMin(v);
    try { localStorage.setItem("qori_soonbar", v ? "min" : "full"); } catch {}
  };

  // Live show: red bar, straight to the show.
  if (live) {
    return (
      <a href={href} className="block bg-red-600 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-4 py-1.5 text-xs sm:text-sm">
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-white" />
          <span className="truncate font-semibold">EN VIVO ahora: {raffle.title}</span>
          <span className="hidden shrink-0 rounded-full border border-white/40 px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wide sm:inline">Entrar</span>
        </div>
      </a>
    );
  }

  if (collapsed) {
    return (
      <div className="relative bg-slate-900 text-white">
        <a href={href} className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-4 py-1">
          <span className="relative flex h-1.5 w-1.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          <span className="truncate text-[11px] text-emerald-50/90">{raffle.title}</span>
          <span className="shrink-0 font-mono text-[11px] font-bold tabular-nums text-emerald-300">{d > 0 ? `${d}d ` : ""}{pad(h)}:{pad(m)}:{pad(s)}</span>
        </a>
        <button type="button" onClick={toggle} aria-label="Expandir aviso" className="absolute right-2 top-1/2 -translate-y-1/2 text-emerald-200/60 hover:text-white">
          <Icon name="chevron-down" className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="group relative bg-slate-900 text-white">
      <a href={href} className="mx-auto flex max-w-6xl items-center justify-center gap-x-2.5 px-3 py-1.5 sm:gap-x-3">
        <span className="relative hidden h-2 w-2 shrink-0 sm:flex">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
        </span>
        <img alt="qori.cc" loading="lazy" className="h-6 w-6 shrink-0 object-contain drop-shadow-[0_0_6px_rgba(16,185,129,0.5)]" src="/logo.png" style={{ imageRendering: "pixelated" }} />
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="text-[8px] font-semibold uppercase tracking-[0.2em] text-emerald-400/80">Sorteo qori.cc</span>
          <span className="truncate text-[12px] font-bold tracking-tight text-emerald-50">{raffle.title}</span>
        </span>
        <span aria-hidden="true" className="hidden h-6 w-px shrink-0 bg-emerald-400/15 sm:block" />
        <span className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
          {d > 0 && <Seg v={d} label="dias" />}
          <Seg v={h} label="hrs" />
          <Seg v={m} label="min" />
          <Seg v={s} label="seg" />
        </span>
        <span className={`ml-1 hidden shrink-0 items-center rounded-full border px-3.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white transition-all duration-300 md:inline-flex ${rem <= 600 ? "border-red-400/50 bg-red-500/20" : "border-emerald-400/40 bg-emerald-500/10 group-hover:bg-emerald-500 group-hover:shadow-[0_0_16px_rgba(16,185,129,0.5)]"}`}>Participar</span>
      </a>
      <button type="button" onClick={toggle} aria-label="Minimizar aviso" title="Minimizar" className="absolute right-1.5 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-emerald-200/50 transition-colors hover:bg-white/10 hover:text-white">
        <Icon name="chevron-up" className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
