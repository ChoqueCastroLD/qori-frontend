import { useEffect, useMemo, useRef } from "react";
import { arenaMaxH, hashSeed, mulberry32, useNewSteps, useViewportH, useWidth, type GameProps } from "./shared";
import { drawTicket } from "./canvasTicket";
import { drawArenaBg, hudBar, phaseBanner, hexA } from "./arenaFx";

// COHETES — finalists orbit in glowing rings while a wandering impact zone locks
// on and a meteor streaks in to wipe the nearest. WHO falls is the engine's
// `stage.eliminated` (provably-fair); the cinematic motion is local.

const ACCENT = "#FF7A2A";
const PAL = ["#8B7BF0", "#3FBF8F", "#F08A5D", "#EA6A9A", "#5AA0F0", "#F0B24A"];

interface Ball { id: number; ring: number; ang: number; spd: number; size: number; color: string }
interface Part { x: number; y: number; vx: number; vy: number; life: number; r: number; c: string; glow?: boolean }

export default function RocketsGame({ participants, stage, stageIdx, step, elimSeq, myIndices, winnerSet, isFinaleDone }: GameProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const vh = useViewportH();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const aliveBefore: number[] = stage.aliveBefore ?? [];
  const stageElim: number[] = stage.eliminated ?? [];
  const waves: number[][] = stage.data?.waves ?? [stageElim];
  const waveEnds = useMemo(() => { const e: number[] = []; let a = 0; for (const w of waves) { a += w.length; e.push(a); } return e; }, [waves]);
  const wIdx = waveEnds.findIndex((e) => step < e);
  const currentWave = wIdx === -1 ? waves.length : wIdx + 1;

  const H = Math.min(arenaMaxH(vh), 520);
  const W = Math.max(280, Math.min(width || 0, 760));
  const cx = W / 2, cy = 60 + (H - 60) / 2;
  const maxR = Math.min(W, H - 60) / 2 - 14;

  const balls = useMemo<Ball[]>(() => {
    const N = aliveBefore.length; if (!N || W < 280) return [];
    const r = mulberry32(hashSeed(stageIdx, N, 917));
    const order = aliveBefore.slice();
    for (let i = N - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const BR = Math.max(7, Math.min(26, Math.round(maxR * Math.sqrt(0.5 / N))));
    const dr = BR * 2.6;
    const out: Ball[] = [];
    let placed = 0, ringR = Math.max(BR * 2.6, maxR * 0.2);
    while (placed < N) {
      const cap = Math.max(6, Math.floor((2 * Math.PI * ringR) / (BR * 2.3)));
      const take = Math.min(cap, N - placed);
      for (let i = 0; i < take; i++) {
        const id = order[placed + i];
        out.push({ id, ring: ringR, ang: (i / take) * Math.PI * 2 + r() * 0.3, spd: (0.14 + r() * 0.13) * (ringR < maxR * 0.5 ? 1.4 : 1), size: BR, color: PAL[(participants[id]?.number ?? id) % PAL.length] });
      }
      placed += take; ringR = Math.min(maxR, ringR + dr);
      if (ringR >= maxR && placed < N) ringR = maxR;
    }
    return out;
  }, [aliveBefore, stageIdx, W, maxR, participants]);
  const ballById = useMemo(() => { const m = new Map<number, Ball>(); balls.forEach((b) => m.set(b.id, b)); return m; }, [balls]);

  const sim = useRef({ parts: [] as Part[], waves2: [] as { x: number; y: number; r: number; life: number }[], start: 0, stepAt: 0, waveAt: 0, wave: 1 });
  const R = useRef({ step, balls, stageElim, myIndices, winnerSet, isFinaleDone, participants, cx, cy, maxR, W, H, waveN: waves.length, currentWave });
  R.current = { step, balls, stageElim, myIndices, winnerSet, isFinaleDone, participants, cx, cy, maxR, W, H, waveN: waves.length, currentWave };

  useEffect(() => { sim.current.stepAt = performance.now(); }, [step]);
  useEffect(() => { if (currentWave !== sim.current.wave) { sim.current.wave = currentWave; sim.current.waveAt = performance.now(); } }, [currentWave]);

  const posOf = (b: Ball, tSec: number, spin: number) => { const a = b.ang + b.spd * tSec * spin; return { x: R.current.cx + Math.cos(a) * b.ring, y: R.current.cy + Math.sin(a) * b.ring }; };

  useNewSteps(stageIdx, step, (steps) => {
    if (!balls.length) return;
    const now = performance.now(); const tSec = (now - sim.current.start) / 1000;
    for (const k of steps) {
      const b = ballById.get(stageElim[k - 1]); if (!b) continue;
      const p = posOf(b, tSec, 0.6);
      sim.current.waves2.push({ x: p.x, y: p.y, r: b.size * 1.1, life: 1 });
      for (let i = 0; i < 26; i++) { const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 6; sim.current.parts.push({ x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, life: 1, r: 1.5 + Math.random() * 3.5, c: i % 3 === 0 ? "#FFF1C0" : i % 2 ? ACCENT : b.color, glow: i % 2 === 0 }); }
    }
    sim.current.parts = sim.current.parts.slice(-320);
  });

  useEffect(() => {
    const cvs = canvasRef.current; if (!cvs || W < 280) return;
    const ctx = cvs.getContext("2d"); if (!ctx) return;
    const dpr = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
    cvs.width = W * dpr; cvs.height = H * dpr; cvs.style.width = W + "px"; cvs.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sim.current.start = performance.now(); sim.current.stepAt = performance.now();
    let raf = 0;
    const frame = () => {
      const now = performance.now(); const tk = (now - sim.current.start) / 16.667; const tSec = (now - sim.current.start) / 1000;
      const c = R.current; const s = sim.current;
      const gone = new Set(c.stageElim.slice(0, c.step));
      const done = c.step >= c.stageElim.length; const spin = done ? 0.15 : 0.6;

      for (const p of s.parts) { p.x += p.vx; p.y += p.vy; p.vy += 0.06; p.life -= 0.026; }
      s.parts = s.parts.filter((p) => p.life > 0);
      for (const w of s.waves2) { w.r += 7; w.life -= 0.04; }
      s.waves2 = s.waves2.filter((w) => w.life > 0);

      drawArenaBg(ctx, c.W, c.H, ACCENT, tk);

      // faint orbit guides
      const seen = new Set<number>();
      ctx.lineWidth = 1;
      for (const b of c.balls) { const rr = Math.round(b.ring); if (seen.has(rr)) continue; seen.add(rr); ctx.beginPath(); ctx.arc(c.cx, c.cy, b.ring, 0, Math.PI * 2); ctx.strokeStyle = "rgba(255,255,255,0.05)"; ctx.stroke(); }

      // telegraph + meteor toward next victim
      const nextV = c.step < c.stageElim.length ? c.stageElim[c.step] : -1;
      const nb = nextV >= 0 ? ballById.get(nextV) : undefined;
      if (nb && !gone.has(nextV)) {
        const tp = posOf(nb, tSec, spin); const prog = Math.min(1, (now - s.stepAt) / 850);
        const pr = nb.size * (1.8 + Math.sin(now * 0.02) * 0.25);
        ctx.save(); ctx.shadowColor = "#ff3b3b"; ctx.shadowBlur = 18;
        ctx.globalAlpha = 0.12 + prog * 0.16; ctx.beginPath(); ctx.arc(tp.x, tp.y, pr, 0, Math.PI * 2); ctx.fillStyle = "#ff3b3b"; ctx.fill();
        ctx.globalAlpha = 1; ctx.strokeStyle = "#ff5555"; ctx.lineWidth = 1.5 + prog * 1.5; ctx.setLineDash(prog > 0.6 ? [8, 4] : [4, 7]);
        ctx.beginPath(); ctx.arc(tp.x, tp.y, pr + 3, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
        // comet
        const ang = 2.3 + (nextV % 5) * 0.5; const d0 = c.maxR + 150;
        const hx = tp.x + Math.cos(ang) * d0 * (1 - prog), hy = tp.y + Math.sin(ang) * d0 * (1 - prog);
        ctx.save(); ctx.shadowColor = ACCENT; ctx.shadowBlur = 16;
        for (let i = 0; i < 9; i++) { const bx = hx + Math.cos(ang) * i * 12, by = hy + Math.sin(ang) * i * 12; ctx.globalAlpha = (1 - i * 0.1) * (0.35 + prog * 0.65); ctx.beginPath(); ctx.arc(bx, by, 10 - i, 0, Math.PI * 2); ctx.fillStyle = i < 2 ? "#7a2a12" : i < 5 ? ACCENT : "#FFE08A"; ctx.fill(); }
        ctx.restore(); ctx.globalAlpha = 1;
      }

      // shockwaves
      for (const w of s.waves2) { ctx.save(); ctx.globalAlpha = w.life; ctx.shadowColor = ACCENT; ctx.shadowBlur = 14; ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2); ctx.strokeStyle = ACCENT; ctx.lineWidth = 3; ctx.stroke(); ctx.restore(); }
      // debris (glowing)
      for (const p of s.parts) { ctx.save(); ctx.globalAlpha = Math.max(0, p.life); if (p.glow) { ctx.shadowColor = p.c; ctx.shadowBlur = 8; } ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fillStyle = p.c; ctx.fill(); ctx.restore(); }
      ctx.globalAlpha = 1;

      // tickets
      const showName = c.balls.length <= 34;
      for (const b of c.balls) {
        if (gone.has(b.id)) continue;
        const p = posOf(b, tSec, spin); const pt = c.participants[b.id];
        drawTicket(ctx, { x: p.x, y: p.y, r: b.size, color: b.color, number: pt?.number ?? b.id + 1, nickname: pt?.nickname, avatarUrl: pt?.avatarUrl, mine: c.myIndices.has(b.id), winner: done && c.isFinaleDone && c.winnerSet.has(b.id), showName, showLabel: showName });
      }

      // HUD + wave banner
      const aliveCount = c.balls.length - Math.min(c.step, c.stageElim.length);
      hudBar(ctx, c.W, { title: "Cohetes", alive: aliveCount, goal: c.balls.length - c.stageElim.length, pct: c.stageElim.length ? c.step / c.stageElim.length : 1, accent: ACCENT, phase: `Oleada ${c.currentWave}/${c.waveN}` });
      const bAlpha = 1 - Math.min(1, (now - s.waveAt) / 1400);
      if (s.waveAt > 0) phaseBanner(ctx, c.W, c.H, `Oleada ${c.currentWave}`, "lluvia de meteoritos", bAlpha, ACCENT);

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [W, H, balls, ballById]);

  return (
    <div ref={ref} className="overflow-hidden rounded-2xl" style={{ height: H, background: hexA("#000000", 1) }}>
      <canvas ref={canvasRef} className="mx-auto block" />
    </div>
  );
}
