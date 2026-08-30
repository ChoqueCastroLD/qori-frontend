import { useEffect, useMemo, useRef } from "react";
import { arenaMaxH, useNewSteps, useViewportH, useWidth, type GameProps } from "./shared";
import { drawTicket } from "./canvasTicket";
import { drawArenaBg, hudBar, phaseBanner, rr, hexA } from "./arenaFx";

// BOMBAS "cruz errante" — cinematic. Server sim (show.ts bombsSim) picks WHO
// falls (row+column cross, nearest-neighbour pineapple, single jump) and emits a
// grid + event script; this canvas animates it, eliminations gated by `step`.

const ACCENT = "#FF5A2A";
const PAL = ["#8B7BF0", "#3FBF8F", "#F08A5D", "#EA6A9A", "#5AA0F0", "#F0B24A"];
const RED = "#ff4d4d", GREEN = "#4fd6a0", GOLD = "#F5B301";
const PHASE_LABEL: Record<string, [string, string]> = {
  cross: ["Bomba cruz", "borra su fila y su columna"],
  pine: ["Granada piña", "el impactado se salva · sus vecinos no"],
  jump: ["Bomba saltarina", "elimina donde aterriza"],
};

interface Part { x: number; y: number; vx: number; vy: number; life: number; dec: number; r: number; c: string; sm?: boolean; glow?: boolean }
interface Wave { x: number; y: number; r: number; life: number; w: number }
interface Ev { type: string; target?: number; host?: number; victim?: number; victims?: number[]; decoys?: number[] }

