import { useEffect, useMemo, useRef } from "react";
import { arenaMaxH, useViewportH, useWidth, type GameProps } from "./shared";
import { drawTicket } from "./canvasTicket";
import { drawArenaBg, glassPanel, hudBar, label, rr, hexA, TXT, MUT } from "./arenaFx";

// RULETA RUSA (final) — self-timed. The server sim (show.ts rouletteSim) fixed
// the hidden chambers + which slot each shot aims. Here the REVOLVER is fixed
// and fires straight; the DRUM (ring of finalists) rotates to bring the aimed
// ticket to the muzzle, then CLICK (spared) or BANG (out). The cylinder never
// reveals its bullets — pure suspense. Timing is a function of stage elapsed ms.

const ACCENT = "#E4534E";
const PAL = ["#8B7BF0", "#3FBF8F", "#F08A5D", "#EA6A9A", "#5AA0F0", "#F0B24A"];
const GOLD = "#F5B301", BONE = "#E7E5DC", RED = "#ff5555";
const LOAD = 1900, SPIN1 = 1300, SPIN2 = 480, AIM = 720, RESULT = 720;
const ease = (p: number) => 1 - Math.pow(1 - p, 3);

interface Shot { cycle: number; bullets: number; shot: number; aimedSlot: number; aimed: number; hit: boolean }
interface Item { sh: Shot; loadStart: number; spinStart: number; spinEnd: number; Rfrom: number; Rto: number; aimEnd: number; fireAt: number; resultEnd: number }
interface Sched { items: Item[]; totalMs: number; elimTimes: number[]; elimAt: Map<number, number>; N: number }

