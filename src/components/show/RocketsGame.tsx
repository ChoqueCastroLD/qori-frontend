import { useEffect, useMemo, useRef } from "react";
import { arenaMaxH, hashSeed, mulberry32, useViewportH, useWidth, type GameProps } from "./shared";
import { drawTicket } from "./canvasTicket";
import { drawArenaBg, hudBar, phaseBanner } from "./arenaFx";

// COHETES — self-timed. Finalists orbit in glowing rings; before each hit a
// meteor streaks in and the impact zone locks on, then it detonates. WHO falls
// and the order come from stage.eliminated (provably-fair); pacing is a pure
// function of stage elapsed ms so all viewers stay in sync.

const ACCENT = "#FF7A2A";
const PAL = ["#8B7BF0", "#3FBF8F", "#F08A5D", "#EA6A9A", "#5AA0F0", "#F0B24A"];
const LEAD = 900, STRIKE = 780; // ms before first hit, ms per strike

function elimTimes(stage: any): number[] {
  const el: number[] = stage.eliminated ?? [];
  return el.map((_, i) => LEAD + i * STRIKE);
}
export function duration(stage: any): number { const el: number[] = stage.eliminated ?? []; return LEAD + Math.max(0, el.length) * STRIKE + 700; }
export function elimCountAt(stage: any, ms: number): number { const t = elimTimes(stage); let n = 0; for (const e of t) if (e <= ms) n++; return n; }

interface Ball { id: number; ring: number; ang: number; spd: number; size: number; color: string }

