import { useEffect, useMemo, useRef } from "react";
import { arenaMaxH, useViewportH, useWidth, type GameProps } from "./shared";
import { drawTicket } from "./canvasTicket";
import { drawArenaBg, hudBar, label, rr, hexA, TXT, MUT } from "./arenaFx";

// RULETA RUSA (final) - self-timed, faithful to the owner's "tambor oculto"
// design. The REVOLVER is fixed on the right and fires STRAIGHT left; the DRUM
// (ring of finalists) rotates to bring the aimed ticket in front of the muzzle.
// Each cycle the cylinder swings open, bullets fly in and disappear (the
// chambers are never shown → pure suspense), it closes and whirls, then shot by
// shot: spin/advance → aim (hammer cocks, laser locks) → CLICK (spared) or
// ¡BANG! (skull). WHO dies comes from the server (stage.data.shots); everything
// here is a pure function of stage elapsed ms so all viewers stay in sync.

const ACCENT = "#E4534E";
const PAL = ["#8B7BF0", "#3FBF8F", "#F08A5D", "#EA6A9A", "#5AA0F0", "#F0B24A"];
const GOLD = "#F5B301", BONE = "#E7E5DC", RED = "#ff5555", ORG = "#EF9F27";
const ease = (p: number) => 1 - Math.pow(1 - p, 3);
const smooth = (p: number) => p * p * (3 - 2 * p);

// ---- choreography timing (ms) - ticks of the original * 16.667
const OPEN = 440, INS_EACH = 280, CLOSE = 340, WHIRL = 1250;
const SPIN1 = 2300, SPIN2 = 420, AIM = 640, RESULT = 660, CELEB = 4600;

// ---- design space (uniformly scaled to fit) - geometry from the reference
const DW = 660, DH = 420;
const CXW = 172, CYW = 208, DRAD = 124; // drum ring
const GX = 492, GY = 208, MZ = GX - 100; // gun + muzzle
const BALLR = 16;

interface Shot { cycle: number; bullets: number; shot: number; aimedSlot: number; aimed: number; hit: boolean }
interface Item {
  sh: Shot;
  // load sub-phases (cycle start only; -1 when absent)
  openAt: number; insAt: number; closeAt: number; whirlAt: number;
  spinStart: number; spinEnd: number; first: boolean;
  Rfrom: number; Rto: number;
  fireAt: number; resultEnd: number;
}
interface Sched { items: Item[]; totalMs: number; celebAt: number; elimTimes: number[]; elimAt: Map<number, number>; N: number }

