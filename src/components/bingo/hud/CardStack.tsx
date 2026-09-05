// "Mis tarjetas": every tarjeta as a clickable thumbnail preview.
// Desktop: 3-column grid anchored bottom-left that grows upward; past ~9
// tarjetas it caps at ~50% of the viewport height and scrolls internally.
// Mobile: single horizontal scrolling row. Clicking a thumbnail opens that
// tarjeta (up to 3 floating on desktop / the active one on mobile).

import { motion } from "framer-motion";
import Icon from "../../Icon";
import { cardColumns, markedCount, type BingoCard } from "../types";

export default function CardStack({
  cards,
  openIndexes,
  bestIndex,
  drawn,
  onSelect,
  horizontal = false,
}: {
  cards: BingoCard[];
  openIndexes: number[];
  bestIndex?: number;
  drawn: Set<number>;
  onSelect: (i: number) => void;
  horizontal?: boolean;
}) {
  const wrap = horizontal
    ? "flex max-w-full flex-row gap-2 overflow-x-auto px-1 pb-1 pt-2"
    : "grid max-h-[48vh] grid-cols-3 gap-2 overflow-y-auto p-1 pt-2 scrollbar-thin";
  return (
    <div className={`pointer-events-auto ${wrap}`}>
      {cards.map((card, i) => {
        const open = openIndexes.includes(i);
        const marks = markedCount(card, drawn);
        return (
          <motion.button
            key={i}
            type="button"
            onClick={() => onSelect(i)}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.95 }}
            className={`relative shrink-0 rounded-xl p-1.5 shadow-lg backdrop-blur transition-colors ${
              open ? "bg-emerald-500 ring-2 ring-white" : "bg-slate-900/55 hover:bg-slate-900/70"
            }`}
            aria-label={`Tarjeta ${i + 1}, ${marks} de 25 marcados${open ? ", abierta" : ""}`}
          >
            <MiniGrid card={card} drawn={drawn} open={open} />
            <span
              className={`absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-black shadow ${
                open ? "bg-white text-emerald-600" : "bg-amber-400 text-slate-900"
              }`}
            >
              {i + 1}
            </span>
            {i === bestIndex && (
              <span
                className="absolute -left-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white shadow ring-1 ring-white"
                title="Tu tarjeta mas cerca de llenarse"
              >
                <Icon name="star" className="h-2.5 w-2.5" />
              </span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}

function MiniGrid({ card, drawn, open }: { card: BingoCard; drawn: Set<number>; open: boolean }) {
  const cols = cardColumns(card);
  return (
    <div className="grid grid-cols-5 gap-[3px]">
      {[0, 1, 2, 3, 4].map((r) =>
        [0, 1, 2, 3, 4].map((c) => {
          const v = cols[c][r];
          const free = v === null;
          const marked = free || drawn.has(v!);
          if (free) {
            return (
              <Icon
                key={`${r}-${c}`}
                name="clover"
                className={`h-[7px] w-[7px] ${open ? "text-white" : "text-emerald-400"}`}
              />
            );
          }
          return (
            <span
              key={`${r}-${c}`}
              className={`h-[7px] w-[7px] rounded-[2px] ${
                marked ? (open ? "bg-white" : "bg-emerald-400") : open ? "bg-emerald-700/60" : "bg-white/25"
              }`}
            />
          );
        })
      )}
    </div>
  );
}
