// Chat HUD (bottom-right on desktop, sheet on mobile).
// Live-chat QoL:
//  - windowed: only the last PAGE messages render; "cargar 50 mas" reveals older
//    history without jank (scroll position preserved).
//  - smart autoscroll: sticks to the bottom only if you are already there; if you
//    scrolled up to read, a "N nuevos" button appears to jump back to the latest.
//  - character limits with a live counter near the cap.
// Reaction picker sits ABOVE the text input; sending a reaction floats an emoji
// over the 3D scene (handled by the parent).

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Icon from "../../Icon";
import { PlayerCard } from "./ParticipantsPanel";
import type { ChatMsg, Participant } from "../types";

const REACTIONS = ["🎉", "🔥", "🍀", "😂", "😱", "👏", "💚", "🤞"];
const PAGE = 50; // messages rendered per window
const MAX = 200; // max characters per message
const NEAR = MAX - 40; // show the counter when this close to the cap

export default function ChatPanel({
  chat,
  onSend,
  onReaction,
  className = "",
  participants,
  meId,
  onHoverUser,
}: {
  chat: ChatMsg[];
  onSend: (text: string) => void;
  onReaction: (emoji: string) => void;
  className?: string;
  /** For the hover card + scene spotlight when hovering a chat name. */
  participants?: Participant[];
  meId?: string;
  onHoverUser?: (userId: string | null) => void;
}) {
  const [text, setText] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE);
  const [atBottom, setAtBottom] = useState(true);
  const [unseen, setUnseen] = useState(0);
  const [hovered, setHovered] = useState<{ userId: string; top: number; below: boolean } | null>(null);

  const { byNick, byId } = useMemo(() => {
    const byNick = new Map<string, Participant>();
    const byId = new Map<string, Participant>();
    for (const p of participants ?? []) {
      if (!byNick.has(p.nickname)) byNick.set(p.nickname, p);
      byId.set(p.userId, p);
    }
    return { byNick, byId };
  }, [participants]);

  const listRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const enterName = (e: React.MouseEvent, nickname: string) => {
    const p = byNick.get(nickname);
    if (!p) return;
    const row = e.currentTarget as HTMLElement;
    const wrap = wrapRef.current;
    if (!wrap) return;
    const top = row.getBoundingClientRect().top - wrap.getBoundingClientRect().top;
    setHovered({ userId: p.userId, top, below: top < 110 });
    onHoverUser?.(p.userId);
  };
  const leaveName = () => {
    setHovered(null);
    onHoverUser?.(null);
  };
  const atBottomRef = useRef(true);
  const prevLen = useRef(chat.length);
  const loadAnchor = useRef<number | null>(null);

  const total = chat.length;
  const start = Math.max(0, total - visibleCount);
  const visible = chat.slice(start);
  const canLoadMore = start > 0;

  const scrollToBottom = (smooth = false) => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  };

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    atBottomRef.current = nearBottom;
    setAtBottom(nearBottom);
    if (nearBottom && unseen) setUnseen(0);
  };

  // New messages: stick to the bottom if the reader is there, else count unseen.
  useEffect(() => {
    const grew = total - prevLen.current;
    prevLen.current = total;
    if (grew <= 0) return;
    if (atBottomRef.current) requestAnimationFrame(() => scrollToBottom());
    else setUnseen((n) => n + grew);
  }, [total]);

  // Land at the bottom on first mount.
  useEffect(() => {
    scrollToBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Preserve the reading position when older messages are prepended.
  useLayoutEffect(() => {
    if (loadAnchor.current == null) return;
    const el = listRef.current;
    if (el) el.scrollTop += el.scrollHeight - loadAnchor.current;
    loadAnchor.current = null;
  }, [visibleCount]);

  const loadMore = () => {
    const el = listRef.current;
    loadAnchor.current = el ? el.scrollHeight : 0;
    setVisibleCount((c) => c + PAGE);
  };

  const jumpToLatest = () => {
    atBottomRef.current = true;
    setAtBottom(true);
    setUnseen(0);
    requestAnimationFrame(() => scrollToBottom(true));
  };

  const send = () => {
    const t = text.trim();
    if (!t || t.length > MAX) return;
    onSend(t);
    setText("");
    atBottomRef.current = true;
    setAtBottom(true);
    setUnseen(0);
  };

  const remaining = MAX - text.length;

  return (
    <div className={`pointer-events-auto flex flex-col overflow-hidden rounded-2xl bg-slate-900/60 shadow-2xl ring-1 ring-white/10 backdrop-blur-md ${className}`}>
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <Icon name="chat" className="h-4 w-4 text-emerald-300" />
        <span className="text-xs font-bold uppercase tracking-wider text-white/90">Chat en vivo</span>
      </div>

      {/* message list (windowed) + jump-to-latest overlay */}
      <div ref={wrapRef} className="relative min-h-0 flex-1">
        <div
          ref={listRef}
          onScroll={onScroll}
          className="scrollbar-thin absolute inset-0 space-y-1.5 overflow-y-auto px-3 py-2"
        >
          {canLoadMore && (
            <button
              type="button"
              onClick={loadMore}
              className="mx-auto mb-1 flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold text-white/80 transition hover:bg-white/20"
            >
              <Icon name="refresh" className="h-3 w-3" />
              Cargar {PAGE} mensajes mas
            </button>
          )}
          {visible.map((m) => {
            const known = byNick.has(m.nickname);
            return (
              <div
                key={m.id}
                onMouseEnter={known ? (e) => enterName(e, m.nickname) : undefined}
                onMouseLeave={known ? leaveName : undefined}
                className={`text-[13px] leading-snug ${known ? "cursor-pointer rounded px-1 -mx-1 transition hover:bg-white/5" : ""}`}
              >
                <span className={`font-bold ${m.suertudo ? "text-amber-300" : "text-emerald-300"}`}>
                  {m.nickname}
                </span>
                {m.suertudo && (
                  <span className="ml-1 rounded bg-amber-400/20 px-1 py-px align-middle text-[9px] font-black uppercase tracking-wide text-amber-300">
                    Suertudo
                  </span>
                )}
                <span className="ml-1.5 break-words text-white/90">{m.text}</span>
              </div>
            );
          })}
        </div>

        {/* hover player card, anchored to the hovered name */}
        {hovered && byId.get(hovered.userId) && (
          <div
            className={`pointer-events-none absolute left-2 right-2 z-40 ${hovered.below ? "" : "-translate-y-full"}`}
            style={{ top: hovered.below ? hovered.top + 22 : hovered.top - 4 }}
          >
            <PlayerCard p={byId.get(hovered.userId)!} meId={meId ?? ""} />
          </div>
        )}

        {!atBottom && (
          <button
            type="button"
            onClick={jumpToLatest}
            className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-emerald-500 px-3 py-1 text-[11px] font-bold text-white shadow-lg transition hover:bg-emerald-400"
          >
            {unseen > 0 ? `${unseen} nuevo${unseen === 1 ? "" : "s"}` : "Ir al ultimo"}
            <Icon name="chevron-down" className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* reaction picker ABOVE the input */}
      <div className="flex items-center justify-between gap-1 border-t border-white/10 px-2 py-1.5">
        {REACTIONS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onReaction(e)}
            className="rounded-lg px-1.5 py-0.5 text-lg transition-transform hover:scale-125 active:scale-95"
            aria-label={`Enviar reaccion ${e}`}
          >
            {e}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 border-t border-white/10 p-2">
        <div className="relative min-w-0 flex-1">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            maxLength={MAX}
            placeholder="Escribe un mensaje..."
            className="w-full rounded-xl bg-white/10 px-3 py-2 pr-10 text-sm text-white placeholder-white/40 outline-none ring-emerald-400/60 focus:ring-2"
          />
          {text.length >= NEAR && (
            <span
              className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold tabular-nums ${
                remaining <= 0 ? "text-rose-300" : "text-white/50"
              }`}
            >
              {remaining}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={send}
          disabled={!text.trim()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white shadow transition hover:bg-emerald-400 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Enviar mensaje"
        >
          <Icon name="send" className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
