import { useEffect, useRef, useState } from "react";

interface Msg { id: string; nickname: string; avatarUrl: string | null; text: string; createdAt: string; ticketNumbers?: number[]; }

// Ticket badge next to a chat message. On PAID raffles we never reveal HOW MANY
// tickets someone holds, so it's just an icon (they bought). On FREE raffles it
// shows the count: their total before the show, and alive/total (e.g. 2/3, red
// at 0) once the show is eliminating tickets.
function TicketBadge({ nums, elim, paid }: { nums?: number[]; elim?: Set<number>; paid?: boolean }) {
  if (!nums || nums.length === 0) return null;
  if (paid) return <img src="/ticket.png" className="h-3.5 w-3.5 opacity-80" alt="tiene tickets" title="Compró tickets" />;
  if (!elim) return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700" title={`${nums.length} ticket(s)`}>
      <img src="/ticket.png" className="h-3 w-3" alt="" />{nums.length}
    </span>
  );
  const alive = nums.filter((n) => !elim.has(n)).length;
  const dead = alive === 0;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${dead ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-700"}`} title={`${alive} vivo(s) de ${nums.length}`}>
      <img src="/ticket.png" className="h-3 w-3" alt="" />{alive}/{nums.length}
    </span>
  );
}

export default function RaffleChat({ slug, compact, elimNumbers, paid }: { slug: string; compact?: boolean; elimNumbers?: Set<number>; paid?: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [me, setMe] = useState<any>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState("");
  const [closesAt, setClosesAt] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const lastRef = useRef<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => { const iv = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(iv); }, []);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).then((d) => setMe(d?.user ?? null));
    let alive = true;
    async function poll() {
      try {
        const q = lastRef.current ? `?after=${encodeURIComponent(lastRef.current)}` : "";
        const d = await fetch(`/api/raffles/${slug}/chat${q}`, { credentials: "include" }).then((r) => r.json());
        if (!alive) return;
        if ("closesAt" in d) setClosesAt(d.closesAt ?? null);
        if (d.messages?.length) {
          setMsgs((prev) => {
            const seen = new Set(prev.map((m) => m.id));
            const merged = [...prev, ...d.messages.filter((m: Msg) => !seen.has(m.id))];
            return merged.slice(-120);
          });
          lastRef.current = d.messages[d.messages.length - 1].createdAt;
        }
      } catch {}
    }
    poll();
    const iv = setInterval(poll, 2500);
    return () => { alive = false; clearInterval(iv); };
  }, [slug]);

  useEffect(() => { if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight; }, [msgs]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    setSendErr("");
    try {
      const res = await fetch(`/api/raffles/${slug}/chat`, {
        method: "POST", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: t }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSendErr(
          d?.error === "chat_disabled" ? "Tu cuenta no puede escribir en el chat por ahora."
          : d?.error === "chat_closed" ? "El chat de este sorteo ya se cerró."
          : d?.error === "too_fast" ? "Muy rápido. Espera un momento entre mensajes."
          : "No se pudo enviar el mensaje. Intenta de nuevo.",
        );
        return;
      }
      setText("");
      // Show our message immediately (the poll would take up to 2.5s).
      if (d?.message) {
        setMsgs((prev) => (prev.some((m) => m.id === d.message.id) ? prev : [...prev, d.message].slice(-120)));
      }
    } catch {
      setSendErr("Error de red. Intenta de nuevo.");
    } finally {
      setSending(false);
    }
  }

  const closeMs = closesAt ? new Date(closesAt).getTime() : null;
  const closed = closeMs != null && now > closeMs;
  const closingIn = closeMs != null && !closed ? Math.max(0, Math.ceil((closeMs - now) / 1000)) : null;
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className={`flex flex-col rounded-2xl border border-slate-200 bg-white ${compact ? "h-[420px]" : "h-[520px]"}`}>
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
        <span className={`h-2 w-2 rounded-full ${closed ? "bg-slate-300" : "animate-pulse bg-rose-500"}`}></span>
        <h3 className="text-sm font-bold text-slate-900">{closed ? "Chat (histórico)" : "Chat en vivo"}</h3>
        <span className="text-xs text-slate-400">{msgs.length} mensajes</span>
        {closingIn != null && <span className="ml-auto rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Cierra en {mmss(closingIn)}</span>}
      </div>
      <div ref={boxRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {msgs.length === 0 ? (
          <p className="text-center text-sm text-slate-400">Sé el primero en escribir…</p>
        ) : msgs.map((m) => (
          <div key={m.id} className="flex gap-2">
            {m.avatarUrl ? <img src={m.avatarUrl} className="h-7 w-7 shrink-0 rounded-full" alt="" /> : <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-500">{m.nickname[0]}</span>}
            <div className="min-w-0">
              <span className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-700">{m.nickname}</span>
                <TicketBadge nums={m.ticketNumbers} elim={elimNumbers} paid={paid} />
              </span>
              <p className={`break-words text-sm ${!paid && elimNumbers && m.ticketNumbers && m.ticketNumbers.length > 0 && m.ticketNumbers.every((n) => elimNumbers.has(n)) ? "text-red-500" : "text-slate-600"}`}>{m.text}</p>
            </div>
          </div>
        ))}
      </div>
      {closed ? (
        <div className="border-t border-slate-100 p-3 text-center text-xs text-slate-400">El chat de este sorteo se cerró. Quedó como historial.</div>
      ) : me ? (
        <div className="border-t border-slate-100 p-3">
          {sendErr && <p role="alert" className="mb-2 text-xs text-red-600">{sendErr}</p>}
          <form onSubmit={send} className="flex gap-2">
            <input value={text} onChange={(e) => setText(e.target.value.slice(0, 300))} placeholder="Escribe un mensaje..." aria-label="Mensaje" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            <button disabled={sending || !text.trim()} className="shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:bg-slate-300">Enviar</button>
          </form>
        </div>
      ) : (
        <div className="border-t border-slate-100 p-3 text-center text-xs text-slate-400">
          <a href="/entrar" className="font-semibold text-emerald-700">Entra</a> para participar en el chat.
        </div>
      )}
    </div>
  );
}
