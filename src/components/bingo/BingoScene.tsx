// Live bingo - orchestrator island (client:load).
// Mounts the 3D hall (scene3d.ts), renders every HUD layer on top and keeps
// them in sync with the game state. For the demo the state comes from the
// mock provider (useMockBingo); the real product swaps that hook for a
// WebSocket store that emits the exact same BingoState.

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Icon from "../Icon";
import { useMockBingo, type MockApi } from "./mock";
import type { BingoScene3D } from "./scene3d";
import BallReveal from "./hud/BallReveal";
import { CalledStrip, CountdownRing } from "./hud/CalledBalls";
import ActiveCard from "./hud/ActiveCard";
import CardStack from "./hud/CardStack";
import ChatPanel from "./hud/ChatPanel";
import ParticipantsPanel, { LetterTotals, PlayerCard } from "./hud/ParticipantsPanel";
import WinnersOverlay from "./hud/WinnersOverlay";
import { cardColumns, remainingToFill, type BingoCard } from "./types";
import { playSfx, setVolume as setAudioVolume } from "./audio";

// Desktop: up to this many tarjetas open as floating windows at once.
const MAX_OPEN_CARDS = 3;

// Slot -> horizontal offset from center. Slots 1 (left) and 2 (right) flank the
// machine; slot 0 (center) is used last so the bolillero stays visible.
const SLOT_DX = [0, -272, 272];

type OpenCard = { idx: number; slot: number };

const cardNumberSet = (card: BingoCard): Set<number> => {
  const s = new Set<number>();
  for (const col of cardColumns(card)) for (const v of col) if (v !== null) s.add(v);
  return s;
};

// Compact count: 653 -> "653", 1250 -> "1.2k".
const fmtCount = (n: number): string =>
  n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(n);

export default function BingoScene({ participantCount = 348 }: { participantCount?: number }) {
  const api = useMockBingo(participantCount);
  return <BingoSceneView api={api} />;
}