export default function RocketsGame({ participants, stage, stageIdx, myIndices, winnerSet, isFinaleDone, stageStartMs, speed }: GameProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const vh = useViewportH();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const aliveBefore: number[] = stage.aliveBefore ?? [];
  const stageElim: number[] = stage.eliminated ?? [];
  const waves: number[][] = stage.data?.waves ?? [stageElim];
  const elTimes = useMemo(() => elimTimes(stage), [stage]);
  const totalMs = useMemo(() => duration(stage), [stage]);

  const H = Math.min(arenaMaxH(vh), 520);
  const W = Math.max(280, Math.min(width || 0, 760));
  const cx = W / 2, cy = 60 + (H - 60) / 2;
  const maxR = Math.min(W, H - 60) / 2 - 14;

  const balls = useMemo<Ball[]>(() => {
    const N = aliveBefore.length; if (!N || W < 280) return [];
    const r = mulberry32(hashSeed(stageIdx, N, 917));
    const order = aliveBefore.slice();
    for (let i = N - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const BR = Math.max(6, Math.min(24, Math.round(maxR * Math.sqrt(0.34 / N))));
    const dr = BR * 2.75; const out: Ball[] = [];
    let placed = 0, ringR = Math.max(BR * 2.6, maxR * 0.2);
    while (placed < N) {
      const cap = Math.max(6, Math.floor((2 * Math.PI * ringR) / (BR * 2.3)));
      const take = Math.min(cap, N - placed);
      for (let i = 0; i < take; i++) { const id = order[placed + i]; out.push({ id, ring: ringR, ang: (i / take) * Math.PI * 2 + r() * 0.3, spd: (0.14 + r() * 0.13) * (ringR < maxR * 0.5 ? 1.4 : 1), size: BR, color: PAL[(participants[id]?.number ?? id) % PAL.length] }); }
      placed += take; ringR = Math.min(maxR, ringR + dr); if (ringR >= maxR && placed < N) ringR = maxR;
    }
    return out;
  }, [aliveBefore, stageIdx, W, maxR, participants]);
  const ballById = useMemo(() => { const m = new Map<number, Ball>(); balls.forEach((b) => m.set(b.id, b)); return m; }, [balls]);

  const clockBase = useRef(0);
  useEffect(() => { clockBase.current = typeof performance !== "undefined" ? performance.now() : 0; }, [stageStartMs]);
  const sim = useRef({ parts: [] as any[], waves2: [] as any[], lastMs: -1 });
  const R = useRef({ balls, stageElim, myIndices, winnerSet, isFinaleDone, participants, cx, cy, maxR, W, H, waveN: waves.length });
  R.current = { balls, stageElim, myIndices, winnerSet, isFinaleDone, participants, cx, cy, maxR, W, H, waveN: waves.length };

  useEffect(() => {
    const cvs = canvasRef.current; if (!cvs || W < 280) return;
    const ctx = cvs.getContext("2d"); if (!ctx) return;
    const dpr = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
    cvs.width = W * dpr; cvs.height = H * dpr; cvs.style.width = W + "px"; cvs.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let raf = 0;
    const nowMs = () => (stageStartMs != null ? Date.now() - stageStartMs : (performance.now() - clockBase.current) * (speed ?? 1));
    const posOf = (b: Ball, tSec: number, spin: number) => { const a = b.ang + b.spd * tSec * spin; return { x: R.current.cx + Math.cos(a) * b.ring, y: R.current.cy + Math.sin(a) * b.ring }; };

    const frame = () => {
      const c = R.current; const s = sim.current; const ms = nowMs(); const tSec = ms / 1000; const tk = (performance.now()) / 16.667;
      const done = ms >= totalMs; const spin = done ? 0.15 : 0.6;
      let elim = 0; for (const e of elTimes) if (e <= ms) elim++;
      const gone = new Set(c.stageElim.slice(0, elim));
      // explosions on crossing
      if (s.lastMs >= 0) for (let k = 0; k < elTimes.length; k++) { if (elTimes[k] > s.lastMs && elTimes[k] <= ms) { const b = ballById.get(c.stageElim[k]); if (b) { const p = posOf(b, tSec, 0.6); s.waves2.push({ x: p.x, y: p.y, r: b.size * 1.1, life: 1 }); for (let i = 0; i < 26; i++) { const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 6; s.parts.push({ x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, life: 1, r: 1.5 + Math.random() * 3.5, c: i % 3 === 0 ? "#FFF1C0" : i % 2 ? ACCENT : b.color, glow: i % 2 === 0 }); } } } }
      s.lastMs = ms;
      for (const p of s.parts) { p.x += p.vx; p.y += p.vy; p.vy += 0.06; p.life -= 0.026; }
      s.parts = s.parts.filter((p: any) => p.life > 0);
      for (const w of s.waves2) { w.r += 7; w.life -= 0.04; }
      s.waves2 = s.waves2.filter((w: any) => w.life > 0);

      drawArenaBg(ctx, c.W, c.H, ACCENT, tk);
      const seen = new Set<number>(); ctx.lineWidth = 1;
      for (const b of c.balls) { const rr = Math.round(b.ring); if (seen.has(rr)) continue; seen.add(rr); ctx.beginPath(); ctx.arc(c.cx, c.cy, b.ring, 0, Math.PI * 2); ctx.strokeStyle = "rgba(255,255,255,0.05)"; ctx.stroke(); }

      // meteor telegraph on next victim
      if (elim < c.stageElim.length) {
        const nextV = c.stageElim[elim]; const nb = ballById.get(nextV);
        if (nb && !gone.has(nextV)) {
          const tp = posOf(nb, tSec, spin); const prog = Math.min(1, 1 - (elTimes[elim] - ms) / 750);
          if (prog > 0) {
            const pr = nb.size * (1.8 + Math.sin(tk * 0.4) * 0.25);
            ctx.save(); ctx.shadowColor = "#ff3b3b"; ctx.shadowBlur = 18; ctx.globalAlpha = 0.12 + prog * 0.16; ctx.beginPath(); ctx.arc(tp.x, tp.y, pr, 0, Math.PI * 2); ctx.fillStyle = "#ff3b3b"; ctx.fill(); ctx.globalAlpha = 1; ctx.strokeStyle = "#ff5555"; ctx.lineWidth = 1.5 + prog * 1.5; ctx.setLineDash(prog > 0.6 ? [8, 4] : [4, 7]); ctx.beginPath(); ctx.arc(tp.x, tp.y, pr + 3, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
            const ang = 2.3 + (nextV % 5) * 0.5; const d0 = c.maxR + 150; const hx = tp.x + Math.cos(ang) * d0 * (1 - prog), hy = tp.y + Math.sin(ang) * d0 * (1 - prog);
            ctx.save(); ctx.shadowColor = ACCENT; ctx.shadowBlur = 16; for (let i = 0; i < 9; i++) { const bx = hx + Math.cos(ang) * i * 12, by = hy + Math.sin(ang) * i * 12; ctx.globalAlpha = (1 - i * 0.1) * (0.35 + prog * 0.65); ctx.beginPath(); ctx.arc(bx, by, 10 - i, 0, Math.PI * 2); ctx.fillStyle = i < 2 ? "#7a2a12" : i < 5 ? ACCENT : "#FFE08A"; ctx.fill(); } ctx.restore(); ctx.globalAlpha = 1;
          }
        }
      }
      for (const w of s.waves2) { ctx.save(); ctx.globalAlpha = w.life; ctx.shadowColor = ACCENT; ctx.shadowBlur = 14; ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2); ctx.strokeStyle = ACCENT; ctx.lineWidth = 3; ctx.stroke(); ctx.restore(); }
      for (const p of s.parts) { ctx.save(); ctx.globalAlpha = Math.max(0, p.life); if (p.glow) { ctx.shadowColor = p.c; ctx.shadowBlur = 8; } ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fillStyle = p.c; ctx.fill(); ctx.restore(); }
      ctx.globalAlpha = 1;
      const showName = c.balls.length <= 22;
      const compact = c.balls.length > 22;
      for (const b of c.balls) { if (gone.has(b.id)) continue; const p = posOf(b, tSec, spin); const pt = c.participants[b.id]; drawTicket(ctx, { x: p.x, y: p.y, r: b.size, color: b.color, number: pt?.number ?? b.id + 1, nickname: pt?.nickname, avatarUrl: pt?.avatarUrl, mine: c.myIndices.has(b.id), winner: done && c.isFinaleDone && c.winnerSet.has(b.id), showName, compact }); }

      const aliveCount = c.balls.length - elim;
      const waveN = c.waveN; const cw = Math.max(1, Math.ceil(c.stageElim.length / waveN)); const curWave = Math.min(waveN, Math.floor(elim / cw) + 1);
      hudBar(ctx, c.W, { title: "Cohetes", alive: aliveCount, goal: c.balls.length - c.stageElim.length, pct: Math.min(1, ms / totalMs), accent: ACCENT, phase: `Oleada ${curWave}/${waveN}` });
      if (ms < 1300) { const a = 1 - Math.min(1, ms / 1300); phaseBanner(ctx, c.W, c.H, "Lluvia de meteoritos", "sobreviví a la caída", a, ACCENT); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [W, H, balls, ballById, totalMs, elTimes, stageStartMs, speed]);

  return (
    <div ref={ref} className="overflow-hidden rounded-2xl bg-black" style={{ height: H }}>
      <canvas ref={canvasRef} className="mx-auto block" />
    </div>
  );
}
