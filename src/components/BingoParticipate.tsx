// Pre-game bingo participation (shown on the raffle page while it sells):
// buy tarjetas, then PICK/EDIT their numbers (within the classic column ranges,
// no repeats) or REGENERATE — allowed until 5 min before the draw. Each number
// shows how many cartillas across the room already hold it.

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Icon from "./Icon";
import Lingote from "./Lingote";
import Skeleton from "./Skeleton";
import QuickTopup from "./QuickTopup";

// Cooldowns (anti-reroll fishing): wait between regenerations / number swaps.
const REGEN_COOLDOWN_MS = 30_000;
const PICK_COOLDOWN_MS = 10_000;

// A ticking clock that only runs while `active`, for live cooldown counters.
function useNow(active: boolean, ms = 500) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [active, ms]);
  return now;
}

type Card = { id: string; seq: number; B: number[]; I: (number | null)[]; N: (number | null)[]; G: (number | null)[]; O: (number | null)[]; win?: any };
type CardsData = { editable: boolean; editableUntil: string | null; totalCards: number; cardsPerNumber: Record<number, number>; cards: Card[] };

const COLS: [keyof Card, string, number, number][] = [
  ["B", "B", 1, 15], ["I", "I", 16, 30], ["N", "N", 31, 45], ["G", "G", 46, 60], ["O", "O", 61, 75],
];
const LETTER_BG: Record<string, string> = { B: "#3b82f6", I: "#ef4444", N: "#8b5cf6", G: "#10b981", O: "#f59e0b" };
const nf = (n: number) => new Intl.NumberFormat("es-PE").format(n);

