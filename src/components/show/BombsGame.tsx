import { useEffect, useMemo, useRef } from "react";
import { arenaMaxH, useViewportH, useWidth, type GameProps } from "./shared";
import { drawTicket } from "./canvasTicket";
import { drawArenaBg, hudBar, phaseBanner, rr, hexA } from "./arenaFx";

// BOMBAS "campo minado" — self-timed scripted show. The server sim (show.ts
// bombsSim) decides WHO falls (cross = row+column, pineapple = host saved +
// neighbours, jump = single) and emits an ordered event script; here we
// choreograph it with real suspense: phase announcements, the cross bomb
// roaming + a 3-2-1 count before it wipes the row/column, the pineapple's
// drop-bounce-burst, the jumping bomb's fake-outs. Everything is a pure
// function of stage elapsed ms, so it stays synced across viewers.

const ACCENT = "#FF5A2A";
const PAL = ["#8B7BF0", "#3FBF8F", "#F08A5D", "#EA6A9A", "#5AA0F0", "#F0B24A"];
const RED = "#ff4d4d", GREEN = "#4fd6a0", GOLD = "#F5B301";
const PHASE_LABEL: Record<string, [string, string]> = {
  cross: ["Bomba cruz", "borra su fila y su columna"],
  pine: ["Granada piña", "el impactado se salva · sus vecinos no"],
  jump: ["Bomba saltarina", "salta entre tickets · elimina donde aterriza"],
};
// choreography durations (ms)
const ANN = 1300, SWEEP = 1700, COUNT_EACH = 640, DET_TAIL = 160, VIC_STAGGER = 150;
const DROP = 620, BOUNCE = 720, SIT = 760, PINE_STAGGER = 170;
const HOP = 520, LAND = 520;

interface Ev { type: string; target?: number; host?: number; victim?: number; victims?: number[]; decoys?: number[] }
interface SEv { type: string; host?: number; target?: number; victims: number[]; decoys: number[]; t0: number; annEnd: number; actEnd: number; detAt: number; elimAt: Map<number, number>; tEnd: number }
interface Schedule { evs: SEv[]; totalMs: number; elimTimes: number[]; elimAtGlobal: Map<number, number>; cols: number; gridOrder: number[] }

function build(stage: any): Schedule {
  const cols = stage.data?.cols ?? 10;
  const gridOrder: number[] = stage.data?.gridOrder ?? stage.aliveBefore ?? [];
  const events: Ev[] = stage.data?.events ?? (stage.eliminated ?? []).map((v: number) => ({ type: "jump", victim: v }));
  const evs: SEv[] = []; const elimAtGlobal = new Map<number, number>(); const elimTimes: number[] = [];
  let t = 500; let prev: string | null = null;
  for (const ev of events) {
    const victims = ev.victims ?? (ev.victim != null ? [ev.victim] : []);
    const decoys = ev.decoys ?? [];
    const t0 = t; const ann = ev.type !== prev; prev = ev.type;
    const annEnd = t0 + (ann ? ANN : 0);
    const elimAt = new Map<number, number>();
    let actEnd = annEnd, detAt = annEnd;
    if (ev.type === "cross") {
      detAt = annEnd + SWEEP + COUNT_EACH * 3;
      victims.forEach((id, i) => elimAt.set(id, detAt + DET_TAIL + i * VIC_STAGGER));
      actEnd = detAt + DET_TAIL + Math.max(1, victims.length) * VIC_STAGGER + 500;
    } else if (ev.type === "pine") {
      detAt = annEnd + DROP + BOUNCE + SIT; // burst
      victims.forEach((id, i) => elimAt.set(id, detAt + 200 + i * PINE_STAGGER));
      actEnd = detAt + 200 + Math.max(1, victims.length) * PINE_STAGGER + 500;
    } else {
      const hops = Math.max(1, decoys.length);
      detAt = annEnd + hops * HOP + LAND;
      victims.forEach((id) => elimAt.set(id, detAt));
      actEnd = detAt + 550;
    }
    elimAt.forEach((ms, id) => { elimAtGlobal.set(id, ms); elimTimes.push(ms); });
    t = actEnd;
    evs.push({ type: ev.type, host: ev.host, target: ev.target, victims, decoys, t0, annEnd, actEnd, detAt, elimAt, tEnd: t });
  }
  elimTimes.sort((a, b) => a - b);
  return { evs, totalMs: t + 600, elimTimes, elimAtGlobal, cols, gridOrder };
}