function build(stage: any): Sched {
  const slots: number[] = stage.data?.slots ?? stage.aliveBefore ?? [];
  const shots: Shot[] = stage.data?.shots ?? [];
  const N = Math.max(1, slots.length); const STEP = (Math.PI * 2) / N;
  const items: Item[] = []; const elimAt = new Map<number, number>(); const elimTimes: number[] = [];
  let t = 400, R = 0, prevCycle = 0;
  for (const sh of shots) {
    let openAt = -1, insAt = -1, closeAt = -1, whirlAt = -1;
    if (sh.cycle !== prevCycle) {
      openAt = t; insAt = openAt + OPEN; closeAt = insAt + sh.bullets * INS_EACH; whirlAt = closeAt + CLOSE;
      t = whirlAt + WHIRL; prevCycle = sh.cycle;
    }
    const first = sh.shot === 0;
    const spinStart = t, spinEnd = t + (first ? SPIN1 : SPIN2);
    const Rfrom = R;
    const base = -sh.aimedSlot * STEP;
    let delta = ((R - base) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    if (!first && delta < 1e-6) delta = Math.PI * 2; // always visibly advance
    const Rto = R - delta - (first ? Math.PI * 2 * 4 : 0);
    const fireAt = spinEnd + AIM, resultEnd = fireAt + RESULT;
    items.push({ sh, openAt, insAt, closeAt, whirlAt, spinStart, spinEnd, first, Rfrom, Rto, fireAt, resultEnd });
    if (sh.hit) { elimAt.set(sh.aimedSlot, fireAt); elimTimes.push(fireAt); }
    R = Rto; t = resultEnd;
  }
  elimTimes.sort((a, b) => a - b);
  return { items, totalMs: t + CELEB, celebAt: t, elimTimes, elimAt, N };
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
  const sim = useRef({ parts: [] as any[], confetti: [] as any[], shake: 0, lastMs: -1 });
  const Rf = useRef({ participants, myIndices, winnerSet, isFinaleDone, slots, color, W, H });
  Rf.current = { participants, myIndices, winnerSet, isFinaleDone, slots, color, W, H };

  useEffect(() => {
    const cvs = canvasRef.current; if (!cvs || W < 280) return;
    const ctx = cvs.getContext("2d"); if (!ctx) return;
    const dpr = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
    cvs.width = W * dpr; cvs.height = H * dpr; cvs.style.width = W + "px"; cvs.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let raf = 0;
    const nowMs = () => (stageStartMs != null ? Date.now() - stageStartMs : (performance.now() - clockBase.current) * (speed ?? 1));
    const N = sched.N; const STEP = (Math.PI * 2) / N;

    const drawSkull = (x: number, y: number, s: number, a: number) => {
      if (s <= 0.01) return;
      ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.globalAlpha = a;
      ctx.beginPath(); ctx.arc(0, -1.5, 7, 0, Math.PI * 2); ctx.fillStyle = BONE; ctx.fill();
      rr(ctx, -4.5, 3, 9, 5, 1.5); ctx.fill();
      ctx.fillStyle = "#15130f";
      ctx.beginPath(); ctx.arc(-2.8, -2, 2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(2.8, -2, 2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, 0.5); ctx.lineTo(-1.2, 3); ctx.lineTo(1.2, 3); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#15130f"; ctx.lineWidth = 0.8;
      for (const lx of [-2, 0, 2]) { ctx.beginPath(); ctx.moveTo(lx, 4); ctx.lineTo(lx, 7.5); ctx.stroke(); }
      ctx.restore(); ctx.globalAlpha = 1;
    };

    // Fixed revolver aiming LEFT - geometry ported from the reference design.
    const drawGun = (recoil: number, hamm: number, cylOff: number, cylSpin: number, whirlA: number) => {
      const gx = GX + recoil, gy = GY;
      const steel = "#3c3c42", steel2 = "#4c4c54", line = "#71717c";
      ctx.save(); ctx.translate(gx, gy);
      ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.55)"; ctx.shadowBlur = 14; ctx.shadowOffsetY = 5;
      ctx.fillStyle = steel; rr(ctx, -100, -6, 82, 13, 3); ctx.fill(); ctx.restore();
      ctx.lineWidth = 1.5; ctx.strokeStyle = line;
      // ejector rod under the barrel
      ctx.fillStyle = steel2; rr(ctx, -64, 6, 44, 5, 2); ctx.fill(); ctx.stroke();
      // barrel
      ctx.fillStyle = steel; rr(ctx, -100, -6, 82, 13, 3); ctx.fill(); ctx.stroke();
      // front sight
      ctx.fillStyle = steel2; rr(ctx, -98, -10, 6, 5, 1); ctx.fill();
      // frame
      ctx.fillStyle = steel; rr(ctx, -20, -14, 58, 28, 5); ctx.fill(); ctx.stroke();
      // open frame window when the cylinder swings out
      if (cylOff > 0.05) {
        ctx.fillStyle = "#211c18"; rr(ctx, -15, -13, 34, 26, 6); ctx.fill();
        ctx.strokeStyle = "#2a2a28"; ctx.stroke(); ctx.strokeStyle = line; ctx.lineWidth = 1.5;
      }
      // top strap
      ctx.fillStyle = steel; rr(ctx, -22, -17, 62, 5, 2); ctx.fill(); ctx.stroke();
      // hammer
      ctx.save(); ctx.translate(38, -12); ctx.rotate(-hamm * 0.75);
      ctx.fillStyle = steel; rr(ctx, -2, -13, 7, 16, 2); ctx.fill(); ctx.stroke();
      rr(ctx, 1, -16, 7, 5, 2); ctx.fill(); ctx.stroke();
      ctx.restore();
      // trigger guard + trigger
      ctx.beginPath(); ctx.arc(10, 18, 10, 0.25, Math.PI - 0.25); ctx.strokeStyle = line; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.strokeStyle = steel2; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(10, 12); ctx.lineTo(8, 20); ctx.stroke();
      // wooden grip
      ctx.save(); ctx.translate(32, 8); ctx.rotate(0.48);
      ctx.fillStyle = "#4A1B0C"; ctx.strokeStyle = "#712B13"; ctx.lineWidth = 1.5;
      rr(ctx, -9, -2, 21, 48, 8); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "#712B13"; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-4, 9); ctx.lineTo(8, 9); ctx.moveTo(-4, 18); ctx.lineTo(9, 18);
      ctx.moveTo(-3, 27); ctx.lineTo(10, 27); ctx.moveTo(-2, 36); ctx.lineTo(10, 36); ctx.stroke();
      ctx.restore();
      ctx.restore();
      // cylinder - SOLID (chambers hidden); swings down-left when open
      const cpx = GX + 2 - 8 * cylOff + recoil, cpy = GY + 26 * cylOff;
      ctx.save(); ctx.translate(cpx, cpy); ctx.rotate(cylOff * 0.18);
      ctx.fillStyle = "#4a4a47"; ctx.strokeStyle = line; ctx.lineWidth = 1.5;
      rr(ctx, -17, -13, 34, 26, 6); ctx.fill(); ctx.stroke();
      ctx.save(); rr(ctx, -17, -13, 34, 26, 6); ctx.clip();
      ctx.strokeStyle = "#2a2a28"; ctx.lineWidth = 1;
      const sp = 9, off = ((cylSpin * 6) % sp + sp) % sp;
      for (let i = -3; i <= 3; i++) { const lx = i * sp + off - 4; ctx.beginPath(); ctx.moveTo(lx, -11); ctx.lineTo(lx, 11); ctx.stroke(); }
      ctx.restore();
      if (whirlA > 0.02) { // motion arcs while the drum whirls
        ctx.strokeStyle = "#9a9a95"; ctx.lineWidth = 1.5; ctx.globalAlpha = whirlA;
        ctx.beginPath(); ctx.arc(0, 0, 20, -0.6, 0.5); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, 24, 2.4, 3.5); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    };

    const frame = () => {
      const c = Rf.current; const s = sim.current; const ms = nowMs(); const tk = performance.now() / 16.667;
      const scale = Math.min(W / DW, (H - 8) / DH);
      const ox = (W - DW * scale) / 2, oy = Math.max(52, (H - DH * scale) / 2 + 18);

      // ---- resolve phase + rotation from the schedule (pure fn of ms)
      let R = 0, item: Item | undefined, phase = "idle", sub = "";
      for (const it of sched.items) { if (ms < it.resultEnd) { item = it; break; } }
      const celeb = ms >= sched.celebAt;
      if (!item && sched.items.length) item = sched.items[sched.items.length - 1];
      if (item) {
        if (ms >= item.resultEnd) { R = item.Rto; phase = "result"; }
        else if (ms >= item.fireAt) { R = item.Rto; phase = "result"; }
        else if (ms >= item.spinEnd) { R = item.Rto; phase = "aim"; }
        else if (ms >= item.spinStart) {
          const p = (ms - item.spinStart) / (item.spinEnd - item.spinStart);
          R = item.Rfrom + (item.Rto - item.Rfrom) * (item.first ? ease(p) : smooth(p));
          phase = "spin";
        } else if (item.openAt >= 0 && ms >= item.openAt) {
          R = item.Rfrom; phase = "load";
          sub = ms < item.insAt ? "open" : ms < item.closeAt ? "ins" : ms < item.whirlAt ? "close" : "whirl";
        } else { R = item.Rfrom; phase = "wait"; }
      }
      const bullets = item?.sh.bullets ?? 0;

      const deadSlots = new Map<number, number>(); // slot -> deadAt
      sched.elimAt.forEach((t2, slot) => { if (t2 <= ms) deadSlots.set(slot, t2); });
      const aliveN = N - deadSlots.size;

      // winner (only meaningful during celebrate)
      let winSlot = -1;
      if (celeb) for (let i = 0; i < N; i++) if (!sched.elimAt.has(i) || sched.elimAt.get(i)! > ms) { winSlot = i; break; }
      const celebP = celeb ? Math.min(1, (ms - sched.celebAt) / 900) : 0;

      // ---- one-shot FX on crossings (cosmetic randomness is fine)
      if (s.lastMs >= 0 && ms > s.lastMs) {
        sched.elimAt.forEach((t2, slot) => {
          if (t2 > s.lastMs && t2 <= ms) {
            s.shake = Math.max(s.shake, 7);
            const id = c.slots[slot]; const a0 = 0; // aimed slot is at angle 0
            const bx = CXW + Math.cos(a0) * DRAD, by = CYW + Math.sin(a0) * DRAD;
            for (let i = 0; i < 18; i++) { const a = Math.random() * Math.PI * 2, spd = 2 + Math.random() * 4.5; s.parts.push({ x: bx, y: by, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd - 1, life: 1, r: 2 + Math.random() * 3, c: i % 2 ? ORG : c.color(id), glow: i % 2 === 0 }); }
          }
        });
      }
      s.lastMs = ms;
      // celebration confetti - spawned over a window so late seekers see it too
      if (celeb && ms - sched.celebAt < 2600 && s.confetti.length < 150) {
        for (let i = 0; i < 6; i++) s.confetti.push({ x: Math.random() * DW, y: -10 - Math.random() * 40, vx: (Math.random() - 0.5) * 2.5, vy: 1 + Math.random() * 2.5, rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3, life: 1, c: PAL[Math.floor(Math.random() * PAL.length)], w: 5 + Math.random() * 4 });
      }
      for (const p of s.parts) { p.x += p.vx; p.y += p.vy; p.vy += 0.07; p.life -= 0.028; }
      s.parts = s.parts.filter((p: any) => p.life > 0);
      for (const cf of s.confetti) { cf.x += cf.vx; cf.y += cf.vy; cf.vy += 0.05; cf.rot += cf.vr; cf.life -= 0.005; }
      s.confetti = s.confetti.filter((cf: any) => cf.life > 0 && cf.y < DH + 30);
      s.shake *= 0.88;

      // ---- per-frame derived FX values
      const sinceFire = item && ms >= item.fireAt ? ms - item.fireAt : -1;
      const flash = sinceFire >= 0 && sinceFire < 150 ? 1 - sinceFire / 150 : 0;
      const recoil = sinceFire >= 0 ? 8 * Math.pow(0.85, sinceFire / 16.667) : 0;
      const hamm = phase === "aim" && item ? Math.min(1, (ms - item.spinEnd) / (AIM * 0.6)) : 0;
      let cylOff = 0, cylSpin = 0, whirlA = 0;
      if (item && phase === "load") {
        if (sub === "open") cylOff = smooth(Math.min(1, (ms - item.openAt) / OPEN));
        else if (sub === "ins") cylOff = 1;
        else if (sub === "close") cylOff = 1 - smooth(Math.min(1, (ms - item.closeAt) / CLOSE));
        else { // whirl: spin decays
          const wp = Math.min(1, (ms - item.whirlAt) / WHIRL);
          cylSpin = 40 * (1 - Math.pow(1 - wp, 3)); whirlA = Math.min(0.8, (1 - wp) * 1.1);
        }
      }
      const fearing = phase === "aim" && item ? item.sh.aimedSlot : -1;

      // =========================== draw ===========================
      const shX = Math.sin(tk * 3.1) * s.shake, shY = Math.cos(tk * 2.7) * s.shake;
      drawArenaBg(ctx, W, H, ACCENT, tk);
      ctx.save(); ctx.translate(ox + shX * scale, oy + shY * scale); ctx.scale(scale, scale);

      // floor shadow under the drum
      ctx.save(); ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.ellipse(CXW, CYW + DRAD + 42, DRAD * 0.95, 11, 0, 0, Math.PI * 2); ctx.fillStyle = "#050508"; ctx.fill(); ctx.restore();

      // ---- drum: dark ring track + colored arc segments + guide rings
      ctx.strokeStyle = "#26262e"; ctx.lineWidth = 30; ctx.beginPath(); ctx.arc(CXW, CYW, DRAD, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.14)"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(CXW, CYW, DRAD - 16, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(CXW, CYW, DRAD + 16, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < N; i++) {
        const a = R + i * STEP; const dead = deadSlots.has(i);
        ctx.beginPath(); ctx.arc(CXW, CYW, DRAD, a - STEP * 0.36, a + STEP * 0.36);
        ctx.strokeStyle = dead ? "#1c1c22" : c.color(c.slots[i]);
        ctx.globalAlpha = dead ? 0.55 : 0.3; ctx.lineWidth = 25; ctx.stroke(); ctx.globalAlpha = 1;
        const ba = R + (i + 0.5) * STEP;
        ctx.beginPath(); ctx.arc(CXW + Math.cos(ba) * DRAD, CYW + Math.sin(ba) * DRAD, 2, 0, Math.PI * 2);
        ctx.fillStyle = "#5a5a64"; ctx.fill();
      }

      // ---- center dial
      ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(CXW, CYW, 47, 0, Math.PI * 2); ctx.fillStyle = "#15121a"; ctx.fill(); ctx.restore();
      ctx.strokeStyle = "rgba(255,255,255,0.16)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(CXW, CYW, 47, 0, Math.PI * 2); ctx.stroke();
      if (celeb && winSlot >= 0) {
        label(ctx, "GANADOR", CXW, CYW - 12, { size: 11, color: GOLD, align: "center", weight: 800, spacing: 2, upper: true });
        label(ctx, "#" + (c.participants[c.slots[winSlot]]?.number ?? ""), CXW, CYW + 11, { size: 20, color: TXT, align: "center", weight: 800 });
      } else {
        label(ctx, "VIVOS", CXW, CYW - 13, { size: 10, color: MUT, align: "center", weight: 700, spacing: 2, upper: true });
        label(ctx, String(aliveN), CXW, CYW + 11, { size: 26, color: TXT, align: "center", weight: 800 });
      }

      // fixed chamber marker: red arrow pointing at the muzzle line
      ctx.beginPath(); ctx.moveTo(CXW + DRAD + 36, CYW - 7); ctx.lineTo(CXW + DRAD + 24, CYW); ctx.lineTo(CXW + DRAD + 36, CYW + 7); ctx.closePath();
      ctx.fillStyle = ACCENT; ctx.fill();

      // ---- laser + lock ring while aiming / firing
      if (item && (phase === "aim" || (phase === "result" && sinceFire < 260)) && !celeb) {
        const tx = CXW + DRAD, ty = CYW;
        ctx.save(); ctx.setLineDash([5, 5]); ctx.strokeStyle = hexA(RED, 0.7); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(MZ + recoil, GY); ctx.lineTo(tx, ty); ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(MZ + recoil, GY, 3, 0, Math.PI * 2); ctx.fillStyle = RED; ctx.fill();
        if (phase === "aim") {
          ctx.shadowColor = RED; ctx.shadowBlur = 12;
          ctx.beginPath(); ctx.arc(tx, ty, BALLR + 6 + Math.sin(tk * 0.45) * 2, 0, Math.PI * 2);
          ctx.strokeStyle = RED; ctx.lineWidth = 3; ctx.stroke();
        }
        ctx.restore();
      }

      // ---- finalists riding the drum
      const winId = winSlot >= 0 ? c.slots[winSlot] : -1;
      for (let slot = 0; slot < N; slot++) {
        const id = c.slots[slot]; const pt = c.participants[id];
        const a = R + slot * STEP;
        let x = CXW + Math.cos(a) * DRAD, y = CYW + Math.sin(a) * DRAD;
        const deadAt = deadSlots.get(slot);
        if (deadAt != null) {
          const sk = Math.min(1, (ms - deadAt) / 420);
          ctx.beginPath(); ctx.arc(x, y, BALLR, 0, Math.PI * 2); ctx.fillStyle = "#26262b"; ctx.fill();
          ctx.strokeStyle = "#4c4c52"; ctx.lineWidth = 1.5; ctx.stroke();
          drawSkull(x, y - 1, sk * 1.25, sk);
          label(ctx, "#" + (pt?.number ?? id + 1), x, y + BALLR + 9, { size: 10, color: "#71717a", align: "center", weight: 600 });
          continue;
        }
        if (slot === fearing) { x += Math.sin(tk * 1.4) * 2.5; y += Math.cos(tk * 1.6) * 1.5; }
        let r2 = BALLR;
        if (celeb && slot === winSlot) { // winner flies to the right-side stage (where the gun was)
          const p = smooth(celebP);
          x = x + (GX - 22 - x) * p; y = y + (GY - 26 - y) * p; r2 = BALLR + 18 * p;
          if (p > 0.2) { ctx.save(); ctx.shadowColor = GOLD; ctx.shadowBlur = 24; ctx.beginPath(); ctx.arc(x, y, r2 + 6 + Math.sin(tk * 0.1) * 2.5, 0, Math.PI * 2); ctx.strokeStyle = GOLD; ctx.lineWidth = 3; ctx.stroke(); ctx.restore(); }
        }
        drawTicket(ctx, { x, y, r: r2, color: c.color(id), number: pt?.number ?? id + 1, nickname: pt?.nickname, avatarUrl: pt?.avatarUrl, mine: c.myIndices.has(id), winner: celeb && slot === winSlot, showName: celeb && slot === winSlot && celebP > 0.6 });
      }

      // bang particles
      for (const p of s.parts) { ctx.save(); ctx.globalAlpha = p.life; if (p.glow) { ctx.shadowColor = p.c; ctx.shadowBlur = 8; } ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fillStyle = p.c; ctx.fill(); ctx.restore(); }
      ctx.globalAlpha = 1;

      // ---- revolver + status (hidden during celebrate)
      if (!celeb) {
        drawGun(recoil, hamm, cylOff, cylSpin, whirlA);

        // muzzle flash - straight, at the muzzle
        if (flash > 0) {
          ctx.save(); ctx.translate(MZ + recoil, GY);
          ctx.shadowColor = GOLD; ctx.shadowBlur = 20; ctx.fillStyle = "#FAC775";
          const fr = 12 + flash * 18;
          for (let i = 0; i < 8; i++) { ctx.rotate(Math.PI / 4); const len = i % 2 ? fr : fr * 0.6; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 2.5); ctx.lineTo(len + 7, 0); ctx.lineTo(len, -2.5); ctx.closePath(); ctx.fill(); }
          ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill();
          ctx.restore();
        }

        if (phase === "load" && item) {
          // a bullet arcs in from the top-right and vanishes into the cylinder
          if (sub === "ins") {
            const k = Math.floor((ms - item.insAt) / INS_EACH);
            const p = Math.min(1, ((ms - item.insAt) % INS_EACH) / (INS_EACH * 0.94));
            if (k < bullets) {
              const cpx = GX - 6, cpy = GY + 26 - 14;
              const bx = 645 + (cpx - 645) * p, by = 40 + (cpy - 40) * p - Math.sin(p * Math.PI) * 18;
              const sc = p > 0.85 ? Math.max(0, (1 - p) / 0.15) : 1;
              ctx.save(); ctx.translate(bx, by); ctx.rotate(0.9 + p * 0.6); ctx.scale(sc, sc);
              ctx.fillStyle = GOLD; rr(ctx, -3, -8, 6, 16, 3); ctx.fill();
              ctx.fillStyle = "#854F0B"; rr(ctx, -3, -8, 6, 5, 3); ctx.fill();
              ctx.restore();
            }
          }
          const msg = sub === "open" ? "Abriendo el tambor" :
            sub === "ins" ? `Cargando ${Math.min(Math.floor((ms - item.insAt) / INS_EACH) + 1, bullets)} de ${bullets} balas` :
            sub === "close" ? "Cerrando el tambor" : "Girando el tambor…";
          label(ctx, msg, GX - 14, GY + 74, { size: 13, color: MUT, align: "center", weight: 600 });
        } else if (item && (phase === "spin" || phase === "aim" || phase === "result" || phase === "wait")) {
          // shot pips: 6 chambers, red = bang, grey = click, outline = pending
          const px0 = GX - 59, py = GY + 74;
          label(ctx, `Disparo ${Math.min(item.sh.shot + 1, 6)} de 6`, GX - 14, py - 19, { size: 12, color: MUT, align: "center", weight: 600 });
          for (let i = 0; i < 6; i++) {
            const px = px0 + i * 18;
            // result of chamber i in the CURRENT cycle, if already fired
            let st = 0;
            for (const it of sched.items) if (it.sh.cycle === item.sh.cycle && it.sh.shot === i && ms >= it.fireAt) st = it.sh.hit ? 2 : 1;
            ctx.beginPath(); ctx.arc(px, py, 5.5, 0, Math.PI * 2);
            if (st === 2) { ctx.fillStyle = ACCENT; ctx.fill(); }
            else if (st === 1) { ctx.fillStyle = "#8a8a94"; ctx.fill(); }
            else { ctx.strokeStyle = "#4c4c55"; ctx.lineWidth = 1.5; ctx.stroke(); }
            if (i === item.sh.shot && st === 0) { ctx.beginPath(); ctx.arc(px, py, 8.5, 0, Math.PI * 2); ctx.strokeStyle = ORG; ctx.lineWidth = 1.5; ctx.stroke(); }
          }
          label(ctx, `${bullets} ${bullets === 1 ? "bala cargada" : "balas cargadas"} · tambor oculto`, GX - 14, py + 19, { size: 11, color: "#6b6b76", align: "center", weight: 500 });
        }

        // CLICK / ¡BANG! above the muzzle
        if (sinceFire >= 0 && item) {
          if (item.sh.hit && sinceFire < 640) {
            const rise = sinceFire * 0.03;
            ctx.save(); ctx.globalAlpha = Math.min(1, (640 - sinceFire) / 220); ctx.shadowColor = RED; ctx.shadowBlur = 14;
            label(ctx, "¡BANG!", MZ, GY - 46 - rise, { size: 26, color: RED, align: "center", weight: 800, spacing: 1 });
            ctx.restore();
          } else if (!item.sh.hit && sinceFire < 540) {
            const rise = sinceFire * 0.026;
            ctx.save(); ctx.globalAlpha = Math.min(1, (540 - sinceFire) / 200);
            label(ctx, "CLICK", MZ, GY - 42 - rise, { size: 20, color: "#c9c9d2", align: "center", weight: 800, spacing: 2 });
            ctx.restore();
          }
        }
      } else if (winSlot >= 0 && celebP > 0.75) {
        const a = Math.min(1, (celebP - 0.75) / 0.25);
        ctx.save(); ctx.globalAlpha = a;
        ctx.shadowColor = GOLD; ctx.shadowBlur = 12;
        label(ctx, "GRAN GANADOR", GX - 22, GY - 106, { size: 16, color: GOLD, align: "center", weight: 800, spacing: 3, upper: true });
        ctx.restore();
      }

      // confetti
      for (const cf of s.confetti) { ctx.save(); ctx.translate(cf.x, cf.y); ctx.rotate(cf.rot); ctx.globalAlpha = Math.min(1, cf.life * 1.5); ctx.fillStyle = cf.c; ctx.fillRect(-cf.w / 2, -cf.w / 4, cf.w, cf.w / 2); ctx.restore(); }
      ctx.globalAlpha = 1;
      ctx.restore();

      const cyc = item?.sh.cycle ?? 1;
      hudBar(ctx, W, { title: "Ruleta rusa · la final", alive: aliveN, goal: c.winnerSet.size || 1, pct: sched.totalMs ? Math.min(1, ms / sched.totalMs) : 1, accent: ACCENT, phase: celeb ? "Completado" : `Ciclo ${cyc}` });
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