export default function BingoParticipate({
  slug, ticketPrice, maxPerUser, total, sold: soldInitial, paidOnly, closesAt,
}: {
  slug: string; ticketPrice: number; maxPerUser: number | null; total: number; sold: number; paidOnly?: boolean; closesAt: string | null;
}) {
  const [me, setMe] = useState<{ balance: number } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [data, setData] = useState<CardsData | null>(null);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [showCards, setShowCards] = useState(false);

  const sold = data ? data.totalCards : soldInitial;
  const mine = data?.cards ?? [];
  const editUntil = data?.editableUntil ? new Date(data.editableUntil).getTime() : null;
  const canEdit = !!data?.editable && (editUntil == null || now < editUntil);

  async function loadCards() {
    try {
      const r = await fetch(`/api/raffles/${slug}/bingo/cards`, { credentials: "include" });
      if (r.ok) setData(await r.json());
    } catch { /* ignore */ }
  }
  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setMe(d?.user ?? null))
      .catch(() => {})
      .finally(() => setLoaded(true));
    loadCards();
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const cost = qty * ticketPrice;
  const remaining = Math.max(0, total - sold);
  const myCount = mine.length;
  const myRemaining = maxPerUser != null ? Math.max(0, maxPerUser - myCount) : remaining;
  const max = Math.max(1, Math.min(myRemaining, remaining));
  useEffect(() => { setQty((q) => Math.max(1, Math.min(max, q))); }, [max]);

  async function buy() {
    setBusy(true); setMsg("");
    try {
      const res = await fetch(`/api/raffles/${slug}/bingo/buy`, {
        method: "POST", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify({ quantity: qty }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(BUY_ERR[d.error] ?? "No se pudo completar la compra."); return; }
      setMe((m) => (m ? { balance: m.balance - cost + (ticketPrice > 0 ? qty : 0) } : m));
      window.dispatchEvent(new CustomEvent("qori:refresh"));
      setQty(1);
      await loadCards();
    } catch { setMsg("Error de red."); }
    finally { setBusy(false); }
  }

  if (!loaded) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-6"><Skeleton className="h-4 w-24" /><Skeleton className="mt-4 h-10 w-full rounded-lg" /><Skeleton className="mt-4 h-12 w-full rounded-xl" /></div>;
  }
  if (me === null) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        {paidOnly && <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"><Icon name="lock" className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" /><span><strong>Solo para Suertudos.</strong> Recarga al menos un lingote con dinero real para participar.</span></div>}
        <p className="text-sm text-slate-600">Inicia sesión para comprar tus tarjetas de bingo.</p>
        <a href="/entrar" className="mt-4 inline-block w-full rounded-xl bg-slate-900 px-6 py-3 text-center text-sm font-semibold text-white transition hover:bg-slate-700">Entrar para participar</a>
        <p className="mt-2 text-center text-xs text-slate-400">¿No tienes cuenta? <a href="/registro" className="font-semibold text-emerald-700 hover:underline">Créala en un minuto</a></p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Buy panel */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between text-sm">
          <span className="text-slate-500">Tus lingotes</span>
          <span className="font-semibold text-emerald-700">{nf(me.balance)} <Lingote /></span>
        </div>
        <p className="mb-2 text-sm text-slate-600">{ticketPrice} lingotes por tarjeta. Se te asignan al azar y luego puedes elegir tus números.</p>
        <label className="mb-1 block text-sm font-medium text-slate-700">Cantidad de tarjetas</label>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><Icon name="minus" className="h-4 w-4" /></button>
          <input type="number" min={1} max={max} value={qty} onChange={(e) => { const n = Math.floor(Number(e.target.value)); setQty(!n || n < 1 ? 1 : Math.min(max, n)); }} className="h-10 w-full rounded-lg border border-slate-200 text-center font-semibold" />
          <button type="button" onClick={() => setQty((q) => Math.min(max, q + 1))} className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><Icon name="plus" className="h-4 w-4" /></button>
        </div>
        <div className="my-4 flex items-center justify-between border-t border-slate-100 pt-4 text-sm">
          <span className="text-slate-500">Total</span>
          <span className="text-lg font-bold text-slate-900">{nf(cost)} <Lingote /></span>
        </div>
        {msg && <p className="mb-3 text-sm text-red-600">{msg}</p>}
        {remaining <= 0 ? (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-center text-sm text-slate-500">Se agotaron las tarjetas.</p>
        ) : cost > me.balance ? (
          <QuickTopup slug={slug} qty={qty} comment="" need={cost - me.balance} />
        ) : (
          <button onClick={buy} disabled={busy} className="w-full rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:bg-slate-300">
            {busy ? "Procesando…" : `Comprar ${qty} tarjeta${qty > 1 ? "s" : ""}`}
          </button>
        )}
        {ticketPrice > 0 && <p className="mt-2 text-center text-xs text-slate-400">Recibes +1 lingote de bono por tarjeta.</p>}
        <p className="mt-2 text-center text-xs text-slate-400">{nf(sold)} / {nf(total)} tarjetas vendidas{maxPerUser ? ` · máx ${maxPerUser} por persona` : ""}</p>
      </div>

      {/* My tarjetas: compact summary that opens the full editor modal */}
      {myCount > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <div className="flex -space-x-3">
              {mine.slice(0, 3).map((c, i) => (
                <span key={c.id} className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-white bg-gradient-to-br from-emerald-500 to-emerald-600 text-sm font-black text-white shadow" style={{ zIndex: 3 - i }}>{c.seq}</span>
              ))}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 font-bold text-slate-900">Mis tarjetas <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{myCount}</span></div>
              <p className="truncate text-xs text-slate-500">{canEdit ? "Toca para ver, elegir números o regenerar" : "Edición cerrada"}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowCards(true)}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            <Icon name="clover" className="h-4 w-4" /> Ver mis tarjetas
          </button>
        </div>
      )}

      <AnimatePresence>
        {showCards && data && (
          <MyCardsModal
            slug={slug}
            cards={mine}
            cardsPerNumber={data.cardsPerNumber}
            canEdit={canEdit}
            editUntil={editUntil}
            onChanged={loadCards}
            onClose={() => setShowCards(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

const BUY_ERR: Record<string, string> = {
  unauthenticated: "Inicia sesión para comprar tarjetas.",
  insufficient_funds: "Lingotes insuficientes. Recarga para continuar.",
  raffle_not_open: "Este bingo no está abierto para comprar.",
  sold_out: "Se agotaron las tarjetas.",
  per_user_limit: "Superas el máximo de tarjetas por persona.",
  requires_paid_user: "Solo para Suertudos: recarga con dinero real para participar.",
  buy_disabled: "Tu cuenta no puede comprar por ahora.",
};

// Full-screen modal that shows every card with plenty of room. Tap any number
// to change it (no edit mode); regenerate per card. Both actions have a visible
// cooldown. Auto-saves on each change.
function MyCardsModal({ slug, cards, cardsPerNumber, canEdit, editUntil, onChanged, onClose }: {
  slug: string; cards: Card[]; cardsPerNumber: Record<number, number>; canEdit: boolean; editUntil: number | null; onChanged: () => void; onClose: () => void;
}) {
  // Lock body scroll + close on Escape while the modal is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex justify-center bg-slate-950/60 backdrop-blur-sm sm:items-center sm:p-4"
    >
      <motion.div
        initial={{ y: "100%", opacity: 0.6 }} animate={{ y: 0, opacity: 1 }} exit={{ y: "100%", opacity: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        className="mt-auto flex max-h-[94svh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-slate-50 shadow-2xl sm:mt-0 sm:max-h-[92svh] sm:rounded-3xl"
      >
        {/* header */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100"><Icon name="clover" className="h-4 w-4 text-emerald-600" /></span>
            <div>
              <h3 className="text-base font-bold text-slate-900">Mis tarjetas <span className="text-slate-400">({cards.length})</span></h3>
              <p className="text-[11px] text-slate-500">
                {canEdit
                  ? <>Editables hasta las <strong>{editUntil ? new Date(editUntil).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }) : "que empiece"}</strong></>
                  : "Edición cerrada"}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200"><Icon name="x" className="h-4 w-4" /></button>
        </div>

        {/* how-to hint */}
        {canEdit && (
          <div className="flex items-center gap-2 border-b border-slate-100 bg-emerald-50 px-4 py-2 text-[11px] font-medium text-emerald-800 sm:px-5">
            <Icon name="info" className="h-3.5 w-3.5 shrink-0" /> Toca cualquier número para cambiarlo. El <strong>×N</strong> muestra cuántas cartillas lo tienen.
          </div>
        )}

        {/* cards */}
        <div className="grid gap-5 overflow-y-auto p-4 sm:grid-cols-2 sm:p-5">
          {cards.map((c) => (
            <CardView key={c.id} slug={slug} card={c} cardsPerNumber={cardsPerNumber} canEdit={canEdit} onChanged={onChanged} />
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

function CardView({ slug, card, cardsPerNumber, canEdit, onChanged }: {
  slug: string; card: Card; cardsPerNumber: Record<number, number>; canEdit: boolean; onChanged: () => void;
}) {
  const cols: Record<string, (number | null)[]> = { B: card.B, I: card.I, N: card.N, G: card.G, O: card.O };
  const [picker, setPicker] = useState<{ col: number; row: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [regenUntil, setRegenUntil] = useState(0);
  const [pickUntil, setPickUntil] = useState(0);

  const now = useNow(regenUntil > 0 || pickUntil > 0);
  const regenLeft = Math.max(0, Math.ceil((regenUntil - now) / 1000));
  const pickLeft = Math.max(0, Math.ceil((pickUntil - now) / 1000));
  useEffect(() => {
    if (regenUntil && regenLeft === 0) setRegenUntil(0);
    if (pickUntil && pickLeft === 0) setPickUntil(0);
  }, [regenLeft, pickLeft, regenUntil, pickUntil]);

  const pop = (n: number | null) => (n == null ? 0 : cardsPerNumber[n] ?? 0);

  async function changeNumber(col: number, row: number, value: number) {
    setPicker(null);
    const key = COLS[col][0] as string;
    if (cols[key][row] === value) return; // same number: no-op, no cooldown
    const next: Record<string, (number | null)[]> = { ...cols, [key]: cols[key].map((x, i) => (i === row ? value : x)) };
    setBusy(true); setErr("");
    try {
      const payload = { cols: { B: next.B, I: next.I, N: (next.N.filter((x) => x != null) as number[]), G: next.G, O: next.O } };
      const res = await fetch(`/api/bingo/cards/${card.id}`, { method: "PATCH", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(EDIT_ERR[d.error] ?? "No se pudo guardar."); return; }
      setPickUntil(Date.now() + PICK_COOLDOWN_MS); onChanged();
    } catch { setErr("Error de red."); }
    finally { setBusy(false); }
  }
  async function regen() {
    if (regenLeft > 0 || busy) return;
    setBusy(true); setErr("");
    try {
      const res = await fetch(`/api/bingo/cards/${card.id}/regenerate`, { method: "POST", credentials: "include" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(EDIT_ERR[d.error] ?? "No se pudo regenerar."); return; }
      setRegenUntil(Date.now() + REGEN_COOLDOWN_MS); onChanged();
    } catch { setErr("Error de red."); }
    finally { setBusy(false); }
  }

  const locked = !canEdit || busy || pickLeft > 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* header */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/80 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 text-xs font-black text-white shadow-sm">{card.seq}</span>
          <span className="text-sm font-bold text-slate-700">Tarjeta {card.seq}</span>
        </div>
        {canEdit && (
          <motion.button whileTap={{ scale: regenLeft > 0 ? 1 : 0.95 }} type="button" onClick={regen} disabled={busy || regenLeft > 0} className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400">
            <Icon name="refresh" className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} /> {regenLeft > 0 ? `${regenLeft}s` : "Regenerar"}
          </motion.button>
        )}
      </div>

      <div className="p-3">
        {/* BINGO header */}
        <div className="grid grid-cols-5 gap-1.5">
          {COLS.map(([, L]) => (
            <div key={L} className="flex h-8 items-center justify-center rounded-lg text-sm font-black text-white shadow-sm" style={{ background: LETTER_BG[L] }}>{L}</div>
          ))}
        </div>

        {/* cells */}
        <div className="mt-1.5 grid grid-cols-5 gap-1.5">
          {[0, 1, 2, 3, 4].map((r) =>
            COLS.map(([key], c) => {
              const v = cols[key as string][r];
              const free = v == null;
              const tappable = canEdit && !free && !locked;
              const isActive = picker?.col === c && picker?.row === r;
              return (
                <motion.button
                  type="button"
                  key={`${r}-${c}`}
                  disabled={free || !canEdit}
                  whileTap={tappable ? { scale: 0.9 } : undefined}
                  onClick={() => tappable && setPicker({ col: c, row: r })}
                  className={`relative flex aspect-square flex-col items-center justify-center rounded-xl text-base font-bold transition ${
                    free
                      ? "bg-gradient-to-br from-emerald-400 to-emerald-600 text-white"
                      : isActive
                        ? "bg-emerald-100 text-slate-900 ring-2 ring-emerald-400"
                        : canEdit
                          ? "bg-slate-50 text-slate-800 ring-1 ring-slate-200 hover:bg-emerald-50 hover:ring-emerald-300"
                          : "bg-slate-50 text-slate-700 ring-1 ring-slate-100"
                  } ${locked && !free ? "opacity-60" : ""}`}
                >
                  {free ? (
                    <motion.span animate={{ rotate: [0, -6, 6, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}>
                      <Icon name="clover" className="h-6 w-6" />
                    </motion.span>
                  ) : (
                    <>
                      <span className="leading-none">{v}</span>
                      <span className="mt-0.5 text-[9px] font-semibold leading-none text-slate-400">×{pop(v)}</span>
                    </>
                  )}
                </motion.button>
              );
            })
          )}
        </div>

        {/* status line */}
        {pickLeft > 0 ? (
          <div className="mt-2 flex items-center justify-center gap-1.5 rounded-lg bg-slate-50 py-1.5 text-[11px] font-medium text-slate-500">
            <Icon name="clock" className="h-3.5 w-3.5" /> Puedes cambiar otro número en {pickLeft}s
          </div>
        ) : busy ? (
          <p className="mt-2 text-center text-[11px] font-medium text-slate-400">Guardando…</p>
        ) : err ? (
          <p className="mt-2 text-center text-xs font-medium text-red-600">{err}</p>
        ) : canEdit ? (
          <p className="mt-2 text-center text-[11px] text-slate-400">Toca un número para cambiarlo</p>
        ) : null}
      </div>

      {/* number picker */}
      <AnimatePresence>
        {picker && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setPicker(null)}
            className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/50 p-4 backdrop-blur-sm sm:items-center"
          >
            <motion.div
              initial={{ y: 40, opacity: 0, scale: 0.97 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 30, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 26 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xs rounded-2xl bg-white p-4 shadow-2xl"
            >
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg text-sm font-black text-white" style={{ background: LETTER_BG[COLS[picker.col][1]] }}>{COLS[picker.col][1]}</span>
                  <span className="text-sm font-bold text-slate-700">Elige {COLS[picker.col][2]}–{COLS[picker.col][3]}</span>
                </div>
                <button type="button" onClick={() => setPicker(null)} aria-label="Cerrar" className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"><Icon name="x" className="h-3.5 w-3.5" /></button>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {Array.from({ length: 15 }, (_, i) => COLS[picker.col][2] + i).map((n) => {
                  const key = COLS[picker.col][0] as string;
                  const used = cols[key].includes(n) && cols[key][picker.row] !== n;
                  const current = cols[key][picker.row] === n;
                  return (
                    <motion.button
                      type="button"
                      key={n}
                      disabled={used}
                      whileTap={used ? undefined : { scale: 0.9 }}
                      onClick={() => changeNumber(picker.col, picker.row, n)}
                      className={`flex aspect-square flex-col items-center justify-center rounded-xl text-sm font-bold transition ${current ? "bg-emerald-600 text-white shadow" : used ? "cursor-not-allowed bg-slate-100 text-slate-300" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:ring-emerald-400"}`}
                    >
                      <span className="leading-none">{n}</span>
                      <span className={`mt-0.5 text-[9px] font-semibold leading-none ${current ? "text-white/70" : "text-slate-400"}`}>×{pop(n)}</span>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const EDIT_ERR: Record<string, string> = {
  edit_closed: "La edición cerró (faltan menos de 5 min para el sorteo).",
  not_editable: "Ya no se puede editar.",
  invalid_card: "Números inválidos para el cartón clásico.",
  duplicate_card: "Otra cartilla ya tiene exactamente esos números. Cambia alguno.",
  unauthenticated: "Inicia sesión.",
};
