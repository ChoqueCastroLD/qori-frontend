// Pre-game bingo participation (shown on the raffle page while it sells):
// buy tarjetas, then PICK/EDIT their numbers (within the classic column ranges,
// no repeats) or REGENERATE — allowed until 5 min before the draw. Each number
// shows how many cartillas across the room already hold it.

import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import Lingote from "./Lingote";
import Skeleton from "./Skeleton";
import QuickTopup from "./QuickTopup";

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

      {/* My tarjetas: pick numbers / regenerate */}
      {myCount > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-semibold text-slate-900"><Icon name="clover" className="h-5 w-5 text-emerald-500" /> Mis tarjetas ({myCount})</h3>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {canEdit
              ? <>Puedes cambiar tus números o regenerar hasta <strong>{editUntil ? new Date(editUntil).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }) : "que empiece"}</strong> (5 min antes del sorteo). El número pequeño indica cuántas cartillas lo tienen.</>
              : <>La edición está cerrada (faltan menos de 5 min para el sorteo).</>}
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {mine.map((c) => (
              <CardEditor key={c.id} slug={slug} card={c} cardsPerNumber={data!.cardsPerNumber} totalCards={data!.totalCards} canEdit={canEdit} onChanged={loadCards} />
            ))}
          </div>
        </div>
      )}
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

function CardEditor({ slug, card, cardsPerNumber, totalCards, canEdit, onChanged }: {
  slug: string; card: Card; cardsPerNumber: Record<number, number>; totalCards: number; canEdit: boolean; onChanged: () => void;
}) {
  // Local editable copy of the columns (N keeps its null center).
  const [cols, setCols] = useState<Record<string, (number | null)[]>>(() => ({ B: [...card.B], I: [...card.I], N: [...card.N], G: [...card.G], O: [...card.O] }));
  const [edit, setEdit] = useState(false);
  const [picker, setPicker] = useState<{ col: number; row: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const dirtyRef = useRef(false);

  // Reset when the card changes from the server (after save/regenerate reload).
  useEffect(() => { if (!dirtyRef.current) setCols({ B: [...card.B], I: [...card.I], N: [...card.N], G: [...card.G], O: [...card.O] }); }, [card]);

  const pop = (n: number | null) => (n == null ? 0 : cardsPerNumber[n] ?? 0);

  async function save() {
    setBusy(true); setErr("");
    try {
      const payload = { cols: { B: cols.B, I: cols.I, N: (cols.N.filter((x) => x != null) as number[]), G: cols.G, O: cols.O } };
      const res = await fetch(`/api/bingo/cards/${card.id}`, { method: "PATCH", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(EDIT_ERR[d.error] ?? "No se pudo guardar."); return; }
      dirtyRef.current = false; setEdit(false); setPicker(null); onChanged();
    } catch { setErr("Error de red."); }
    finally { setBusy(false); }
  }
  async function regen() {
    setBusy(true); setErr("");
    try {
      const res = await fetch(`/api/bingo/cards/${card.id}/regenerate`, { method: "POST", credentials: "include" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(EDIT_ERR[d.error] ?? "No se pudo regenerar."); return; }
      dirtyRef.current = false; setPicker(null); onChanged();
    } catch { setErr("Error de red."); }
    finally { setBusy(false); }
  }
  function pick(col: number, row: number, value: number) {
    setCols((prev) => {
      const key = COLS[col][0] as string;
      const arr = [...prev[key]];
      arr[row] = value;
      dirtyRef.current = true;
      return { ...prev, [key]: arr };
    });
    setPicker(null);
  }

  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-black uppercase tracking-wider text-slate-500">Tarjeta {card.seq}</span>
        {canEdit && (
          <div className="flex gap-1.5">
            {edit ? (
              <>
                <button type="button" onClick={save} disabled={busy} className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50">Guardar</button>
                <button type="button" onClick={() => { dirtyRef.current = false; setEdit(false); setPicker(null); setCols({ B: [...card.B], I: [...card.I], N: [...card.N], G: [...card.G], O: [...card.O] }); }} className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">Cancelar</button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => setEdit(true)} className="flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"><Icon name="edit" className="h-3 w-3" /> Editar</button>
                <button type="button" onClick={regen} disabled={busy} className="flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50"><Icon name="refresh" className="h-3 w-3" /> Regenerar</button>
              </>
            )}
          </div>
        )}
      </div>
      <div className="grid grid-cols-5 gap-1">
        {COLS.map(([, L]) => (
          <div key={L} className="flex h-6 items-center justify-center rounded font-black text-white" style={{ background: LETTER_BG[L] }}>{L}</div>
        ))}
        {[0, 1, 2, 3, 4].map((r) =>
          COLS.map(([key], c) => {
            const v = cols[key as string][r];
            const free = v == null;
            const editable = edit && !free;
            return (
              <button
                type="button"
                key={`${r}-${c}`}
                disabled={!editable}
                onClick={() => editable && setPicker({ col: c, row: r })}
                className={`relative flex h-11 flex-col items-center justify-center rounded-lg text-sm font-bold ${free ? "bg-emerald-500 text-white" : editable ? "bg-amber-50 text-slate-800 ring-1 ring-amber-300" : "bg-slate-100 text-slate-700"}`}
              >
                {free ? <Icon name="clover" className="h-5 w-5" /> : (
                  <>
                    <span className="leading-none">{v}</span>
                    <span className="text-[9px] font-semibold leading-none text-slate-400">×{pop(v)}</span>
                  </>
                )}
              </button>
            );
          })
        )}
      </div>
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}

      {/* column number picker */}
      {picker && (
        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
          <div className="mb-1 text-[11px] font-semibold text-slate-500">
            Elige un número de la columna <strong>{COLS[picker.col][1]}</strong> ({COLS[picker.col][2]}–{COLS[picker.col][3]}). El ×N es cuántas cartillas lo tienen.
          </div>
          <div className="grid grid-cols-5 gap-1">
            {Array.from({ length: 15 }, (_, i) => COLS[picker.col][2] + i).map((n) => {
              const key = COLS[picker.col][0] as string;
              const used = cols[key].includes(n) && cols[key][picker.row] !== n;
              const current = cols[key][picker.row] === n;
              return (
                <button
                  type="button"
                  key={n}
                  disabled={used}
                  onClick={() => pick(picker.col, picker.row, n)}
                  className={`flex flex-col items-center justify-center rounded py-1 text-xs font-bold ${current ? "bg-emerald-600 text-white" : used ? "cursor-not-allowed bg-slate-200 text-slate-400" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:ring-emerald-400"}`}
                >
                  <span className="leading-none">{n}</span>
                  <span className={`text-[9px] font-semibold leading-none ${current ? "text-white/70" : "text-slate-400"}`}>×{pop(n)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
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
