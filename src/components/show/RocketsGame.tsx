import { useEffect, useMemo, useRef } from "react";
import { arenaMaxH, hashSeed, mulberry32, useViewportH, useWidth, type GameProps } from "./shared";
import { drawTicket } from "./canvasTicket";
import { drawArenaBg, hudBar, phaseBanner, hexA } from "./arenaFx";

// COHETES - self-timed, faithful to the owner's "lluvia de meteoritos": the
// finalists orbit in rings; each WAVE an impact zone appears, roams the arena
// scaring tickets, locks onto a cluster, then a meteor streaks in and the whole
// wave pops together (ghost outlines linger where they flew). WHO falls and the
// wave grouping come from the server (stage.data.waves / stage.eliminated);
// pacing is a pure function of stage elapsed ms so all viewers stay in sync.

const ACCENT = "#FF7A2A";
const PAL = ["#8B7BF0", "#3FBF8F", "#F08A5D", "#EA6A9A", "#5AA0F0", "#F0B24A"];
const RED = "#ff4444";

// wave choreography (ms)
const LEAD = 1400, ROAM = 1700, LOCK = 900, METEOR = 420, POP_EACH = 90, GAPW = 500;
const TAIL = 900;

function wavesOf(stage: any): number[][] {
  const el: number[] = stage.eliminated ?? [];
  const w: number[][] = stage.data?.waves ?? (el.length ? [el] : []);
  return w.filter((x) => x.length);
}
interface WSched { warnAt: number; lockAt: number; meteorAt: number; impactAt: number; victims: number[] }
function schedule(stage: any): { ws: WSched[]; totalMs: number; elim: { id: number; t: number }[] } {
  const ws: WSched[] = []; const elim: { id: number; t: number }[] = [];
  let t = LEAD;
  for (const victims of wavesOf(stage)) {
    const warnAt = t, lockAt = warnAt + ROAM, meteorAt = lockAt + LOCK, impactAt = meteorAt + METEOR;
    victims.forEach((id, i) => elim.push({ id, t: impactAt + i * POP_EACH }));
    ws.push({ warnAt, lockAt, meteorAt, impactAt, victims });
    t = impactAt + victims.length * POP_EACH + GAPW;
  }
  return { ws, totalMs: t + TAIL, elim };
}
export function duration(stage: any): number { return schedule(stage).totalMs; }
export function elimCountAt(stage: any, ms: number): number { let n = 0; for (const e of schedule(stage).elim) if (e.t <= ms) n++; return n; }

interface Ball { id: number; ring: number; ang: number; spd: number; size: number; color: string }

