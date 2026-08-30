import { useEffect, useMemo, useRef } from "react";
import { arenaMaxH, useViewportH, useWidth, type GameProps } from "./shared";
import { drawTicket } from "./canvasTicket";
import { drawArenaBg, glassPanel, hudBar, label, rr, hexA, TXT, MUT } from "./arenaFx";

// RULETA RUSA (final) — cinematic. Server sim (show.ts rouletteSim) fixed the
// loaded chambers and which slot each shot aims; this canvas plays the script:
// spin, aim, CLICK (spared) or BANG (out). Kills gated by `step` so every viewer
// sees the same shot resolve at once.

const ACCENT = "#E4534E";
const PAL = ["#8B7BF0", "#3FBF8F", "#F08A5D", "#EA6A9A", "#5AA0F0", "#F0B24A"];
const GOLD = "#F5B301", BONE = "#E7E5Dc", RED = "#ff5555";
const CLICK_MS = 820;

interface Shot { cycle: number; bullets: number; shot: number; aimedSlot: number; aimed: number; hit: boolean }
interface Part { x: number; y: number; vx: number; vy: number; life: number; r: number; c: string; glow?: boolean }

export default function RouletteGame({ participants, stage, stageIdx, step, elimSeq, myIndices, winnerSet, isFinaleDone }: GameProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const vh = useViewportH();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const aliveBefore: number[] = stage.aliveBefore ?? [];
  const slots: number[] = stage.data?.slots ?? aliveBefore;
  const shots: Shot[] = stage.data?.shots ?? [];
  const N = slots.length;
  const hitIdxs = useMemo(() => shots.map((s, i) => (s.hit ? i : -1)).filter((i) => i >= 0), [shots]);
  const color = (i: number) => PAL[(participants[i]?.number ?? i) % PAL.length];

  const H = Math.min(arenaMaxH(vh), 520);
  const W = Math.max(280, Math.min(width || 0, 760));

  const sim = useRef({ parts: [] as Part[], shake: 0, flash: 0, click: 0, bang: 0, hammer: 0, R: 0, drum: 0, localStart: 0, prevResolved: -1, start: 0 });
  const Rf = useRef({ step, shots, hitIdxs, slots, participants, myIndices, winnerSet, isFinaleDone, N, W, H, color });
  Rf.current = { step, shots, hitIdxs, slots, participants, myIndices, winnerSet, isFinaleDone, N, W, H, color };
  const resolvedIdx = (done: number) => (done === 0 ? 0 : Rf.current.hitIdxs[done - 1] + 1);

  useEffect(() => {
    const cvs = canvasRef.current; if (!cvs || W < 280) return;
    const ctx = cvs.getContext("2d"); if (!ctx) return;
    const dpr = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
    cvs.width = W * dpr; cvs.height = H * dpr; cvs.style.width = W + "px"; cvs.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sim.current.start = performance.now(); sim.current.localStart = performance.now();
    let raf = 0;

    const drawSkull = (x: number, y: number, s: number) => {
      ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
      ctx.beginPath(); ctx.arc(0, -1.5, 7, 0, Math.PI * 2); ctx.fillStyle = BONE; ctx.fill();
      rr(ctx, -4.5, 3, 9, 5, 1.5); ctx.fillStyle = BONE; ctx.fill();
      ctx.fillStyle = "#15130f"; ctx.beginPath(); ctx.arc(-2.8, -2, 2, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(2.8, -2, 2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    };
    const drawGun = (gx: number, gy: number, recoil: number, hammer: number, drum: number, flash: number) => {
      ctx.save(); ctx.translate(gx - recoil, gy);
      ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 10;
      const steel = "#3c3c42", line = "#71717a";
      ctx.strokeStyle = line; ctx.lineWidth = 1.5;
      ctx.fillStyle = steel; rr(ctx, -56, -6, 50, 12, 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#4a4a52"; rr(ctx, -10, -16, 36, 32, 7); ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.save(); ctx.translate(10, 1); ctx.rotate(drum);
      ctx.fillStyle = "#4a4a52"; ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = line; ctx.stroke();
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; ctx.beginPath(); ctx.arc(Math.cos(a) * 9, Math.sin(a) * 9, 2.6, 0, Math.PI * 2); ctx.fillStyle = "#17161b"; ctx.fill(); }
      ctx.restore();
      ctx.save(); ctx.translate(26, -14); ctx.rotate(-hammer * 0.7); ctx.fillStyle = steel; rr(ctx, -2, -12, 6, 15, 2); ctx.fill(); ctx.stroke(); ctx.restore();
      ctx.save(); ctx.translate(22, 12); ctx.rotate(0.5); ctx.fillStyle = "#4A1B0C"; ctx.strokeStyle = "#7a2f16"; rr(ctx, -8, -2, 18, 42, 7); ctx.fill(); ctx.stroke(); ctx.restore();
      if (flash > 0) { const fr = 12 + flash * 2; ctx.save(); ctx.translate(-58, 0); ctx.shadowColor = GOLD; ctx.shadowBlur = 20; ctx.fillStyle = "#FFE08A"; for (let i = 0; i < 8; i++) { ctx.rotate(Math.PI / 4); const len = i % 2 ? fr : fr * 0.55; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 3); ctx.lineTo(len + 7, 0); ctx.lineTo(len, -3); ctx.closePath(); ctx.fill(); } ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill(); ctx.restore(); }
      ctx.restore();
    };

    const frame = () => {
      const now = performance.now(); const tk = (now - sim.current.start) / 16.667;
      const c = Rf.current; const s = sim.current;
      const totalBangs = c.hitIdxs.length; const doneBangs = Math.min(c.step, totalBangs); const rIdx = resolvedIdx(doneBangs);

      const ringCX = W * 0.36, ringCY = 66 + (H - 66) / 2, RAD = Math.min(W * 0.28, (H - 90) * 0.42);
      const gunX = W * 0.84, gunY = ringCY, muzzleX = gunX - 58;
      const slotPos = (slot: number, baseR: number) => { const a = baseR + slot * (Math.PI * 2 / c.N) - Math.PI / 2; return { x: ringCX + Math.cos(a) * RAD, y: ringCY + Math.sin(a) * RAD }; };

      if (rIdx !== s.prevResolved) {
        if (s.prevResolved !== -1 && doneBangs > 0) {
          const shot = c.shots[c.hitIdxs[doneBangs - 1]]; const p = slotPos(shot.aimedSlot, s.R);
          s.flash = 9; s.bang = 42; s.shake = Math.max(s.shake, 8);
          for (let i = 0; i < 20; i++) { const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 5; s.parts.push({ x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, life: 1, r: 2 + Math.random() * 3, c: i % 2 ? ACCENT : c.color(shot.aimed), glow: i % 2 === 0 }); }
        }
        s.localStart = now; s.prevResolved = rIdx;
      }

      const pending = c.shots.slice(rIdx); const localEl = now - s.localStart;
      const deadSlots = new Set(c.hitIdxs.slice(0, doneBangs).map((i) => c.shots[i].aimedSlot));
      let curShot: Shot | null = null; let holding = false;
      if (pending.length) { const j = Math.min(pending.length - 1, Math.floor(localEl / CLICK_MS)); curShot = pending[j]; if (j === pending.length - 1 && curShot.hit) holding = true; const inClick = localEl - j * CLICK_MS; if (!curShot.hit && inClick < 150 && j < pending.length - 1) s.click = 22; }

      for (const p of s.parts) { p.x += p.vx; p.y += p.vy; p.vy += 0.07; p.life -= 0.026; }
      s.parts = s.parts.filter((p) => p.life > 0);
      s.shake *= 0.86; if (s.flash > 0) s.flash--; if (s.click > 0) s.click--; if (s.bang > 0) s.bang--;
      s.R += 0.003; s.drum += holding ? 0.03 : 0.16; s.hammer = holding ? Math.min(1, s.hammer + 0.05) : Math.max(0, s.hammer - 0.1);

      const shX = Math.sin(tk * 3.1) * s.shake, shY = Math.cos(tk * 2.7) * s.shake;
      ctx.save(); ctx.translate(shX, shY);
      drawArenaBg(ctx, W, H, ACCENT, tk);

      const alive = c.N - doneBangs;
      // drum ring
      ctx.save(); ctx.strokeStyle = "rgba(255,255,255,0.07)"; ctx.lineWidth = RAD * 0.32; ctx.beginPath(); ctx.arc(ringCX, ringCY, RAD, 0, Math.PI * 2); ctx.stroke(); ctx.restore();

      // aim line + crosshair
      const aimSlot = curShot?.aimedSlot ?? -1;
      if (aimSlot >= 0 && !deadSlots.has(aimSlot)) {
        const tp = slotPos(aimSlot, s.R);
        ctx.save(); ctx.setLineDash([5, 5]); ctx.strokeStyle = hexA(RED, 0.7); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(muzzleX, gunY); ctx.lineTo(tp.x, tp.y); ctx.stroke(); ctx.setLineDash([]);
        if (holding) { ctx.shadowColor = RED; ctx.shadowBlur = 16; ctx.beginPath(); ctx.arc(tp.x, tp.y, (Math.max(12, RAD * 0.2)) + 6 + Math.sin(tk * 0.45) * 2, 0, Math.PI * 2); ctx.strokeStyle = RED; ctx.lineWidth = 3; ctx.stroke(); }
        ctx.restore();
      }

      // center dial
      const dialR = RAD * 0.36; glassPanel(ctx, ringCX - dialR, ringCY - dialR, dialR * 2, dialR * 2, dialR);
      label(ctx, "VIVOS", ringCX, ringCY - dialR * 0.42, { size: 10, color: MUT, align: "center", weight: 700, spacing: 1.5, upper: true });
      label(ctx, String(alive), ringCX, ringCY + dialR * 0.18, { size: dialR * 0.8, color: TXT, align: "center", weight: 800 });

      // finalists
      const ballR = Math.max(13, RAD * 0.2);
      for (let slot = 0; slot < c.N; slot++) {
        const id = c.slots[slot]; const p = slotPos(slot, s.R); const pt = c.participants[id]; const dead = deadSlots.has(slot);
        if (dead) { drawTicket(ctx, { x: p.x, y: p.y, r: ballR, color: "#2b2b33", number: pt?.number ?? id + 1, nickname: pt?.nickname, avatarUrl: pt?.avatarUrl, dim: true }); drawSkull(p.x, p.y - 1, ballR / 6.5); }
        else drawTicket(ctx, { x: p.x, y: p.y, r: ballR, color: c.color(id), number: pt?.number ?? id + 1, nickname: pt?.nickname, avatarUrl: pt?.avatarUrl, mine: c.myIndices.has(id), winner: c.isFinaleDone && c.winnerSet.has(id), showName: true, showLabel: true }); }

      drawGun(gunX, gunY, s.flash > 0 ? 6 : 0, s.hammer, s.drum, s.flash);
      for (const p of s.parts) { ctx.save(); ctx.globalAlpha = p.life; if (p.glow) { ctx.shadowColor = p.c; ctx.shadowBlur = 8; } ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fillStyle = p.c; ctx.fill(); ctx.restore(); }
      ctx.globalAlpha = 1;

      if (s.click > 0) { ctx.save(); ctx.globalAlpha = Math.min(1, s.click / 14); label(ctx, "CLICK", muzzleX, gunY - 46, { size: 20, color: "#c9c9d2", align: "center", weight: 800, spacing: 2 }); ctx.restore(); }
      if (s.bang > 0) { ctx.save(); ctx.globalAlpha = Math.min(1, s.bang / 16); ctx.shadowColor = RED; ctx.shadowBlur = 16; label(ctx, "¡BANG!", muzzleX, gunY - 50, { size: 28, color: RED, align: "center", weight: 800, spacing: 1 }); ctx.restore(); }

      ctx.restore(); // shake
      const cyc = c.shots[Math.min(c.shots.length - 1, rIdx)]?.cycle ?? 1;
      hudBar(ctx, W, { title: "Ruleta rusa · la final", alive, goal: c.winnerSet.size || 1, pct: totalBangs ? doneBangs / totalBangs : 1, accent: ACCENT, phase: `Ciclo ${cyc}` });

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [W, H, slots, shots]);

  return (
    <div ref={ref} className="overflow-hidden rounded-2xl bg-black" style={{ height: H }}>
      <canvas ref={canvasRef} className="mx-auto block" />
    </div>
  );
}
