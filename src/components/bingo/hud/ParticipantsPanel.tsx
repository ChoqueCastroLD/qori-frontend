// Full participants list (mobile "Jugadores" sheet + desktop popover).
// Same info as the 3D crowd: avatar rings (green = you, gold = Suertudo),
// BINGO column progress and marked count, leaders on top.

import Icon from "../../Icon";
import { LETTERS, LETTER_COLORS, type Participant } from "../types";

const PALETTES: [string, string][] = [
  ["#34d399", "#0d9488"], ["#60a5fa", "#4f46e5"], ["#f472b6", "#db2777"], ["#fbbf24", "#ea580c"],
  ["#a78bfa", "#7c3aed"], ["#4ade80", "#16a34a"], ["#38bdf8", "#0369a1"], ["#fb7185", "#be123c"],
];

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function AvatarBubble({ p, isMe, size = 36 }: { p: Participant; isMe: boolean; size?: number }) {
  const [c1, c2] = PALETTES[hashStr(p.userId) % PALETTES.length];
  const ring = isMe && p.suertudo
    ? "0 0 0 2px #10b981, 0 0 0 4px #f59e0b"
    : isMe
      ? "0 0 0 2.5px #10b981"
      : p.suertudo
        ? "0 0 0 2.5px #f59e0b"
        : "0 0 0 1px rgba(255,255,255,0.25)";
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full font-black text-white"
      style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(135deg, ${c1}, ${c2})`, boxShadow: ring }}
    >
      {p.avatarUrl ? (
        <img src={p.avatarUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        p.nickname.slice(0, 2).toUpperCase()
      )}
    </span>
  );
}

export function ProgressChips({ letters, size = "sm" }: { letters: Participant["bestLetters"]; size?: "sm" | "md" }) {
  const cls = size === "sm" ? "h-4 w-4 text-[9px]" : "h-5 w-5 text-[10px]";
  return (
    <span className="flex gap-0.5">
      {LETTERS.map((L) => {
        const done = letters.includes(L);
        return (
          <span
            key={L}
            className={`flex items-center justify-center rounded font-black ${cls} ${done ? "text-white" : "bg-slate-200 text-slate-400"}`}
            style={done ? { background: LETTER_COLORS[L] } : undefined}
          >
            {L}
          </span>
        );
      })}
    </span>
  );
}

/** Global B-I-N-G-O counters: how many tarjetas (all players) completed each column. */
export function LetterTotals({ counts }: { counts: Record<(typeof LETTERS)[number], number> }) {
  return (
    <span className="flex items-center gap-1" aria-label="Tarjetas con columna completa por letra">
      {LETTERS.map((L) => (
        <span key={L} className="flex flex-col items-center gap-0.5">
          <span
            className="flex h-5 w-5 items-center justify-center rounded-md text-[11px] font-black text-white"
            style={{ background: LETTER_COLORS[L] }}
          >
            {L}
          </span>
          <span
            className={`text-[10px] font-black leading-none tabular-nums ${
              counts[L] > 0 ? "text-amber-300" : "text-white/40"
            }`}
          >
            {counts[L]}
          </span>
        </span>
      ))}
    </span>
  );
}

export default function ParticipantsPanel({
  participants,
  meId,
  className = "",
}: {
  participants: Participant[];
  meId: string;
  className?: string;
}) {
  const sorted = [...participants].sort((a, b) => b.marks - a.marks);
  return (
    <div className={`pointer-events-auto flex flex-col overflow-hidden rounded-2xl bg-white/95 shadow-2xl ring-1 ring-black/5 backdrop-blur ${className}`}>
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
        <Icon name="users" className="h-4 w-4 text-emerald-600" />
        <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
          Jugadores <span className="text-slate-400">({participants.length})</span>
        </span>
        <span className="ml-auto flex items-center gap-2 text-[10px] font-semibold text-slate-500">
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full ring-2 ring-emerald-500" />Tu</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full ring-2 ring-amber-400" />Suertudo</span>
        </span>
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        {sorted.map((p, i) => (
          <div
            key={p.userId}
            className={`flex items-center gap-2.5 px-3 py-1.5 ${p.userId === meId ? "bg-emerald-50" : i % 2 ? "bg-slate-50/60" : ""}`}
          >
            <span className={`w-6 text-center text-xs font-black ${i < 3 ? "text-amber-500" : "text-slate-400"}`}>{i + 1}</span>
            <AvatarBubble p={p} isMe={p.userId === meId} size={32} />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">
              {p.nickname}
              {p.userId === meId && <span className="ml-1 text-[10px] font-black uppercase text-emerald-600">(tu)</span>}
            </span>
            <ProgressChips letters={p.bestLetters} />
            <span className="w-9 text-right text-xs font-bold tabular-nums text-slate-500">{p.marks}/25</span>
          </div>
        ))}
      </div>
    </div>
  );
}