function BingoSceneView({ api }: { api: MockApi }) {
  const { state, revealPhase, intervalSec, reactions } = api;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<BingoScene3D | null>(null);
  const [webgl, setWebgl] = useState(true);

  // Mobile panels: card open by default (paridad, todo a la vista).
  const [panel, setPanel] = useState<"card" | "chat" | "players" | null>("card");

  // Desktop: open tarjetas as floating draggable windows (max 3). Opening a
  // 4th replaces the oldest one. Each keeps a stable slot for its home spot.
  // Default to the two flanking slots so the bolillero stays clear at center.
  const [openCards, setOpenCards] = useState<OpenCard[]>([
    { idx: 0, slot: 1 },
    { idx: 1, slot: 2 },
  ]);
  const [minimizedIdx, setMinimizedIdx] = useState<number[]>([]);
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);
  const [highlightUser, setHighlightUser] = useState<string | null>(null);
  const [sceneHover, setSceneHover] = useState<{ userId: string; x: number; y: number } | null>(null);
  const [avatarReactions, setAvatarReactions] = useState<{ id: number; emoji: string; x: number; y: number }[]>([]);
  const seenReactions = useRef<Set<number>>(new Set());
  const dragAreaRef = useRef<HTMLDivElement>(null);
  const participantsById = useMemo(
    () => new Map(state.participants.map((p) => [p.userId, p])),
    [state.participants]
  );

  // Settings (config window): toggle chat / reactions, master volume.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const [showReactions, setShowReactions] = useState(true);
  const [volume, setVolume] = useState(0.7);
  useEffect(() => { setAudioVolume(volume); }, [volume]);

  // First-visit "how to play" card (dismissed forever via localStorage).
  const [showHelp, setShowHelp] = useState(false);
  useEffect(() => {
    try {
      if (!localStorage.getItem("qori_bingo_help_seen")) setShowHelp(true);
    } catch { /* ignore */ }
  }, []);
  const dismissHelp = () => {
    setShowHelp(false);
    try { localStorage.setItem("qori_bingo_help_seen", "1"); } catch { /* ignore */ }
  };

  const openTarjeta = (i: number) => {
    setOpenCards((prev) => {
      if (prev.some((o) => o.idx === i)) return prev; // already open
      const used = new Set(prev.map((o) => o.slot));
      const freeSlot = [0, 1, 2].find((s) => !used.has(s));
      if (freeSlot != null && prev.length < MAX_OPEN_CARDS) return [...prev, { idx: i, slot: freeSlot }];
      // replace the oldest open tarjeta, reuse its slot
      const [oldest, ...rest] = prev;
      return [...rest, { idx: i, slot: oldest.slot }];
    });
    setMinimizedIdx((m) => m.filter((x) => x !== i));
    setFocusedIdx(i);
  };
  const closeTarjeta = (i: number) => {
    setOpenCards((prev) => prev.filter((o) => o.idx !== i));
    setMinimizedIdx((m) => m.filter((x) => x !== i));
  };
  const toggleMinimize = (i: number) =>
    setMinimizedIdx((m) => (m.includes(i) ? m.filter((x) => x !== i) : [...m, i]));

  const drawn = useMemo(() => new Set(state.drawnBalls), [state.drawnBalls]);
  const activeCard = state.me.cards[state.me.activeCardIndex];
  const lastNumber = state.drawnBalls.length ? state.drawnBalls[state.drawnBalls.length - 1] : null;

  // My best tarjeta (fewest numbers missing) for the "abrir la mejor" shortcut.
  const myBestIdx = useMemo(() => {
    let bi = 0, bestRem = Infinity;
    state.me.cards.forEach((c, i) => {
      const r = remainingToFill(c, drawn);
      if (r < bestRem) { bestRem = r; bi = i; }
    });
    return bi;
  }, [state.me.cards, drawn]);

  // Toast when a freshly called ball lands on one of MY tarjetas.
  const myNumbers = useMemo(() => {
    const s = new Set<number>();
    for (const c of state.me.cards) for (const n of cardNumberSet(c)) s.add(n);
    return s;
  }, [state.me.cards]);
  const [hitToast, setHitToast] = useState<number | null>(null);
  useEffect(() => {
    if (lastNumber != null && myNumbers.has(lastNumber)) {
      setHitToast(lastNumber);
      playSfx("hit"); // little dopamine arpeggio when a ball hits my tarjetas
      const t = window.setTimeout(() => setHitToast(null), 2600);
      return () => window.clearTimeout(t);
    }
  }, [lastNumber, myNumbers]);

  // Player-set cell marks: diagonal daubs (on called cells) + red circles
  // (reminders on not-yet-drawn cells). Keyed `${cardIndex}:${r}:${c}`.
  const [daubs, setDaubs] = useState<Set<string>>(new Set());
  const [circles, setCircles] = useState<Set<string>>(new Set());
  const onCell = (cardIndex: number) => (r: number, c: number, _v: number, isDrawn: boolean) => {
    const key = `${cardIndex}:${r}:${c}`;
    if (isDrawn) {
      setDaubs((prev) => {
        const n = new Set(prev);
        if (n.has(key)) { n.delete(key); playSfx("undaub"); } else { n.add(key); playSfx("daub"); }
        return n;
      });
    } else {
      setCircles((prev) => {
        const n = new Set(prev);
        if (n.has(key)) { n.delete(key); playSfx("click"); } else { n.add(key); playSfx("circle"); }
        return n;
      });
    }
  };
  // When a circled number finally comes out, drop the circle so it can be daubed.
  useEffect(() => {
    setCircles((prev) => {
      if (!prev.size) return prev;
      let changed = false;
      const n = new Set(prev);
      for (const key of prev) {
        const [ci, r, c] = key.split(":").map(Number);
        const card = state.me.cards[ci];
        const v = card ? cardColumns(card)[c][r] : null;
        if (v != null && drawn.has(v)) { n.delete(key); changed = true; }
      }
      return changed ? n : prev;
    });
  }, [drawn, state.me.cards]);

  // Latest api for async callbacks (three.js loads code-split).
  const apiRef = useRef(api);
  apiRef.current = api;

  // ---- mount / drive the 3D scene (three.js in its own async chunk) -------
  useEffect(() => {
    let scene: BingoScene3D | null = null;
    let cancelled = false;
    (async () => {
      try {
        const mod = await import("./scene3d");
        if (cancelled || !canvasRef.current) return;
        if (!mod.webglAvailable()) {
          setWebgl(false);
          return;
        }
        scene = new mod.BingoScene3D(canvasRef.current);
        sceneRef.current = scene;
        const st = apiRef.current.state;
        scene.setParticipants(st.participants, st.me.userId);
        // Hovering a scene avatar -> spotlight + floating player card.
        scene.setHoverCallback((userId, x, y) => {
          setHighlightUser(userId);
          setSceneHover(userId ? { userId, x, y } : null);
        });
      } catch {
        setWebgl(false);
      }
    })();
    return () => {
      cancelled = true;
      sceneRef.current = null;
      scene?.dispose();
    };
  }, []);

  // Scene events from the game loop.
  useEffect(() => {
    return api.subscribe((ev) => {
      const scene = sceneRef.current;
      if (!scene) return;
      if (ev.type === "draw") scene.drawBall(ev.letter, ev.number);
      if (ev.type === "bingo") scene.celebrate();
      if (ev.type === "reset") scene.setParticipants(api.state.participants, api.state.me.userId);
    });
  }, [api]);

  // Repaint progress chips on the billboards after each official ball.
  useEffect(() => {
    sceneRef.current?.updateProgress(state.participants);
  }, [state.participants]);

  // Spotlight a player in the 3D scene when hovering their chat name / avatar.
  useEffect(() => {
    sceneRef.current?.setHighlight?.(highlightUser);
  }, [highlightUser]);

  // Float each new reaction up over the reacting player's own avatar too.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !showReactions) return;
    for (const r of reactions) {
      if (!r.userId || seenReactions.current.has(r.id)) continue;
      seenReactions.current.add(r.id);
      const pos = scene.worldToScreen?.(r.userId);
      if (!pos) continue;
      const rid = r.id;
      setAvatarReactions((prev) => [...prev.slice(-24), { id: rid, emoji: r.emoji, x: pos.x, y: pos.y }]);
      window.setTimeout(() => setAvatarReactions((prev) => prev.filter((a) => a.id !== rid)), 1700);
    }
    if (seenReactions.current.size > 400) seenReactions.current.clear();
  }, [reactions, showReactions]);

  const countdownActive = revealPhase === null && state.status === "drawing";

  return (
    <div className="relative h-[100svh] w-full overflow-hidden bg-[#f3efe2]">
      {/* ------- 3D scene (or graceful 2D fallback) ------- */}
      {webgl ? (
        <>
          <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" aria-hidden="true" />
          {/* soft broadcast vignette to focus the stage (cheap, pure CSS) */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 120% 90% at 50% 42%, transparent 58%, rgba(31,63,52,0.22) 100%)",
            }}
          />
        </>
      ) : (
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% 100%, #cfe6d8 0%, #ecf3e6 55%, #f3efe2 100%)",
          }}
        >
          <div className="absolute inset-x-0 top-1/3 text-center text-sm font-medium text-emerald-900/50">
            Vista 3D no disponible en este dispositivo - modo simple activado
          </div>
        </div>
      )}

      {/* ------- floating reactions over the scene ------- */}
      <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
        <AnimatePresence>
          {showReactions && reactions.map((r) => (
            <motion.span
              key={r.id}
              initial={{ opacity: 0, y: 0, scale: 0.6 }}
              animate={{ opacity: [0, 1, 1, 0], y: -280, scale: [0.6, 1.25, 1] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2.4, ease: "easeOut" }}
              className="absolute bottom-40 text-3xl"
              style={{ left: `${r.x}%` }}
            >
              {r.emoji}
            </motion.span>
          ))}
        </AnimatePresence>
      </div>

      {/* ------- reactions rising over each reacting avatar ------- */}
      <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
        <AnimatePresence>
          {showReactions && avatarReactions.map((a) => (
            <motion.span
              key={`av-${a.id}`}
              initial={{ opacity: 0, y: 0, scale: 0.5 }}
              animate={{ opacity: [0, 1, 1, 0], y: -74, scale: [0.5, 1.15, 1] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.7, ease: "easeOut" }}
              className="absolute -translate-x-1/2 text-2xl drop-shadow"
              style={{ left: a.x, top: a.y }}
            >
              {a.emoji}
            </motion.span>
          ))}
        </AnimatePresence>
      </div>

      {/* ------- TOP: prize, countdown, reveal, called balls ------- */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col items-center gap-1.5 p-3">
        <div className="flex w-full items-start justify-between gap-2">
          {/* left: ONE compact brand panel: prize + jugadores + BINGO counters */}
          <div className="pointer-events-auto max-w-[56vw] rounded-2xl bg-slate-900/60 p-2.5 backdrop-blur sm:max-w-[290px] sm:p-3">
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="qori" className="h-6 w-6 shrink-0 sm:h-7 sm:w-7" />
              <span className="min-w-0">
                <span className="block truncate text-xs font-bold leading-tight text-white">{state.prize.title}</span>
                <span className="block truncate text-[10px] font-semibold leading-tight text-emerald-300">
                  <span className="hidden sm:inline">Valor aprox. </span>USD {state.prize.valueUsd}
                  <span className="text-white/45"> - {state.participants.length} jugadores</span>
                </span>
              </span>
            </div>
            <div
              className="mt-2 flex items-center gap-2 border-t border-white/10 pt-2"
              title="Cuantas tarjetas de toda la sala ya completaron cada columna"
            >
              <span className="max-w-[52px] text-[9px] font-bold uppercase leading-tight tracking-wider text-white/55 sm:max-w-none sm:whitespace-nowrap">
                Columnas llenas
              </span>
              <span className="ml-auto">
                <LetterTotals counts={state.lettersDone} />
              </span>
            </div>
          </div>

          {/* right: countdown + info link */}
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-2">
              <div className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-rose-500 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white shadow">
                <Icon name="eye" className="h-3 w-3 text-white/90" />
                <span className="tabular-nums" title={`${state.viewers} personas viendo`}>{fmtCount(state.viewers)}</span>
                <span className="h-3 w-px bg-white/30" />
                <Icon name="live" className="h-2.5 w-2.5" />
                En vivo
              </div>
              <CountdownRing secondsLeft={state.nextBallInSec} total={intervalSec} active={countdownActive} />
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowHelp(true)}
                className="pointer-events-auto flex items-center gap-1 rounded-full bg-slate-900/55 px-3 py-1.5 text-[11px] font-bold text-white/90 backdrop-blur transition hover:bg-slate-900/75"
              >
                <Icon name="info" className="h-3.5 w-3.5 text-emerald-300" />
                Como jugar
              </button>
              <button
                type="button"
                onClick={() => setSettingsOpen((v) => !v)}
                aria-label="Configuracion"
                className={`pointer-events-auto flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-bold text-white/90 backdrop-blur transition ${
                  settingsOpen ? "bg-emerald-500" : "bg-slate-900/55 hover:bg-slate-900/75"
                }`}
              >
                <Icon name="settings" className="h-3.5 w-3.5 text-emerald-300" />
                Config
              </button>
            </div>
          </div>
        </div>

        <CalledStrip drawn={state.drawnBalls} />
        <BallReveal ball={state.currentBall} phase={revealPhase} />
      </div>

      {/* ------- settings / config window ------- */}
      <AnimatePresence>
        {settingsOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="pointer-events-auto absolute right-3 top-[68px] z-40 w-60 rounded-2xl bg-slate-900/85 p-3 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur-md"
          >
            <div className="mb-2.5 flex items-center gap-2">
              <Icon name="settings" className="h-4 w-4 text-emerald-300" />
              <span className="text-xs font-black uppercase tracking-wider">Configuracion</span>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                aria-label="Cerrar"
                className="ml-auto flex h-5 w-5 items-center justify-center rounded-md bg-white/10 text-white/70 transition hover:bg-white/20"
              >
                <Icon name="x" className="h-3 w-3" />
              </button>
            </div>
            <SettingToggle icon="chat" label="Chat" checked={showChat} onChange={setShowChat} />
            <SettingToggle icon="smile" label="Reacciones" checked={showReactions} onChange={setShowReactions} />
            <div className="mt-1 flex items-center gap-2 py-1.5">
              <Icon name={volume <= 0 ? "volume-off" : "volume"} className="h-4 w-4 shrink-0 text-emerald-300" />
              <span className="text-[13px] font-semibold">Volumen</span>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(volume * 100)}
                onChange={(e) => setVolume(Number(e.target.value) / 100)}
                aria-label="Volumen"
                className="ml-auto w-24 accent-emerald-500"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ------- BOTTOM desktop: tarjetas grid left, chat right ------- */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 hidden items-end justify-between gap-3 p-4 md:flex">
        <div className="flex flex-col items-start gap-1.5">
          <div className="ml-1 flex items-center gap-1.5">
            <span className="flex items-center gap-1.5 rounded-full bg-slate-900/55 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white/80 backdrop-blur">
              <Icon name="clover" className="h-3 w-3 text-emerald-300" />
              Mis tarjetas ({state.me.cards.length})
            </span>
            <button
              type="button"
              onClick={() => openTarjeta(myBestIdx)}
              className="pointer-events-auto flex items-center gap-1 rounded-full bg-emerald-500/90 px-2.5 py-1 text-[10px] font-bold text-white shadow backdrop-blur transition hover:bg-emerald-500"
            >
              <Icon name="star" className="h-3 w-3" />
              Abrir la mejor
            </button>
          </div>
          <CardStack
            cards={state.me.cards}
            openIndexes={openCards.map((o) => o.idx)}
            bestIndex={myBestIdx}
            drawn={drawn}
            onSelect={openTarjeta}
          />
        </div>

        {showChat && (
          <ChatPanel
            chat={state.chat}
            onSend={api.sendChat}
            onReaction={api.sendReaction}
            className="h-72 w-80"
            participants={state.participants}
            meId={state.me.userId}
            onHoverUser={setHighlightUser}
            reactionsEnabled={showReactions}
          />
        )}
      </div>

      {/* ------- desktop: floating draggable tarjetas (max 3 open) ------- */}
      <div ref={dragAreaRef} className="pointer-events-none absolute inset-0 z-20 hidden md:block">
        <AnimatePresence>
          {openCards.map((o) => (
            <div
              key={o.idx}
              onPointerDown={() => setFocusedIdx(o.idx)}
              className="absolute"
              style={{ left: `calc(50% - 128px + ${SLOT_DX[o.slot]}px)`, bottom: 96, zIndex: focusedIdx === o.idx ? 10 : 1 }}
            >
              <ActiveCard
                card={state.me.cards[o.idx]}
                drawn={drawn}
                currentNumber={lastNumber}
                index={o.idx}
                floating
                minimized={minimizedIdx.includes(o.idx)}
                onMinimize={() => toggleMinimize(o.idx)}
                onClose={() => closeTarjeta(o.idx)}
                constraintsRef={dragAreaRef}
                daubs={daubs}
                circles={circles}
                onCell={onCell(o.idx)}
                drawnOrder={state.drawnBalls}
                cardsPerNumber={state.cardsPerNumber}
                totalCards={state.totalCards}
              />
            </div>
          ))}
        </AnimatePresence>
      </div>

      {/* ------- MOBILE: collapsible panels + bottom bar ------- */}
      <div className="absolute inset-x-0 bottom-0 z-20 md:hidden">
        <AnimatePresence mode="wait">
          {panel === "card" && (
            <motion.div
              key="p-card"
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              className="mb-2 flex flex-col items-center gap-2 px-3"
            >
              <CardStack
                cards={state.me.cards}
                openIndexes={[state.me.activeCardIndex]}
                drawn={drawn}
                onSelect={api.setActiveCard}
                horizontal
              />
              <ActiveCard
                card={activeCard}
                drawn={drawn}
                currentNumber={lastNumber}
                index={state.me.activeCardIndex}
                compact
                daubs={daubs}
                circles={circles}
                onCell={onCell(state.me.activeCardIndex)}
                drawnOrder={state.drawnBalls}
                cardsPerNumber={state.cardsPerNumber}
                totalCards={state.totalCards}
              />
            </motion.div>
          )}
          {panel === "chat" && showChat && (
            <motion.div
              key="p-chat"
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              className="mb-2 px-3"
            >
              <ChatPanel chat={state.chat} onSend={api.sendChat} onReaction={api.sendReaction} className="h-64 w-full" participants={state.participants} meId={state.me.userId} onHoverUser={setHighlightUser} reactionsEnabled={showReactions} />
            </motion.div>
          )}
          {panel === "players" && (
            <motion.div
              key="p-players"
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              className="mb-2 px-3"
            >
              <ParticipantsPanel participants={state.participants} meId={state.me.userId} className="h-64 w-full" />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center justify-center gap-2 px-3 pb-3">
          <MobileTab
            icon="card"
            label="Tarjeta"
            active={panel === "card"}
            onClick={() => setPanel(panel === "card" ? null : "card")}
          />
          <MobileTab
            icon="users"
            label={`Jugadores (${state.participants.length})`}
            active={panel === "players"}
            onClick={() => setPanel(panel === "players" ? null : "players")}
          />
          {showChat && (
            <MobileTab
              icon="chat"
              label="Chat"
              active={panel === "chat"}
              onClick={() => setPanel(panel === "chat" ? null : "chat")}
            />
          )}
        </div>
      </div>

      {/* ------- toast: a called ball landed on one of my tarjetas ------- */}
      <AnimatePresence>
        {hitToast != null && (
          <motion.div
            key={`hit-${hitToast}`}
            initial={{ opacity: 0, y: 14, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 420, damping: 24 }}
            className="pointer-events-none absolute bottom-24 left-1/2 z-30 -translate-x-1/2 rounded-full bg-emerald-500 px-4 py-1.5 text-sm font-black text-white shadow-lg ring-2 ring-white/40"
          >
            Salio el {hitToast}, esta en tus tarjetas
          </motion.div>
        )}
      </AnimatePresence>

      {/* ------- scene avatar hover: floating player card ------- */}
      {sceneHover && participantsById.get(sceneHover.userId) && (
        <div
          className="pointer-events-none absolute z-40 -translate-x-1/2 -translate-y-full"
          style={{ left: sceneHover.x, top: sceneHover.y - 14 }}
        >
          <PlayerCard p={participantsById.get(sceneHover.userId)!} meId={state.me.userId} />
        </div>
      )}

      {/* ------- how to play (first visit + reopen) ------- */}
      <AnimatePresence>
        {showHelp && <HowToPlay onClose={dismissHelp} />}
      </AnimatePresence>

      {/* ------- winners ------- */}
      <AnimatePresence>
        {state.status === "finished" && state.winners && (
          <WinnersOverlay winners={state.winners} meNickname={state.me.nickname} />
        )}
      </AnimatePresence>
    </div>
  );
}