export default function RocketsGame({ participants, stage, stageIdx, myIndices, winnerSet, isFinaleDone, stageStartMs, speed }: GameProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const vh = useViewportH();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const aliveBefore: number[] = stage.aliveBefore ?? [];
  const stageElim: number[] = stage.eliminated ?? [];
  const waves = useMemo(() => wavesOf(stage), [stage]);
  const sched = useMemo(() => schedule(stage), [stage]);
  const totalMs = sched.totalMs;

  const H = Math.min(arenaMaxH(vh), 520);
  const W = Math.max(280, Math.min(width || 0, 760));
  const cx = W / 2, cy = 62 + (H - 62) / 2;
  const maxR = Math.min(W, H - 62) / 2 - 16;

  // Layout: same-wave victims are placed contiguously so the impact zone reads
  // as a tight cluster (like the reference, which kills the k nearest).
  const balls = useMemo<Ball[]>(() => {
    const N = aliveBefore.length; if (!N || W < 280) return [];
    const r = mulberry32(hashSeed(stageIdx, N, 917));
    const inWave = new Set(stageElim);
    const survivors = aliveBefore.filter((id) => !inWave.has(id));
    for (let i = survivors.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [survivors[i], survivors[j]] = [survivors[j], survivors[i]]; }
    // insert each wave as a contiguous run at a random offset among survivors
    // (runs are atomic so later inserts can't split an earlier wave)
    const blocks: number[][] = survivors.map((id) => [id]);
    for (const wv of waves) { const at = Math.floor(r() * (blocks.length + 1)); blocks.splice(at, 0, wv); }
    const order: number[] = blocks.flat();
    const BR = Math.max(7, Math.min(24, Math.round(maxR * Math.sqrt(0.3 / N))));
    const dr = BR * 2.75; const out: Ball[] = [];
    let placed = 0, ringR = Math.max(BR * 2.6, maxR * 0.26), ri = 0;
    while (placed < N) {
      const cap = Math.max(6, Math.floor((2 * Math.PI * ringR) / (BR * 2.6)));
      const take = Math.min(cap, N - placed);
      // one speed per ring so tickets keep their spacing (no drift collisions);
      // alternate direction per ring for depth
      const ringSpd = (0.12 + r() * 0.1) * (ringR < maxR * 0.5 ? 1.5 : 1) * (ri % 2 ? -1 : 1);
      const a0 = r() * Math.PI * 2;
      for (let i = 0; i < take; i++) {
        const id = order[placed + i];
        out.push({ id, ring: ringR, ang: a0 + (i / take) * Math.PI * 2, spd: ringSpd, size: BR, color: PAL[(participants[id]?.number ?? id) % PAL.length] });
      }
      placed += take; ri++; ringR = Math.min(maxR, ringR + dr); if (ringR >= maxR && placed < N) ringR = maxR;
    }
    return out;
  }, [aliveBefore, stageElim, waves, stageIdx, W, maxR, participants]);
  const ballById = useMemo(() => { const m = new Map<number, Ball>(); balls.forEach((b) => m.set(b.id, b)); return m; }, [balls]);

  // deterministic roam waypoints per wave (angles/radii in arena space)
  const roamPts = useMemo(() => waves.map((wv, k) => {
    const r = mulberry32(hashSeed(stageIdx, k, wv[0] ?? 0, 551));
    return [0, 1, 2].map(() => ({ a: r() * Math.PI * 2, d: 0.25 + r() * 0.6 }));
  }), [waves, stageIdx]);

  const clockBase = useRef(0);
  useEffect(() => { clockBase.current = typeof performance !== "undefined" ? performance.now() : 0; }, [stageStartMs]);
  const sim = useRef({ parts: [] as any[], lastMs: -1 });
  const R = useRef({ balls, stageElim, myIndices, winnerSet, isFinaleDone, participants, cx, cy, maxR, W, H });
  R.current = { balls, stageElim, myIndices, winnerSet, isFinaleDone, participants, cx, cy, maxR, W, H };

  useEffect(() => {
    const cvs = canvasRef.current; if (!cvs || W < 280) return;
    const ctx = cvs.getContext("2d"); if (!ctx) return;
    const dpr = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
    cvs.width = W * dpr; cvs.height = H * dpr; cvs.style.width = W + "px"; cvs.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let raf = 0;
    const nowMs = () => (stageStartMs != null ? Date.now() - stageStartMs : (performance.now() - clockBase.current) * (speed ?? 1));
    const posOf = (b: Ball, ms: number) => {
      const spin = ms >= totalMs ? 0.15 : 0.6;
      const a = b.ang + b.spd * (ms / 1000) * spin;
      return { x: R.current.cx + Math.cos(a) * b.ring, y: R.current.cy + Math.sin(a) * b.ring };
    };
    const centroid = (victims: number[], ms: number) => {
      let sx = 0, sy = 0, n = 0, mr = 0;
      const pts = victims.map((id) => { const b = ballById.get(id); return b ? posOf(b, ms) : null; }).filter(Boolean) as { x: number; y: number }[];
      for (const p of pts) { sx += p.x; sy += p.y; n++; }
      if (!n) return { x: R.current.cx, y: R.current.cy, r: 60 };
      sx /= n; sy /= n;
      for (const p of pts) mr = Math.max(mr, Math.hypot(p.x - sx, p.y - sy));
      return { x: sx, y: sy, r: mr + (ballById.get(victims[0])?.size ?? 12) + 10 };
    };

    const frame = () => {
      const c = R.current; const s = sim.current; const ms = nowMs(); const tk = performance.now() / 16.667;
      const done = ms >= totalMs;
      // gone set + one-shot particles on crossings
      const gone = new Set<number>();
      for (const e of sched.elim) if (e.t <= ms) gone.add(e.id);
      if (s.lastMs >= 0 && ms > s.lastMs && ms - s.lastMs < 500) {
        for (const e of sched.elim) {
          if (e.t > s.lastMs && e.t <= ms) {
            const b = ballById.get(e.id); if (!b) continue; const p = posOf(b, e.t);
            for (let i = 0; i < 18; i++) { const a = Math.random() * Math.PI * 2, sp = 1.6 + Math.random() * 4; s.parts.push({ x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.6, life: 1, r: 1.5 + Math.random() * 3, c: i % 3 === 0 ? "#FFF1C0" : i % 2 ? ACCENT : b.color, glow: i % 2 === 0 }); }
          }
        }
        for (const w of sched.ws) if (w.impactAt > s.lastMs && w.impactAt <= ms) {
          const z = centroid(w.victims, w.impactAt);
          for (let i = 0; i < 26; i++) { const a = Math.random() * Math.PI * 2, sp = 2.5 + Math.random() * 5; s.parts.push({ x: z.x, y: z.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, r: 2 + Math.random() * 3.5, c: i % 2 ? ACCENT : "#FAC775", glow: i % 2 === 0 }); }
        }
      }
      s.lastMs = ms;
      for (const p of s.parts) { p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.life -= 0.028; }
      s.parts = s.parts.filter((p: any) => p.life > 0);

      // pure shake from recent impacts
      let shake = 0;
      for (const w of sched.ws) if (ms >= w.impactAt) shake = Math.max(shake, 7 * Math.pow(0.82, (ms - w.impactAt) / 16.667));
      const shX = Math.sin(tk * 3.1) * shake, shY = Math.cos(tk * 2.7) * shake;

      ctx.save(); ctx.translate(shX, shY);
      drawArenaBg(ctx, c.W, c.H, ACCENT, tk);
      // orbit guides
      const seen = new Set<number>(); ctx.lineWidth = 1; ctx.setLineDash([2, 7]);
      for (const b of c.balls) { const rr2 = Math.round(b.ring); if (seen.has(rr2)) continue; seen.add(rr2); ctx.beginPath(); ctx.arc(c.cx, c.cy, b.ring, 0, Math.PI * 2); ctx.strokeStyle = "rgba(255,255,255,0.05)"; ctx.stroke(); }
      ctx.setLineDash([]);

      // ghosts of the fallen (dashed outline + crossed number, fade ~2.6s)
      for (const e of sched.elim) {
        if (ms < e.t || ms > e.t + 2600) continue;
        const b = ballById.get(e.id); if (!b) continue;
        const p = posOf(b, e.t); const a = Math.min(1, (1 - (ms - e.t) / 2600) * 1.4);
        ctx.save(); ctx.globalAlpha = a * 0.75;
        ctx.beginPath(); ctx.arc(p.x, p.y, b.size, 0, Math.PI * 2);
        ctx.strokeStyle = "#8b8b94"; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = "#8b8b94"; ctx.font = `600 ${Math.max(9, b.size * 0.7)}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(String(c.participants[e.id]?.number ?? e.id + 1), p.x, p.y);
        ctx.beginPath(); ctx.moveTo(p.x - b.size * 0.65, p.y + b.size * 0.5); ctx.lineTo(p.x + b.size * 0.65, p.y - b.size * 0.5);
        ctx.strokeStyle = "#8b8b94"; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.restore();
      }

      // active wave: roaming/locked impact zone + meteor
      const wi = sched.ws.findIndex((w) => ms >= w.warnAt && ms < w.impactAt + 200);
      const fear = new Set<number>();
      if (wi >= 0) {
        const w = sched.ws[wi];
        const z = centroid(w.victims, ms);
        let zx = z.x, zy = z.y, zr = 62;
        const locked = ms >= w.lockAt;
        if (!locked) {
          // roam: seeded waypoint path that converges on the cluster
          const pts = roamPts[wi] ?? [];
          const path = [...pts.map((q) => ({ x: c.cx + Math.cos(q.a) * c.maxR * q.d, y: c.cy + Math.sin(q.a) * c.maxR * q.d })), { x: z.x, y: z.y }];
          const fp = (ms - w.warnAt) / ROAM;
          const segf = fp * (path.length - 1);
          const i0 = Math.min(path.length - 2, Math.floor(segf)); const f = segf - i0;
          const sm = f * f * (3 - 2 * f);
          zx = path[i0].x + (path[i0 + 1].x - path[i0].x) * sm;
          zy = path[i0].y + (path[i0 + 1].y - path[i0].y) * sm;
        } else {
          const lp = Math.min(1, (ms - w.lockAt) / 350);
          zr = 62 + (z.r - 62) * (lp * lp * (3 - 2 * lp));
        }
        // fear jitter near the zone
        for (const b of c.balls) { if (gone.has(b.id)) continue; const p = posOf(b, ms); if (Math.hypot(p.x - zx, p.y - zy) < zr + b.size) fear.add(b.id); }
        if (ms < w.impactAt) {
          ctx.save();
          ctx.globalAlpha = locked ? 0.16 : 0.08;
          ctx.beginPath(); ctx.arc(zx, zy, zr, 0, Math.PI * 2); ctx.fillStyle = RED; ctx.fill();
          ctx.globalAlpha = 1;
          ctx.strokeStyle = RED; ctx.lineWidth = locked ? 2.5 : 1.5;
          ctx.setLineDash(locked ? [8, 4] : [4, 7]);
          ctx.beginPath(); ctx.arc(zx, zy, zr + Math.sin(tk * (locked ? 0.4 : 0.15)) * 3, 0, Math.PI * 2); ctx.stroke();
          ctx.setLineDash([]);
          if (Math.sin(tk * (locked ? 0.6 : 0.25)) > 0) {
            ctx.beginPath(); ctx.moveTo(zx - 12, zy); ctx.lineTo(zx + 12, zy); ctx.moveTo(zx, zy - 12); ctx.lineTo(zx, zy + 12);
            ctx.lineWidth = 1.5; ctx.stroke();
          }
          ctx.restore();
        }
        // meteor streak
        if (ms >= w.meteorAt && ms < w.impactAt + 60) {
          const mp = Math.min(1, (ms - w.meteorAt) / METEOR);
          const ang = 2.2 + (wi % 5) * 0.45; const d0 = c.maxR + 260;
          const hx = zx + Math.cos(ang) * d0 * (1 - mp), hy = zy + Math.sin(ang) * d0 * (1 - mp);
          ctx.save(); ctx.shadowColor = ACCENT; ctx.shadowBlur = 16;
          for (let i = 0; i < 8; i++) {
            const bx = hx + Math.cos(ang) * i * 13, by = hy + Math.sin(ang) * i * 13;
            ctx.globalAlpha = (1 - i * 0.11) * (0.3 + mp * 0.7);
            ctx.beginPath(); ctx.arc(bx, by, 10 - i, 0, Math.PI * 2);
            ctx.fillStyle = i < 2 ? "#7a2a12" : i < 5 ? ACCENT : "#FFE08A"; ctx.fill();
          }
          ctx.restore(); ctx.globalAlpha = 1;
        }
      }

      // impact shockwaves (pure)
      for (const w of sched.ws) {
        const dt = ms - w.impactAt; if (dt < 0 || dt > 650) continue;
        const z = centroid(w.victims, w.impactAt);
        ctx.save(); ctx.globalAlpha = 1 - dt / 650; ctx.shadowColor = ACCENT; ctx.shadowBlur = 14;
        ctx.beginPath(); ctx.arc(z.x, z.y, z.r * 0.4 + dt * 0.34, 0, Math.PI * 2); ctx.strokeStyle = ACCENT; ctx.lineWidth = 3; ctx.stroke();
        if (dt < 280) { ctx.globalAlpha = 1 - dt / 280; ctx.beginPath(); ctx.arc(z.x, z.y, z.r * 0.15 + dt * 0.3, 0, Math.PI * 2); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.stroke(); }
        ctx.restore();
      }

      // tickets
      const aliveCount = c.balls.length - gone.size;
      const showName = c.balls.length <= 22;
      const compact = c.balls.length > 22;
      for (const b of c.balls) {
        if (gone.has(b.id)) continue;
        const p = posOf(b, ms); const pt = c.participants[b.id];
        const fx = fear.has(b.id) ? Math.sin(tk * 0.9 + b.id) * 2.4 : 0;
        const fy = fear.has(b.id) ? Math.cos(tk * 1.1 + b.id) * 2.4 : 0;
        drawTicket(ctx, { x: p.x + fx, y: p.y + fy, r: b.size, color: b.color, number: pt?.number ?? b.id + 1, nickname: pt?.nickname, avatarUrl: pt?.avatarUrl, mine: c.myIndices.has(b.id), winner: done && c.isFinaleDone && c.winnerSet.has(b.id), showName, compact });
      }
      for (const p of s.parts) { ctx.save(); ctx.globalAlpha = Math.max(0, p.life); if (p.glow) { ctx.shadowColor = p.c; ctx.shadowBlur = 8; } ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fillStyle = p.c; ctx.fill(); ctx.restore(); }
      ctx.globalAlpha = 1;

      if (ms < 1300) { const a = 1 - Math.min(1, ms / 1300); phaseBanner(ctx, c.W, c.H, "Lluvia de meteoritos", "sobreviví a la caída", a, ACCENT); }
      ctx.restore();

      const curWave = Math.min(waves.length, Math.max(1, sched.ws.filter((w) => ms >= w.warnAt).length));
      hudBar(ctx, c.W, { title: "Cohetes", alive: aliveCount, goal: c.balls.length - c.stageElim.length, pct: Math.min(1, ms / totalMs), accent: ACCENT, phase: done ? "Completado" : `Oleada ${curWave}/${waves.length}` });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [W, H, balls, ballById, sched, waves, roamPts, totalMs, stageStartMs, speed]);

  return (
    <div ref={ref} className="overflow-hidden rounded-2xl bg-black" style={{ height: H }}>
      <canvas ref={canvasRef} className="mx-auto block" />
    </div>
  );
}
