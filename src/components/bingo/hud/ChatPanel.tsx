// Chat HUD (bottom-right on desktop, sheet on mobile).
// Reaction picker sits ABOVE the text input; sending a reaction floats an
// emoji over the 3D scene (handled by the parent).

import { useEffect, useRef, useState } from "react";
import Icon from "../../Icon";
import type { ChatMsg } from "../types";

const REACTIONS = ["🎉", "🔥", "🍀", "😂", "😱", "👏", "💚", "🤞"];

export default function ChatPanel({
  chat,
  onSend,
  onReaction,
  className = "",
}: {
  chat: ChatMsg[];
  onSend: (text: string) => void;
  onReaction: (emoji: string) => void;
  className?: string;
}) {
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.length]);

  const send = () => {
    if (!text.trim()) return;
    onSend(text);
    setText("");
  };

  return (
    <div className={`pointer-events-auto flex flex-col overflow-hidden rounded-2xl bg-slate-900/60 shadow-2xl ring-1 ring-white/10 backdrop-blur-md ${className}`}>
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <Icon name="chat" className="h-4 w-4 text-emerald-300" />
        <span className="text-xs font-bold uppercase tracking-wider text-white/90">Chat en vivo</span>
      </div>

      <div ref={listRef} className="scrollbar-thin min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-2">
        {chat.map((m) => (
          <div key={m.id} className="text-[13px] leading-snug">
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
        ))}
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
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          maxLength={160}
          placeholder="Escribe un mensaje..."
          className="min-w-0 flex-1 rounded-xl bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 outline-none ring-emerald-400/60 focus:ring-2"
        />
        <button
          type="button"
          onClick={send}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white shadow hover:bg-emerald-400 active:scale-95"
          aria-label="Enviar mensaje"
        >
          <Icon name="send" className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