// Lightweight first-visit explainer: 3 steps to "get it" in 5 seconds.
function HowToPlay({ onClose }: { onClose: () => void }) {
  const steps = [
    { icon: "card", title: "Compra tarjetas", text: "Cada tarjeta tiene 24 numeros y un centro LIBRE ya marcado." },
    { icon: "bolt", title: "Se marcan solas", text: "Sale una bola cada 18 segundos y tus tarjetas se marcan automaticamente." },
    { icon: "trophy", title: "Llena la tarjeta", text: "El primero en llenar una tarjeta completa gana. Empate: se reparte el premio." },
  ];
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[2px]"
    >
      <motion.div
        initial={{ scale: 0.85, y: 30, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.85, y: 30, opacity: 0 }}
        transition={{ type: "spring", stiffness: 240, damping: 22 }}
        className="pointer-events-auto w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
      >
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="qori" className="h-7 w-7" />
          <h2 className="text-lg font-black tracking-tight text-slate-900">Como se juega</h2>
        </div>
        <ol className="mt-4 space-y-3">
          {steps.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <Icon name={s.icon} className="h-5 w-5" />
              </span>
              <div>
                <div className="text-sm font-bold text-slate-900">{i + 1}. {s.title}</div>
                <div className="text-sm text-slate-500">{s.text}</div>
              </div>
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-xl bg-emerald-500 py-3 text-sm font-bold text-white transition hover:bg-emerald-400"
        >
          Entendido
        </button>
      </motion.div>
    </motion.div>
  );
}

function MobileTab({
  icon,
  label,
  active,
  onClick,
}: {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`pointer-events-auto flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold shadow-lg backdrop-blur transition ${
        active ? "bg-emerald-500 text-white" : "bg-slate-900/60 text-white/85 hover:bg-slate-900/80"
      }`}
    >
      <Icon name={icon} className="h-4 w-4" />
      {label}
    </button>
  );
}

function SettingToggle({
  icon,
  label,
  checked,
  onChange,
}: {
  icon: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex w-full items-center gap-2 py-1.5 text-left">
      <Icon name={icon} className="h-4 w-4 shrink-0 text-emerald-300" />
      <span className="text-[13px] font-semibold">{label}</span>
      <span className={`ml-auto flex h-5 w-9 items-center rounded-full p-0.5 transition ${checked ? "bg-emerald-500" : "bg-white/20"}`}>
        <span className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : ""}`} />
      </span>
    </button>
  );
}