function build(stage: any): Sched {
  const slots: number[] = stage.data?.slots ?? stage.aliveBefore ?? [];
  const shots: Shot[] = stage.data?.shots ?? [];
  const N = Math.max(1, slots.length); const STEP = (Math.PI * 2) / N;
  const items: Item[] = []; const elimAt = new Map<number, number>(); const elimTimes: number[] = [];
  let t = 300, R = 0, prevCycle = 0;
  for (const sh of shots) {
    let loadStart = -1;
    if (sh.cycle !== prevCycle) { loadStart = t; t += LOAD; prevCycle = sh.cycle; }
    const first = sh.shot === 0;
    const spinStart = t, spinDur = first ? SPIN1 : SPIN2, spinEnd = t + spinDur;
    const Rfrom = R;
    const base = -sh.aimedSlot * STEP;
    let delta = ((R - base) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    const Rto = R - delta - (first ? Math.PI * 2 * 3 : 0);
    const aimEnd = spinEnd + AIM, fireAt = aimEnd, resultEnd = fireAt + RESULT;
    items.push({ sh, loadStart, spinStart, spinEnd, Rfrom, Rto, aimEnd, fireAt, resultEnd });
    if (sh.hit) { elimAt.set(sh.aimedSlot, fireAt); elimTimes.push(fireAt); }
    R = Rto; t = resultEnd;
  }
  elimTimes.sort((a, b) => a - b);
  return { items, totalMs: t + 900, elimTimes, elimAt, N };
}

export function duration(stage: any): number { return build(stage).totalMs; }
export function elimCountAt(stage: any, ms: number): number { const s = build(stage); let n = 0; for (const e of s.elimTimes) if (e <= ms) n++; return n; }

export default function RouletteGame({ participants, stage, myIndices, winnerSet, isFinaleDone, stageStartMs, speed }: GameProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const vh = useViewportH();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const slots: number[] = stage.data?.slots ?? stage.aliveBefore ?? [];
  const sched = useMemo(() => build(stage), [stage]);
  const color = (i: number) => PAL[(participants[i]?.number ?? i) % PAL.length];
  const H = Math.min(arenaMaxH(vh), 500);
  const W = Math.max(280, Math.min(width || 0, 720));

  const clockBase = useRef(0);
  useEffect(() => { clockBase.current = typeof performance !== "undefined" ? performance.now() : 0; }, [stageStartMs]);
  const sim = useRef({ parts: [] as any[], shake: 0, lastMs: -1 });
  const Rf = useRef({ participants, myIndices, winnerSet, isFinaleDone, slots, color, W, H, N: sched.N });
  Rf.current = { participants, myIndices, winnerSet, isFinaleDone, slots, color, W, H, N: sched.N };

  useEffect(() => {
    const cvs = canvasRef.current; if (!cvs || W < 280) return;
    const ctx = cvs.getContext("2d"); if (!ctx) return;
    const dpr = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
    cvs.width = W * dpr; cvs.height = H * dpr; cvs.style.width = W + "px"; cvs.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let raf = 0;
    const nowMs = () => (stageStartMs != null ? Date.now() - stageStartMs : (performance.now() - clockBase.current) * (speed ?? 1));

    const drawSkull = (x: number, y: number, s: number) => {
      ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
      ctx.beginPath(); ctx.arc(0, -1.5, 7, 0, Math.PI * 2); ctx.fillStyle = BONE; ctx.fill();
      rr(ctx, -4.5, 3, 9, 5, 1.5); ctx.fill();
      ctx.fillStyle = "#15130f"; ctx.beginPath(); ctx.arc(-2.8, -2, 2, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(2.8, -2, 2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    };
    // fixed revolver, barrel pointing LEFT toward the muzzle point mx,my
    const drawGun = (mx: number, my: number, scale: number, recoil: number, hammer: number, cylOff: number, flash: number) => {
      ctx.save(); ctx.translate(mx + recoil, my); ctx.scale(scale, scale);
      const steel = "#3c3c42", steel2 = "#4a4a52", line = "#6b6b74";
      ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 10;
      // barrel to the right of muzzle (muzzle at x=0)
      ctx.strokeStyle = line; ctx.lineWidth = 1.5;
      ctx.fillStyle = steel; rr(ctx, 2, -7, 44, 14, 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#2b2b31"; rr(ctx, 4, -4, 40, 3, 1.5); ctx.fill(); // barrel groove
      // frame
      ctx.fillStyle = steel2; rr(ctx, 44, -18, 40, 36, 8); ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;
      // cylinder — SOLID, no chambers visible (hidden drum); swings out on load
      ctx.save(); ctx.translate(64, 2 + cylOff * 26); ctx.rotate(cylOff * 0.2);
      const cg = ctx.createRadialGradient(-4, -4, 2, 0, 0, 17); cg.addColorStop(0, "#54545c"); cg.addColorStop(1, "#2b2b31");
      ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(0, 0, 17, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = line; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fillStyle = "#17161b"; ctx.fill();
      ctx.restore();
      // hammer
      ctx.save(); ctx.translate(82, -16); ctx.rotate(-hammer * 0.7); ctx.fillStyle = steel; rr(ctx, -2, -12, 6, 15, 2); ctx.fill(); ctx.stroke(); ctx.restore();
      // grip
      ctx.save(); ctx.translate(78, 14); ctx.rotate(0.5); ctx.fillStyle = "#4A1B0C"; ctx.strokeStyle = "#7a2f16"; rr(ctx, -8, -2, 18, 42, 7); ctx.fill(); ctx.stroke(); ctx.restore();
      // trigger guard
      ctx.strokeStyle = line; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(60, 20, 9, 0.2, Math.PI - 0.2); ctx.stroke();
      // muzzle flash (straight, to the left)
      if (flash > 0) { ctx.save(); ctx.shadowColor = GOLD; ctx.shadowBlur = 22; ctx.fillStyle = "#FFE08A"; const fr = 14 + flash * 22; for (let i = 0; i < 8; i++) { ctx.rotate(Math.PI / 4); const len = i % 2 ? fr : fr * 0.5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 3); ctx.lineTo(len + 7, 0); ctx.lineTo(len, -3); ctx.closePath(); ctx.fill(); } ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill(); ctx.restore(); }
      ctx.restore();
    };

    const frame = () => {
      const c = Rf.current; const s = sim.current; const ms = nowMs(); const tk = performance.now() / 16.667; const N = c.N; const STEP = (Math.PI * 2) / N;
      // rotation + current item/phase
      let R = 0, item: Item | undefined, phase = "idle";
      for (const it of sched.items) { if (ms < it.resultEnd) { item = it; break; } }
      if (!item && sched.items.length) item = sched.items[sched.items.length - 1];
      if (item) {
        if (ms < item.spinStart) { R = item.Rfrom; phase = item.loadStart >= 0 && ms >= item.loadStart ? "load" : "wait"; }
        else if (ms < item.spinEnd) { R = item.Rfrom + (item.Rto - item.Rfrom) * ease((ms - item.spinStart) / (item.spinEnd - item.spinStart)); phase = "spin"; }
        else if (ms < item.aimEnd) { R = item.Rto; phase = "aim"; }
        else { R = item.Rto; phase = "result"; }
      }
      const deadSlots = new Set<number>(); sched.elimAt.forEach((t2, slot) => { if (t2 <= ms) deadSlots.add(slot); });
      // bang FX on crossing
      if (s.lastMs >= 0) sched.elimAt.forEach((t2, slot) => { if (t2 > s.lastMs && t2 <= ms) { s.shake = Math.max(s.shake, 8); const id = c.slots[slot]; for (let i = 0; i < 20; i++) { const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 5; s.parts.push({ x: 0, y: 0, slot, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, life: 1, r: 2 + Math.random() * 3, c: i % 2 ? ACCENT : c.color(id), glow: i % 2 === 0 }); } } });
      s.lastMs = ms;
      for (const p of s.parts) { p.x += p.vx; p.y += p.vy; p.vy += 0.07; p.life -= 0.026; }
      s.parts = s.parts.filter((p: any) => p.life > 0);
      s.shake *= 0.86;

      // layout — compact
      const rcx = W * 0.40, rcy = 66 + (H - 66) / 2, RAD = Math.min(W * 0.24, (H - 96) * 0.42);
      const mx = rcx + RAD + 20, my = rcy; // muzzle point (aimed ticket sits at rcx+RAD,rcy)
      const gunScale = Math.max(0.62, Math.min(0.9, RAD / 150));
      const ballR = Math.max(12, RAD * 0.2);
      const slotPos = (slot: number) => { const a = R + slot * STEP; return { x: rcx + Math.cos(a) * RAD, y: rcy + Math.sin(a) * RAD }; };

      const flash = item && phase === "result" && ms - item.fireAt < 160 ? 1 - (ms - item.fireAt) / 160 : 0;
      const hammer = item && phase === "aim" ? Math.min(1, (ms - item.spinEnd) / AIM) : 0;
      let cylOff = 0;
      if (item && item.loadStart >= 0 && phase === "load") { const lp = (ms - item.loadStart) / LOAD; cylOff = lp < 0.3 ? lp / 0.3 : lp > 0.75 ? Math.max(0, 1 - (lp - 0.75) / 0.25) : 1; }

      const shX = Math.sin(tk * 3.1) * s.shake, shY = Math.cos(tk * 2.7) * s.shake;
      ctx.save(); ctx.translate(shX, shY);
      drawArenaBg(ctx, W, H, ACCENT, tk);
      // drum ring track
      ctx.save(); ctx.strokeStyle = "rgba(255,255,255,0.06)"; ctx.lineWidth = RAD * 0.34; ctx.beginPath(); ctx.arc(rcx, rcy, RAD, 0, Math.PI * 2); ctx.stroke(); ctx.restore();

      // aim guide (short, straight, muzzle → aimed ticket) during aim/result
      if (item && (phase === "aim" || phase === "result") && !deadSlots.has(item.sh.aimedSlot)) {
        const tp = { x: rcx + RAD, y: rcy };
        ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = hexA(RED, 0.6); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(tp.x, tp.y); ctx.stroke(); ctx.setLineDash([]);
        if (phase === "aim") { ctx.shadowColor = RED; ctx.shadowBlur = 14; ctx.beginPath(); ctx.arc(tp.x, tp.y, ballR + 6 + Math.sin(tk * 0.45) * 2, 0, Math.PI * 2); ctx.strokeStyle = RED; ctx.lineWidth = 3; ctx.stroke(); } ctx.restore();
      }

      // center dial
      const dialR = RAD * 0.34; glassPanel(ctx, rcx - dialR, rcy - dialR, dialR * 2, dialR * 2, dialR);
      const alive = N - deadSlots.size;
      label(ctx, "VIVOS", rcx, rcy - dialR * 0.42, { size: 10, color: MUT, align: "center", weight: 700, spacing: 1.5, upper: true });
      label(ctx, String(alive), rcx, rcy + dialR * 0.18, { size: dialR * 0.75, color: TXT, align: "center", weight: 800 });

      // finalists
      for (let slot = 0; slot < N; slot++) {
        const id = c.slots[slot]; const p = slotPos(slot); const pt = c.participants[id]; const dead = deadSlots.has(slot);
        if (dead) { drawTicket(ctx, { x: p.x, y: p.y, r: ballR, color: "#2b2b33", number: pt?.number ?? id + 1, nickname: pt?.nickname, avatarUrl: pt?.avatarUrl, dim: true, showLabel: false }); drawSkull(p.x, p.y - 1, ballR / 6.5); }
        else drawTicket(ctx, { x: p.x, y: p.y, r: ballR, color: c.color(id), number: pt?.number ?? id + 1, nickname: pt?.nickname, avatarUrl: pt?.avatarUrl, mine: c.myIndices.has(id), winner: c.isFinaleDone && c.winnerSet.has(id), showName: true });
      }
      // bang particles (positioned at aimed ticket = right point)
      for (const p of s.parts) { ctx.save(); ctx.globalAlpha = p.life; if (p.glow) { ctx.shadowColor = p.c; ctx.shadowBlur = 8; } ctx.beginPath(); ctx.arc(rcx + RAD + p.x, rcy + p.y, p.r, 0, Math.PI * 2); ctx.fillStyle = p.c; ctx.fill(); ctx.restore(); }
      ctx.globalAlpha = 1;

      drawGun(mx, my, gunScale, flash > 0 ? 5 : 0, hammer, cylOff, flash);

      // CLICK / BANG
      if (item && phase === "result") {
        const dt = ms - item.fireAt;
        if (item.sh.hit && dt < 500) { ctx.save(); ctx.globalAlpha = Math.min(1, (500 - dt) / 200); ctx.shadowColor = RED; ctx.shadowBlur = 16; label(ctx, "¡BANG!", rcx + RAD, rcy - ballR - 22, { size: 26, color: RED, align: "center", weight: 800, spacing: 1 }); ctx.restore(); }
        else if (!item.sh.hit && dt < 420) { ctx.save(); ctx.globalAlpha = Math.min(1, (420 - dt) / 160); label(ctx, "CLICK", rcx + RAD, rcy - ballR - 22, { size: 19, color: "#c9c9d2", align: "center", weight: 800, spacing: 2 }); ctx.restore(); }
      }
      // load caption
      if (phase === "load") label(ctx, "Cargando el tambor…", rcx, rcy + RAD + 22, { size: 12, color: MUT, align: "center", weight: 600 });

      ctx.restore();
      const cyc = item?.sh.cycle ?? 1;
      hudBar(ctx, W, { title: "Ruleta rusa · la final", alive, goal: c.winnerSet.size || 1, pct: sched.totalMs ? Math.min(1, ms / sched.totalMs) : 1, accent: ACCENT, phase: `Ciclo ${cyc}` });
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
