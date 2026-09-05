// An OPEN tarjeta: crisp 2D HUD (not 3D). Marks numbers live as balls are
// called; the center is FREE with the qori clover. Column header letters stay
// gray until that column completes, then light up. Cells are interactive: a
// called (green) cell can be daubed with a diagonal line (toggle), and a cell
// not yet drawn can be circled in red as a "waiting for this" reminder (the
// circle auto-clears when the ball comes out). Hovering a cell shows its stats.
// On desktop it floats: draggable from its top, with minimize / close.

import { useState } from "react";
import { AnimatePresence, motion, useDragControls } from "framer-motion";
import Icon from "../../Icon";
import { LETTERS, LETTER_COLORS, cardColumns, closestColumn, isMarked, markedCount, remainingToFill, type BingoCard } from "../types";

export default function ActiveCard({
  card,
  drawn,
  currentNumber,
  compact = false,
  index,
  floating = false,
  minimized = false,
  onMinimize,
  onClose,
  constraintsRef,
  daubs,
  circles,
  onCell,
  drawnOrder,
  cardsPerNumber,
  totalCards,
}: {
  card: BingoCard;
  drawn: Set<number>;
  currentNumber: number | null;
  compact?: boolean;
  index?: number;
  floating?: boolean;
  minimized?: boolean;
  onMinimize?: () => void;
  onClose?: () => void;
  constraintsRef?: React.RefObject<HTMLDivElement | null>;
  /** Player-set marks, keyed `${index}:${r}:${c}`. */
  daubs?: Set<string>;
  circles?: Set<string>;
  /** Called with the clicked cell so the parent toggles daub/circle + sound. */
  onCell?: (r: number, c: number, value: number, isDrawn: boolean) => void;
  /** For the hover tooltip. */
  drawnOrder?: number[];
  cardsPerNumber?: Record<number, number>;
  totalCards?: number;
}) {
  const cols = cardColumns(card);
  const marks = markedCount(card, drawn);
  const doneCols = cols.map((col) => col.every((v) => isMarked(v, drawn)));
  const remaining = remainingToFill(card, drawn);
  const closest = closestColumn(card, drawn);
  const hit = currentNumber != null && cols.some((col) => col.includes(currentNumber));
  const idx = index ?? 0;
  const interactive = !!onCell;
  const cell = compact ? "h-10 w-10 text-sm" : "h-10 w-10 text-sm sm:h-11 sm:w-11 sm:text-base";
  const dragControls = useDragControls();
  const startDrag = (e: React.PointerEvent) => {
    if (floating) dragControls.start(e);
  };
  const [hover, setHover] = useState<number | null>(null);

  const tip = hover != null && totalCards ? (() => {
    const drawnIdx = drawnOrder ? drawnOrder.indexOf(hover) : -1;
    const inCards = cardsPerNumber?.[hover] ?? 0;
    if (drawnIdx >= 0)
      return { l1: `La bola ${hover} salio en la sacada #${drawnIdx + 1}`, l2: `${inCards}/${totalCards} cartillas tienen la bola ${hover}` };
    return { l1: `La bola ${hover} aun no sale`, l2: `${inCards}/${totalCards} cartillas esperan la bola ${hover}` };
  })() : null;

  const body = (
    <div className="pointer-events-auto relative select-none rounded-2xl bg-white/95 p-2 shadow-2xl ring-1 ring-black/5 backdrop-blur sm:p-2.5">
      {/* subtle whole-card glow when a called ball is on this tarjeta */}
      {hit && (
        <motion.div
          key={`hit-${currentNumber}`}
          initial={{ opacity: 0.9 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 1.1, ease: "easeOut" }}
          className="pointer-events-none absolute -inset-0.5 rounded-2xl ring-4 ring-emerald-400"
        />
      )}

      {/* hover tooltip */}
      <AnimatePresence>
        {tip && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="pointer-events-none absolute -top-2 left-1/2 z-30 w-max max-w-[240px] -translate-x-1/2 -translate-y-full rounded-lg bg-slate-900/90 px-2.5 py-1.5 text-center text-[11px] font-semibold leading-tight text-white shadow-xl"
          >
            <div>{tip.l1}</div>
            <div className="text-emerald-300">{tip.l2}</div>
          </motion.div>
        )}
      </AnimatePresence>

      {(floating || index != null) && (
        <div
          onPointerDown={startDrag}
          className={`mb-1.5 flex items-center gap-1.5 px-0.5 ${floating ? "cursor-grab touch-none active:cursor-grabbing" : ""}`}
        >
          <Icon name="clover" className="h-3.5 w-3.5 text-emerald-500" />
          <span className="text-[11px] font-black uppercase tracking-wider text-slate-700">
            Tarjeta {index != null ? index + 1 : ""}
          </span>
          <span className="text-[10px] font-bold tabular-nums text-slate-400">{marks}/25</span>
          {floating && (
            <span className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={onMinimize}
                onPointerDown={(e) => e.stopPropagation()}
                aria-label={minimized ? `Restaurar tarjeta ${idx + 1}` : `Minimizar tarjeta ${idx + 1}`}
                className="flex h-5 w-5 items-center justify-center rounded-md bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
              >
                <Icon name={minimized ? "chevron-up" : "minus"} className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={onClose}
                onPointerDown={(e) => e.stopPropagation()}
                aria-label={`Cerrar tarjeta ${idx + 1}`}
                className="flex h-5 w-5 items-center justify-center rounded-md bg-slate-100 text-slate-500 transition hover:bg-rose-100 hover:text-rose-600"
              >
                <Icon name="x" className="h-3 w-3" />
              </button>
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-5 gap-1">
        {LETTERS.map((L, c) => {
          const done = doneCols[c];
          return (
            <motion.div
              key={`${L}-${done ? "on" : "off"}`}
              onPointerDown={startDrag}
              initial={done ? { scale: 0.55 } : false}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 420, damping: 16 }}
              className={`flex items-center justify-center rounded-lg font-black ${
                compact ? "h-7 text-sm" : "h-7 text-sm sm:h-8 sm:text-base"
              } ${done ? "text-white" : L === closest ? "bg-amber-100 text-amber-500 ring-1 ring-amber-300" : "bg-slate-100 text-slate-300"} ${
                floating ? "cursor-grab touch-none active:cursor-grabbing" : ""
              }`}
              style={done ? { background: LETTER_COLORS[L], boxShadow: `0 2px 8px ${LETTER_COLORS[L]}55` } : undefined}
            >
              {L}
            </motion.div>
          );
        })}

        {!minimized &&
          [0, 1, 2, 3, 4].map((r) =>
            [0, 1, 2, 3, 4].map((c) => {
              const v = cols[c][r];
              const free = v === null;
              const marked = free || (v !== null && drawn.has(v));
              const isCurrent = v !== null && v === currentNumber;
              const key = `${idx}:${r}:${c}`;
              const daubed = !free && !!daubs?.has(key);
              const circled = !free && !marked && !!circles?.has(key);
              const Tag = interactive && !free ? "button" : "div";
              return (
                <Tag
                  key={`${r}-${c}`}
                  {...(interactive && !free
                    ? {
                        type: "button" as const,
                        onClick: () => onCell!(r, c, v!, marked),
                        onMouseEnter: () => setHover(v),
                        onMouseLeave: () => setHover((h) => (h === v ? null : h)),
                        onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
                      }
                    : {})}
                  className={`relative flex items-center justify-center rounded-lg font-bold tabular-nums ${cell} ${
                    marked ? "text-white" : "bg-slate-100 text-slate-700"
                  } ${interactive && !free ? "cursor-pointer transition hover:brightness-105" : ""}`}
                >
                  {marked && (
                    <motion.div
                      initial={free ? false : { scale: 0.3, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 420, damping: 20 }}
                      className={`absolute inset-0 rounded-lg shadow-[inset_0_-2px_4px_rgba(0,0,0,0.15)] ${
                        free ? "bg-gradient-to-br from-emerald-400 to-emerald-600" : "bg-emerald-500"
                      }`}
                    />
                  )}
                  <span className="relative z-10 flex items-center justify-center">
                    {free ? (
                      <Icon name="clover" className={`text-white drop-shadow ${compact ? "h-6 w-6" : "h-6 w-6 sm:h-7 sm:w-7"}`} />
                    ) : (
                      v
                    )}
                  </span>

                  {/* player daub: diagonal line across a called cell */}
                  {daubed && (
                    <motion.span
                      initial={{ scaleX: 0, opacity: 0 }}
                      animate={{ scaleX: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 24 }}
                      className="pointer-events-none absolute left-1/2 top-1/2 z-20 h-[3px] w-[132%] -translate-x-1/2 -translate-y-1/2 -rotate-[28deg] rounded-full bg-rose-600 shadow"
                    />
                  )}
                  {/* player reminder: red circle on a not-yet-drawn cell */}
                  {circled && (
                    <motion.span
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="pointer-events-none absolute inset-[3px] z-20 rounded-full ring-2 ring-rose-500"
                    />
                  )}

                  <AnimatePresence>
                    {isCurrent && marked && !free && (
                      <motion.span
                        key="flash"
                        initial={{ opacity: 0.9, scale: 1.6 }}
                        animate={{ opacity: 0, scale: 1 }}
                        transition={{ duration: 0.7, ease: "easeOut" }}
                        className="absolute inset-0 z-20 rounded-lg ring-4 ring-amber-300"
                      />
                    )}
                  </AnimatePresence>
                </Tag>
              );
            })
          )}
      </div>

      {!minimized && (
        <div className="mt-1.5 flex items-center justify-center">
          {remaining === 0 ? (
            <span className="rounded-full bg-emerald-500 px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wide text-white">
              Carton lleno
            </span>
          ) : (
            <span className={`text-[11px] font-bold tabular-nums ${remaining <= 3 ? "text-amber-600" : "text-slate-400"}`}>
              {remaining <= 3 ? "Casi. " : ""}Te falta{remaining === 1 ? "" : "n"} {remaining} para llenar
            </span>
          )}
        </div>
      )}
    </div>
  );

  if (!floating) return body;

  return (
    <motion.div
      drag
      dragControls={dragControls}
      dragListener={false}
      dragConstraints={constraintsRef}
      dragElastic={0.08}
      dragMomentum={false}
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      transition={{ type: "spring", stiffness: 380, damping: 28 }}
      className="pointer-events-auto"
    >
      {body}
    </motion.div>
  );
}