export function duration(stage: any): number { return build(stage).totalMs; }
export function elimCountAt(stage: any, ms: number): number { const s = build(stage); let n = 0; for (const e of s.elimTimes) if (e <= ms) n++; return n; }

export default function BombsGame({ participants, stage, myIndices, winnerSet, isFinaleDone, stageStartMs, speed }: GameProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const vh = useViewportH();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sched = useMemo(() => build(stage), [stage]);
  const color = (i: number) => PAL[(participants[i]?.number ?? i) % PAL.length];

  const H = Math.min(arenaMaxH(vh), 520);
  const W = Math.max(280, Math.min(width || 0, 760));
  const pad = 16, top = 66;
  const maxRows = Math.max(1, Math.ceil(sched.gridOrder.length / sched.cols));
  const availH = H - top - 12;
  const cellW = (W - pad * 2) / sched.cols;
  const rowH = Math.max(30, Math.min(78, availH / maxRows));
  const ballR = Math.max(11, Math.min(cellW, rowH) * 0.4);

  const clockBase = useRef(0);
  useEffect(() => { clockBase.current = typeof performance !== "undefined" ? performance.now() : 0; }, [stageStartMs]);

  const sim = useRef({ parts: [] as any[], waves: [] as any[], fall: new Map<number, any>(), pos: new Map<number, { x: number; y: number }>(), shake: 0, lastMs: -1, phaseAt: 0, phase: "" });
  const R = useRef({ participants, myIndices, winnerSet, isFinaleDone, color, W, H, pad, top, cellW, rowH, ballR, availH });
  R.current = { participants, myIndices, winnerSet, isFinaleDone, color, W, H, pad, top, cellW, rowH, ballR, availH };

  useEffect(() => {
    const cvs = canvasRef.current; if (!cvs || W < 280) return;
    const ctx = cvs.getContext("2d"); if (!ctx) return;
    const dpr = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
    cvs.width = W * dpr; cvs.height = H * dpr; cvs.style.width = W + "px"; cvs.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let raf = 0;
    const nowMs = () => (stageStartMs != null ? Date.now() - stageStartMs : (performance.now() - clockBase.current) * (speed ?? 1));

    const targetPos = (slot: number, rows: number) => {
      const c = R.current; const col = slot % sched.cols, row = Math.floor(slot / sched.cols);
      const gTop = c.top + Math.max(0, (c.availH - rows * c.rowH) / 2);
      return { x: c.pad + col * c.cellW + c.cellW / 2, y: gTop + row * c.rowH + c.rowH / 2 };
    };
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
    const boom = (x: number, y: number, big: boolean) => {
      const s = sim.current; s.waves.push({ x, y, r: big ? 16 : 9, life: 1, w: big ? 4 : 2.5 });
      for (let i = 0; i < (big ? 30 : 16); i++) { const a = Math.random() * Math.PI * 2, sp = (big ? 3 : 2) + Math.random() * (big ? 6 : 4); s.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, life: 1, dec: 0.026, r: 2 + Math.random() * 3, c: i % 3 === 0 ? "#FFE7B0" : i % 2 ? ACCENT : "#ff7a4d", glow: i % 2 === 0 }); }
      s.shake = Math.max(s.shake, big ? 9 : 4);
    };

    const frame = () => {
      const c = R.current; const s = sim.current; const ms = nowMs(); const tk = (typeof performance !== "undefined" ? performance.now() : 0) / 16.667;
      // gone set from schedule
      const gone = new Set<number>(); sched.elimAtGlobal.forEach((t2, id) => { if (t2 <= ms) gone.add(id); });
      // spawn booms for elim times crossed since last frame
      if (s.lastMs >= 0) sched.elimAtGlobal.forEach((t2, id) => { if (t2 > s.lastMs && t2 <= ms) { const p = s.pos.get(id); if (p) { boom(p.x, p.y, false); s.fall.set(id, { t: 0, x: p.x, y: p.y, id }); } } });
      s.lastMs = ms;

      const liv = sched.gridOrder.filter((i) => !gone.has(i));
      const rows = Math.max(1, Math.ceil(liv.length / sched.cols));
      const slotOf = new Map<number, number>(); liv.forEach((id, i) => slotOf.set(id, i));
      for (const id of liv) { const tt = targetPos(slotOf.get(id)!, rows); const cur = s.pos.get(id) ?? { x: tt.x, y: tt.y }; cur.x += (tt.x - cur.x) * 0.25; cur.y += (tt.y - cur.y) * 0.25; s.pos.set(id, cur); }

      for (const p of s.parts) { p.x += p.vx; p.y += p.vy; p.vy += 0.07; p.life -= p.dec; }
      s.parts = s.parts.filter((p: any) => p.life > 0);
      for (const w of s.waves) { w.r += w.w * 2.4; w.life -= 0.04; }
      s.waves = s.waves.filter((w: any) => w.life > 0);
      s.fall.forEach((f: any, id: number) => { f.t += 1; if (f.t > 42) s.fall.delete(id); });
      s.shake *= 0.9;

      // active event
      const ev = sched.evs.find((e) => ms >= e.t0 && ms < e.tEnd) ?? (ms >= sched.totalMs ? sched.evs[sched.evs.length - 1] : undefined);
      if (ev && ev.type !== s.phase) { s.phase = ev.type; s.phaseAt = ms; }

      const shX = Math.sin(tk * 3.1) * s.shake, shY = Math.cos(tk * 2.7) * s.shake;
      ctx.save(); ctx.translate(shX, shY);
      drawArenaBg(ctx, c.W, c.H, ACCENT, tk);

      // telegraph for the active event (only while it's "arming", before its victims fall)
      if (ev) {
        if (ev.type === "cross" && ev.target != null) {
          const tp = s.pos.get(ev.target); const tslot = slotOf.get(ev.target);
          const arming = ms < ev.detAt;
          if (tp && tslot != null) {
            const tcol = tslot % sched.cols, trow = Math.floor(tslot / sched.cols);
            const gTop = c.top + Math.max(0, (c.availH - rows * c.rowH) / 2);
            const pulse = 0.16 + Math.sin(tk * 0.35) * 0.06;
            ctx.save(); ctx.shadowColor = RED; ctx.shadowBlur = 22; ctx.fillStyle = hexA(RED, arming ? pulse * 0.7 : pulse);
            rr(ctx, c.pad, gTop + trow * c.rowH, c.W - c.pad * 2, c.rowH, 8); ctx.fill();
            rr(ctx, c.pad + tcol * c.cellW, gTop, c.cellW, rows * c.rowH, 8); ctx.fill();
            ctx.strokeStyle = hexA(RED, 0.7); ctx.lineWidth = 1.5; ctx.setLineDash([7, 5]);
            rr(ctx, c.pad, gTop + trow * c.rowH, c.W - c.pad * 2, c.rowH, 8); ctx.stroke();
            rr(ctx, c.pad + tcol * c.cellW, gTop, c.cellW, rows * c.rowH, 8); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
            // roaming/settling bomb + 3-2-1 count
            const countStart = ev.annEnd + SWEEP;
            let bx = tp.x, by = tp.y - c.ballR - 12;
            if (ms < countStart && ms >= ev.annEnd) { const sp = (ms - ev.annEnd) / SWEEP; bx = tp.x + Math.cos(sp * Math.PI * 4) * c.cellW * 1.4 * (1 - sp); by = tp.y - c.ballR - 12 + Math.sin(sp * Math.PI * 3) * 10; }
            bombGlyph(bx, by, 9, tk);
            if (ms >= countStart && ms < ev.detAt) {
              const n = 3 - Math.floor((ms - countStart) / COUNT_EACH);
              ctx.save(); ctx.shadowColor = n <= 1 ? RED : ACCENT; ctx.shadowBlur = 14; ctx.fillStyle = n <= 1 ? RED : n === 2 ? ACCENT : GOLD;
              ctx.font = "800 26px Inter, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(Math.max(1, n)), tp.x, tp.y - c.ballR - 40); ctx.restore();
            }
          }
        } else if (ev.type === "pine" && ev.host != null) {
          const hp = s.pos.get(ev.host);
          if (hp) {
            const rel = ms - ev.annEnd;
            let gy = hp.y - c.ballR - 8;
            if (rel < DROP) gy = -30 + (hp.y - c.ballR - 8 + 30) * Math.pow(rel / DROP, 2);
            else if (rel < DROP + BOUNCE) { const p = (rel - DROP) / BOUNCE; gy = hp.y - c.ballR - 8 - Math.abs(Math.sin(p * Math.PI * 2.4)) * 20 * (1 - p); }
            ctx.save(); ctx.shadowColor = GREEN; ctx.shadowBlur = 14; ctx.strokeStyle = GREEN; ctx.lineWidth = 2.5; ctx.setLineDash([5, 4]);
            ctx.beginPath(); ctx.arc(hp.x, hp.y, c.ballR + 5, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
            ctx.fillStyle = GREEN; ctx.font = "700 10px Inter, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillText("SALVADO", hp.x, hp.y - c.ballR - 14); ctx.restore();
            if (ms < ev.detAt) pineGlyph(hp.x, gy, 10);
            // mini pineapples flying to victims
            if (ms >= ev.detAt) ev.victims.forEach((id) => { const vm = ev.elimAt.get(id)!; if (ms < vm) { const vp = s.pos.get(id); if (vp) { const p = 1 - (vm - ms) / (PINE_STAGGER * 3 + 200); const px = hp.x + (vp.x - hp.x) * Math.max(0, p), py = hp.y + (vp.y - hp.y) * Math.max(0, p) - Math.sin(Math.max(0, p) * Math.PI) * 30; pineGlyph(px, py, 6); } } });
          }
        } else if (ev.type === "jump" && ev.victims[0] != null) {
          const vp = s.pos.get(ev.victims[0]);
          if (vp && ms < ev.detAt) { const hop = Math.abs(Math.sin((ms - ev.annEnd) / HOP * Math.PI)) * 22; bombGlyph(vp.x, vp.y - c.ballR - 6 - hop, 8, tk); }
        }
        // announcement banner
        if (ev.annEnd > ev.t0 && ms < ev.annEnd) { const p = (ms - ev.t0) / ANN; const a = p < 0.2 ? p / 0.2 : p > 0.8 ? (1 - p) / 0.2 : 1; const pl = PHASE_LABEL[ev.type]; if (pl) phaseBanner(ctx, c.W, c.H, pl[0], pl[1], a, ACCENT); }
      }

      for (const w of s.waves) { ctx.save(); ctx.globalAlpha = w.life; ctx.shadowColor = ACCENT; ctx.shadowBlur = 14; ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2); ctx.strokeStyle = ACCENT; ctx.lineWidth = w.w; ctx.stroke(); ctx.restore(); }
      const showName = liv.length <= 26;
      for (const id of liv) { const p = s.pos.get(id)!; const pt = c.participants[id]; drawTicket(ctx, { x: p.x, y: p.y, r: c.ballR, color: c.color(id), number: pt?.number ?? id + 1, nickname: pt?.nickname, avatarUrl: pt?.avatarUrl, mine: c.myIndices.has(id), winner: c.isFinaleDone && c.winnerSet.has(id), showName }); }
      s.fall.forEach((f: any) => { const p = f.t / 42; const pt = c.participants[f.id]; ctx.globalAlpha = 1 - p; drawTicket(ctx, { x: f.x, y: f.y + p * c.rowH, r: c.ballR * (1 - p * 0.4), color: "#2b2b33", number: pt?.number ?? f.id + 1, nickname: pt?.nickname, alpha: 1 - p, dim: true, showLabel: false }); ctx.globalAlpha = 1; });
      for (const p of s.parts) { ctx.save(); ctx.globalAlpha = Math.max(0, p.life); if (p.glow) { ctx.shadowColor = p.c; ctx.shadowBlur = 8; } ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fillStyle = p.c; ctx.fill(); ctx.restore(); }
      ctx.globalAlpha = 1;
      ctx.restore();

      const aliveCount = sched.gridOrder.length - gone.size;
      hudBar(ctx, c.W, { title: "Campo minado", alive: aliveCount, goal: 10, pct: sched.totalMs ? Math.min(1, ms / sched.totalMs) : 1, accent: ACCENT, phase: ev ? PHASE_LABEL[ev.type]?.[0] : undefined });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [W, H, sched, stageStartMs, speed]);

  return (
    <div ref={ref} className="overflow-hidden rounded-2xl bg-black" style={{ height: H }}>
      <canvas ref={canvasRef} className="mx-auto block" />
    </div>
  );
}