export default function BombsGame({ participants, stage, stageIdx, step, elimSeq, myIndices, winnerSet, isFinaleDone }: GameProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const vh = useViewportH();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const aliveBefore: number[] = stage.aliveBefore ?? [];
  const stageElim: number[] = stage.eliminated ?? [];
  const cols: number = stage.data?.cols ?? 10;
  const gridOrder: number[] = stage.data?.gridOrder ?? aliveBefore;
  const events: Ev[] = stage.data?.events ?? stageElim.map((v) => ({ type: "jump", victim: v }));

  const ranges = useMemo(() => {
    const rs: { ev: Ev; start: number; end: number }[] = []; let acc = 0;
    for (const ev of events) { const vic = ev.victims ?? (ev.victim != null ? [ev.victim] : []); rs.push({ ev, start: acc, end: acc + vic.length }); acc += vic.length; }
    return rs;
  }, [events]);
  const color = (i: number) => PAL[(participants[i]?.number ?? i) % PAL.length];

  const H = Math.min(arenaMaxH(vh), 520);
  const W = Math.max(280, Math.min(width || 0, 760));
  const pad = 16, top = 66;
  const maxRows = Math.max(1, Math.ceil(gridOrder.length / cols));
  const availH = H - top - 12;
  const cellW = (W - pad * 2) / cols;
  const rowH = Math.max(30, Math.min(78, availH / maxRows));
  const ballR = Math.max(11, Math.min(cellW, rowH) * 0.4);

  const sim = useRef({ parts: [] as Part[], waves: [] as Wave[], shake: 0, start: 0, pos: new Map<number, { x: number; y: number }>(), fall: new Map<number, { t: number; x: number; y: number; id: number }>(), phaseAt: 0, phase: "" });
  const R = useRef({ step, stageElim, gridOrder, ranges, participants, myIndices, winnerSet, isFinaleDone, cols, W, H, pad, top, cellW, rowH, ballR, availH, color });
  R.current = { step, stageElim, gridOrder, ranges, participants, myIndices, winnerSet, isFinaleDone, cols, W, H, pad, top, cellW, rowH, ballR, availH, color };

  const targetPos = (slot: number, rows: number) => {
    const c = R.current; const col = slot % c.cols, row = Math.floor(slot / c.cols);
    const gTop = c.top + Math.max(0, (c.availH - rows * c.rowH) / 2);
    return { x: c.pad + col * c.cellW + c.cellW / 2, y: gTop + row * c.rowH + c.rowH / 2 };
  };

  useNewSteps(stageIdx, step, (steps) => {
    if (!width) return;
    for (const k of steps) {
      const victim = R.current.stageElim[k - 1]; const p = sim.current.pos.get(victim); if (!p) continue;
      const inCross = R.current.ranges.find((r) => r.ev.type === "cross" && k - 1 >= r.start && k - 1 < r.end);
      const big = !!inCross && k - 1 === inCross.start;
      sim.current.waves.push({ x: p.x, y: p.y, r: big ? 16 : 9, life: 1, w: big ? 4 : 2.5 });
      const n = big ? 30 : 16;
      for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = (big ? 3 : 2) + Math.random() * (big ? 6 : 4); sim.current.parts.push({ x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, life: 1, dec: 0.026, r: 2 + Math.random() * 3, c: i % 3 === 0 ? "#FFE7B0" : i % 2 ? ACCENT : "#ff7a4d", glow: i % 2 === 0 }); }
      for (let i = 0; i < (big ? 9 : 5); i++) sim.current.parts.push({ x: p.x + (Math.random() - 0.5) * 10, y: p.y, vx: (Math.random() - 0.5) * 0.7, vy: -0.4 - Math.random() * 0.8, life: 1, dec: 0.011, r: 4 + Math.random() * 5, c: "rgba(120,120,130,0.6)", sm: true });
      sim.current.fall.set(victim, { t: 0, x: p.x, y: p.y, id: victim });
      sim.current.shake = Math.max(sim.current.shake, big ? 9 : 4);
    }
  });

  useEffect(() => {
    const cvs = canvasRef.current; if (!cvs || W < 280) return;
    const ctx = cvs.getContext("2d"); if (!ctx) return;
    const dpr = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
    cvs.width = W * dpr; cvs.height = H * dpr; cvs.style.width = W + "px"; cvs.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sim.current.start = performance.now();
    let raf = 0;

    const bombGlyph = (x: number, y: number, r: number, tk: number) => {
      ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = "#1c1c22"; ctx.fill(); ctx.shadowBlur = 0;
      ctx.strokeStyle = "#555"; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.28, 0, Math.PI * 2); ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + r * 0.4, y - r * 0.8); ctx.quadraticCurveTo(x + r, y - r * 1.7, x + r * 0.3, y - r * 2); ctx.strokeStyle = "#9a8a70"; ctx.stroke();
      ctx.save(); ctx.shadowColor = GOLD; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(x + r * 0.3, y - r * 2, 2.4 + Math.sin(tk * 0.9) * 0.6, 0, Math.PI * 2); ctx.fillStyle = "#FFE08A"; ctx.fill(); ctx.restore();
      ctx.restore();
    };
    const pineGlyph = (x: number, y: number, r: number) => {
      ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.ellipse(x, y, r * 0.8, r, 0, 0, Math.PI * 2); ctx.fillStyle = "#5f9a2a"; ctx.fill(); ctx.shadowBlur = 0;
      ctx.strokeStyle = "#8fce55"; ctx.lineWidth = 1;
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(x - r * 0.7, y + i * r * 0.45); ctx.lineTo(x + r * 0.7, y + i * r * 0.45); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(x - r * 0.35, y - r); ctx.lineTo(x + r * 0.35, y + r); ctx.stroke();
      ctx.fillStyle = "#7a5"; ctx.fillRect(x - 2, y - r - 5, 4, 5); ctx.restore();
    };

    const frame = () => {
      const now = performance.now(); const tk = (now - sim.current.start) / 16.667;
      const c = R.current; const s = sim.current;
      const gone = new Set(c.stageElim.slice(0, c.step));
      const liv = c.gridOrder.filter((i) => !gone.has(i));
      const rows = Math.max(1, Math.ceil(liv.length / c.cols));
      const slotOf = new Map<number, number>(); liv.forEach((id, i) => slotOf.set(id, i));
      for (const id of liv) { const t = targetPos(slotOf.get(id)!, rows); const cur = s.pos.get(id) ?? { x: t.x, y: t.y }; cur.x += (t.x - cur.x) * 0.25; cur.y += (t.y - cur.y) * 0.25; s.pos.set(id, cur); }
      for (const p of s.parts) { p.x += p.vx; p.y += p.vy; if (p.sm) { p.vy *= 0.98; p.r += 0.08; } else p.vy += 0.07; p.life -= p.dec; }
      s.parts = s.parts.filter((p) => p.life > 0);
      for (const w of s.waves) { w.r += w.w * 2.4; w.life -= 0.04; }
      s.waves = s.waves.filter((w) => w.life > 0);
      s.fall.forEach((f, id) => { f.t += 1; if (f.t > 42) s.fall.delete(id); });
      s.shake *= 0.9;

      const teleR = c.ranges.find((r) => c.step >= r.start && c.step < r.end);
      const type = teleR?.ev.type ?? "";
      if (type && type !== s.phase) { s.phase = type; s.phaseAt = now; }

      const shX = Math.sin(tk * 3.1) * s.shake, shY = Math.cos(tk * 2.7) * s.shake;
      ctx.save(); ctx.translate(shX, shY);
      drawArenaBg(ctx, c.W, c.H, ACCENT, tk);

      const nextVictim = c.step < c.stageElim.length ? c.stageElim[c.step] : -1;
      // CROSS highlight
      if (teleR && teleR.ev.type === "cross") {
        const tId = teleR.ev.target!; const tslot = slotOf.get(tId); const tp = s.pos.get(tId);
        if (tslot != null && tp) {
          const tcol = tslot % c.cols, trow = Math.floor(tslot / c.cols);
          const gTop = c.top + Math.max(0, (c.availH - rows * c.rowH) / 2);
          const pulse = 0.18 + Math.sin(tk * 0.35) * 0.07;
          ctx.save(); ctx.shadowColor = RED; ctx.shadowBlur = 22;
          ctx.fillStyle = hexA(RED, pulse);
          rr(ctx, c.pad, gTop + trow * c.rowH, c.W - c.pad * 2, c.rowH, 8); ctx.fill();
          rr(ctx, c.pad + tcol * c.cellW, gTop, c.cellW, rows * c.rowH, 8); ctx.fill();
          ctx.strokeStyle = hexA(RED, 0.7); ctx.lineWidth = 1.5; ctx.setLineDash([7, 5]);
          rr(ctx, c.pad, gTop + trow * c.rowH, c.W - c.pad * 2, c.rowH, 8); ctx.stroke();
          rr(ctx, c.pad + tcol * c.cellW, gTop, c.cellW, rows * c.rowH, 8); ctx.stroke();
          ctx.setLineDash([]); ctx.restore();
          bombGlyph(tp.x, tp.y - c.ballR - 10, 9, tk);
          const remain = teleR.end - c.step;
          ctx.save(); ctx.shadowColor = remain <= 2 ? RED : ACCENT; ctx.shadowBlur = 12;
          ctx.fillStyle = remain <= 2 ? RED : remain <= 4 ? ACCENT : GOLD; ctx.font = "800 20px Inter, system-ui, sans-serif";
          ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(remain), tp.x, tp.y - c.ballR - 34); ctx.restore();
        }
      }
      // PINE
      if (teleR && teleR.ev.type === "pine") {
        const hId = teleR.ev.host!; const hp = s.pos.get(hId);
        if (hp) {
          ctx.save(); ctx.shadowColor = GREEN; ctx.shadowBlur = 14; ctx.strokeStyle = GREEN; ctx.lineWidth = 2.5; ctx.setLineDash([5, 4]);
          ctx.beginPath(); ctx.arc(hp.x, hp.y, c.ballR + 5, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
          ctx.fillStyle = GREEN; ctx.font = "700 10px Inter, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillText("SALVADO", hp.x, hp.y - c.ballR - 12); ctx.restore();
          pineGlyph(hp.x + c.ballR * 0.6, hp.y - c.ballR - 6, 8);
        }
        const nv = nextVictim >= 0 ? s.pos.get(nextVictim) : null; if (nv) pineGlyph(nv.x, nv.y - c.ballR - 6, 6);
      }
      // JUMP
      if (teleR && teleR.ev.type === "jump" && nextVictim >= 0) { const nv = s.pos.get(nextVictim); if (nv) { const hop = Math.abs(Math.sin(tk * 0.25)) * 18; bombGlyph(nv.x, nv.y - c.ballR - 6 - hop, 8, tk); } }

      // shockwaves
      for (const w of s.waves) { ctx.save(); ctx.globalAlpha = w.life; ctx.shadowColor = ACCENT; ctx.shadowBlur = 14; ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2); ctx.strokeStyle = ACCENT; ctx.lineWidth = w.w; ctx.stroke(); ctx.restore(); }
      // smoke first (behind), then debris
      for (const p of s.parts) if (p.sm) { ctx.globalAlpha = p.life * 0.4; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fillStyle = p.c; ctx.fill(); }
      ctx.globalAlpha = 1;

      // tickets
      const showName = liv.length <= 26;
      for (const id of liv) { const p = s.pos.get(id)!; const pt = c.participants[id]; drawTicket(ctx, { x: p.x, y: p.y, r: c.ballR, color: c.color(id), number: pt?.number ?? id + 1, nickname: pt?.nickname, avatarUrl: pt?.avatarUrl, mine: c.myIndices.has(id), winner: c.isFinaleDone && c.winnerSet.has(id), showName, showLabel: showName }); }
      // fallers
      s.fall.forEach((f) => { const p = f.t / 42; const pt = c.participants[f.id]; ctx.globalAlpha = 1 - p; drawTicket(ctx, { x: f.x, y: f.y + p * c.rowH, r: c.ballR * (1 - p * 0.4), color: "#2b2b33", number: pt?.number ?? f.id + 1, nickname: pt?.nickname, alpha: 1 - p, dim: true }); ctx.globalAlpha = 1; });
      // sparks on top
      for (const p of s.parts) if (!p.sm) { ctx.save(); ctx.globalAlpha = Math.max(0, p.life); if (p.glow) { ctx.shadowColor = p.c; ctx.shadowBlur = 8; } ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fillStyle = p.c; ctx.fill(); ctx.restore(); }
      ctx.globalAlpha = 1;
      ctx.restore(); // shake

      // HUD + banner (unshaken)
      const aliveCount = c.gridOrder.length - Math.min(c.step, c.stageElim.length);
      const pl = PHASE_LABEL[type];
      hudBar(ctx, c.W, { title: "Campo minado", alive: aliveCount, goal: 10, pct: c.stageElim.length ? c.step / c.stageElim.length : 1, accent: ACCENT, phase: pl?.[0] });
      if (pl && s.phaseAt > 0) { const a = 1 - Math.min(1, (now - s.phaseAt) / 1500); phaseBanner(ctx, c.W, c.H, pl[0], pl[1], a, ACCENT); }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [W, H, cols, gridOrder, ranges]);

  return (
    <div ref={ref} className="overflow-hidden rounded-2xl bg-black" style={{ height: H }}>
      <canvas ref={canvasRef} className="mx-auto block" />
    </div>
  );
}
