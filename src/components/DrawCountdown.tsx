import { useEffect, useRef, useState } from "react";

const pad = (n: number) => String(n).padStart(2, "0");

function FlipBox({ value, label, tone = "dark", big = false }: { value: number; label?: string; tone?: "dark" | "emerald"; big?: boolean }) {
  const bg = tone === "emerald" ? "bg-emerald-600" : "bg-slate-900";
  return (
    <div className="flex flex-col items-center">
      <div className={`relative overflow-hidden rounded-lg ${bg} px-3 py-1.5 text-white shadow-inner`}>
        <span key={value} className={`qori-flip block font-bold tabular-nums ${big ? "text-4xl sm:text-5xl" : "text-2xl sm:text-3xl"}`}>{pad(value)}</span>
      </div>
      {label && <span className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>}
    </div>
  );
}

export default function DrawCountdown({ closesAt, slug }: { closesAt: string; slug: string }) {
  const [now, setNow] = useState(() => Date.now());
  const [starting, setStarting] = useState(false);
  const origTitle = useRef<string>("");

  useEffect(() => {
    origTitle.current = document.title;
    const iv = setInterval(() => setNow(Date.now()), 250);
    return () => { clearInterval(iv); if (origTitle.current) document.title = origTitle.current; };
  }, []);

  const remMs = Math.max(0, new Date(closesAt).getTime() - now);
  const rem = Math.floor(remMs / 1000);
  const d = Math.floor(rem / 86400);
  const h = Math.floor((rem % 86400) / 3600);
  const m = Math.floor((rem % 3600) / 60);
  const s = rem % 60;
  const phase = remMs <= 0 ? "starting" : rem <= 60 ? "final" : rem <= 300 ? "soon" : "normal";

  // When the clock hits 0: poll for the show and send everyone into the live
  // animation, synchronized. The draw runs ~10s after close (drand).
  const hitZero = remMs <= 0;
  useEffect(() => {
    if (!hitZero) return;
    setStarting(true);
    let stop = false;
    const poll = async () => {
      if (stop) return;
      try {
        const r = await fetch(`/api/raffles/${slug}`).then((x) => (x.ok ? x.json() : null));
        // Show is ready: reload THIS url - the raffle page renders the live show
        // inline (same view, no navigation to another url).
        if (r?.show?.startsAt) { window.location.reload(); return; }
        // Extended (+24h for min tickets) or cancelled: reload to show new state.
        if (r && (r.status === "CANCELLED" || (r.status === "OPEN" && r.closesAt && new Date(r.closesAt).getTime() > Date.now() + 1500))) {
          window.location.reload(); return;
        }
      } catch {}
      if (!stop) setTimeout(poll, 1000);
    };
    poll();
    return () => { stop = true; };
  }, [hitZero, slug]);

  // Flash the tab title so people on other tabs notice (final minute + starting).
  useEffect(() => {
    if (phase !== "final" && !starting) { if (origTitle.current) document.title = origTitle.current; return; }
    let on = false;
    const iv = setInterval(() => { on = !on; document.title = on ? "● SORTEO EN VIVO" : origTitle.current; }, 900);
    return () => clearInterval(iv);
  }, [phase, starting]);

  if (starting) {
    return (
      <div className="rounded-2xl border border-slate-900 bg-slate-900 p-6 text-center text-white">
        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        <div className="text-lg font-bold">El sorteo está por comenzar…</div>
        <div className="mt-1 text-sm text-white/60">El show en vivo arranca aquí mismo en segundos. No cierres esta página.</div>
      </div>
    );
  }

  if (phase === "final") {
    return (
      <div className="qori-glow rounded-2xl border-2 border-red-500 bg-slate-900 p-6 text-center shadow-lg shadow-red-500/30">
        <div className="text-xs font-bold uppercase tracking-[0.3em] text-red-400">En vivo en</div>
        <div key={s} className="qori-flip mt-1 text-7xl font-black tabular-nums leading-none text-white">{s}</div>
        <div className="mt-1 text-sm text-white/60">segundos · no cierres esta página</div>
      </div>
    );
  }

  if (phase === "soon") {
    return (
      <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5 text-center">
        <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Empieza en breve</div>
        <div className="mt-2 flex items-center justify-center gap-2">
          <FlipBox value={m} label="min" tone="emerald" />
          <span className="pb-4 text-2xl font-bold text-emerald-600">:</span>
          <FlipBox value={s} label="seg" tone="emerald" />
        </div>
        <div className="mt-2 text-xs text-emerald-700">Déjalo abierto: el show empezará solo y sincronizado para todos.</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Se sortea en vivo</div>
      <div className="mt-2 flex items-center justify-center gap-2">
        {d > 0 && <FlipBox value={d} label="días" />}
        <FlipBox value={h} label="hs" />
        <FlipBox value={m} label="min" />
        <FlipBox value={s} label="seg" />
      </div>
      <div className="mt-2 text-xs text-slate-400">
        {new Date(closesAt).toLocaleString("es-PE", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
      </div>
    </div>
  );
}
