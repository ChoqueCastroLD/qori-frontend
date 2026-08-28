import { useEffect, useRef } from "react";
import { mulberry32 } from "./shared";

// Canvas particle layer. Every burst's particle parameters (count, angle,
// speed, color, spin) come from a seeded PRNG -> deterministic across live
// play and replays. The clock only advances the playback of that fixed shape.

export type BurstKind = "spark" | "explosion" | "smoke" | "shatter" | "dust" | "puff" | "zap";
export interface Burst { key: string; x: number; y: number; kind: BurstKind; seed: number; }

interface P {
  x: number; y: number; vx: number; vy: number; g: number; drag: number;
  size: number; rot: number; vr: number; ttl: number; color: string;
  shape: "circle" | "rect" | "tri" | "line"; grow: number; fade: number;
}

const FIRE = ["#fbbf24", "#f97316", "#ef4444", "#fde68a", "#ffffff"];
const SMOKE = ["#64748b", "#94a3b8", "#475569"];
const SPARK = ["#fde047", "#fbbf24", "#ffffff", "#fb923c"];
const ZAP = ["#a5f3fc", "#38bdf8", "#ffffff", "#e0f2fe"];
const SHARD = ["#e2e8f0", "#cbd5e1", "#f8fafc", "#bae6fd"];
const DUST = ["#d6bfa3", "#c2a883", "#e7d8c0"];
const DEBRIS = ["#334155", "#1e293b", "#57534e"];

function spawn(b: Burst): P[] {
  const r = mulberry32(b.seed);
  const out: P[] = [];
  const add = (n: number, f: (r: () => number, i: number) => Partial<P>) => {
    for (let i = 0; i < n; i++) {
      out.push({
        x: b.x, y: b.y, vx: 0, vy: 0, g: 0, drag: 1, size: 3, rot: r() * Math.PI * 2,
        vr: 0, ttl: 600, color: "#fff", shape: "circle", grow: 0, fade: 1,
        ...f(r, i),
      });
    }
  };
  switch (b.kind) {
    case "spark":
      add(16, (r) => { const a = r() * Math.PI * 2, sp = 90 + r() * 240; return { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 260, size: 1.5 + r() * 2.5, ttl: 380 + r() * 260, color: SPARK[(r() * SPARK.length) | 0], shape: "line" }; });
      break;
    case "zap":
      add(14, (r) => { const a = r() * Math.PI * 2, sp = 120 + r() * 260; return { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 120, size: 1.5 + r() * 2, ttl: 320 + r() * 220, color: ZAP[(r() * ZAP.length) | 0], shape: "line" }; });
      break;
    case "explosion":
      add(20, (r) => { const a = r() * Math.PI * 2, sp = 60 + r() * 220; return { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, g: 120, drag: 0.985, size: 2.5 + r() * 4.5, ttl: 380 + r() * 300, color: FIRE[(r() * FIRE.length) | 0] }; });
      add(10, (r) => { const a = r() * Math.PI * 2, sp = 80 + r() * 260; return { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 90, g: 460, size: 2 + r() * 3.5, ttl: 600 + r() * 400, color: DEBRIS[(r() * DEBRIS.length) | 0], shape: "rect", vr: (r() - 0.5) * 14 }; });
      add(9, (r) => { const a = r() * Math.PI * 2, sp = 15 + r() * 55; return { vx: Math.cos(a) * sp, vy: -30 - r() * 55, size: 6 + r() * 8, ttl: 900 + r() * 500, color: SMOKE[(r() * SMOKE.length) | 0], grow: 14, fade: 0.4 }; });
      break;
    case "smoke":
      add(8, (r) => { const a = r() * Math.PI * 2, sp = 10 + r() * 40; return { vx: Math.cos(a) * sp, vy: -25 - r() * 45, size: 5 + r() * 7, ttl: 900 + r() * 500, color: SMOKE[(r() * SMOKE.length) | 0], grow: 12, fade: 0.35 }; });
      break;
    case "shatter":
      add(13, (r) => { const a = -Math.PI / 2 + (r() - 0.5) * 2.4, sp = 60 + r() * 180; return { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 420, size: 3 + r() * 4, ttl: 550 + r() * 350, color: SHARD[(r() * SHARD.length) | 0], shape: "tri", vr: (r() - 0.5) * 12 }; });
      break;
    case "dust":
      add(9, (r) => ({ vx: -30 - r() * 70, vy: -8 - r() * 26, size: 3 + r() * 4, ttl: 420 + r() * 320, color: DUST[(r() * DUST.length) | 0], grow: 8, fade: 0.5 }));
      break;
    case "puff":
      add(7, (r) => { const a = r() * Math.PI * 2, sp = 20 + r() * 50; return { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 15, size: 4 + r() * 5, ttl: 420 + r() * 260, color: SMOKE[(r() * SMOKE.length) | 0], grow: 9, fade: 0.45 }; });
      break;
  }
  return out;
}

export function ParticleCanvas({ bursts, className = "" }: { bursts: Burst[]; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const live = useRef<Map<string, { parts: P[]; born: number }>>(new Map());
  const raf = useRef(0);

  useEffect(() => {
    const now = performance.now();
    for (const b of bursts) if (!live.current.has(b.key)) live.current.set(b.key, { parts: spawn(b), born: now });
  }, [bursts]);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const fit = () => {
      const r = cv.parentElement?.getBoundingClientRect();
      if (!r) return;
      cv.width = Math.round(r.width * dpr);
      cv.height = Math.round(r.height * dpr);
      cv.style.width = `${r.width}px`;
      cv.style.height = `${r.height}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (cv.parentElement) ro.observe(cv.parentElement);
    let last = performance.now();
    const loop = (t: number) => {
      raf.current = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (const [k, g] of live.current) {
        const age = t - g.born;
        let alive = false;
        for (const p of g.parts) {
          if (age > p.ttl) continue;
          alive = true;
          p.vx *= p.drag; p.vy = p.vy * p.drag + p.g * dt;
          p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
          const lifeT = age / p.ttl;
          const alpha = Math.max(0, (1 - lifeT)) * p.fade;
          const size = p.size + p.grow * lifeT;
          ctx.globalAlpha = alpha;
          ctx.fillStyle = p.color;
          if (p.shape === "circle") { ctx.beginPath(); ctx.arc(p.x, p.y, size, 0, Math.PI * 2); ctx.fill(); }
          else if (p.shape === "rect") { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-size, -size / 2, size * 2, size); ctx.restore(); }
          else if (p.shape === "tri") { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.beginPath(); ctx.moveTo(0, -size); ctx.lineTo(size, size); ctx.lineTo(-size, size); ctx.closePath(); ctx.fill(); ctx.restore(); }
          else { ctx.strokeStyle = p.color; ctx.lineWidth = p.size; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035); ctx.stroke(); }
        }
        if (!alive && age > 300) live.current.delete(k);
      }
      ctx.globalAlpha = 1;
    };
    raf.current = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf.current); ro.disconnect(); };
  }, []);

  return <canvas ref={canvasRef} className={`pointer-events-none absolute inset-0 z-20 ${className}`} aria-hidden="true" />;
}

// Looping celebration rain. All per-piece params (x, speed, sway, color,
// size, phase) are seeded -> the same show renders the same confetti field.
export function ConfettiCanvas({ seed, className = "" }: { seed: number; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const fit = () => {
      const r = cv.parentElement?.getBoundingClientRect();
      if (!r) return;
      cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
      cv.style.width = `${r.width}px`; cv.style.height = `${r.height}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (cv.parentElement) ro.observe(cv.parentElement);
    const colors = ["#059669", "#34d399", "#fbbf24", "#38bdf8", "#f472b6", "#a78bfa"];
    const r = mulberry32(seed);
    const pieces = Array.from({ length: 130 }, () => ({
      x: r(), speed: 0.06 + r() * 0.1, phase: r() * Math.PI * 2, sway: 0.008 + r() * 0.02,
      w: 5 + r() * 6, h: 3 + r() * 4, color: colors[(r() * colors.length) | 0], spin: 1 + r() * 4, off: r() * 1.3,
    }));
    let raf = 0;
    const t0 = performance.now();
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      const el = (t - t0) / 1000;
      const W = cv.width / dpr, H = cv.height / dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      for (const p of pieces) {
        const y = (((el * p.speed + p.off) % 1.3) - 0.15) * H;
        const x = p.x * W + Math.sin(el * 2 + p.phase) * p.sway * W * 3;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(el * p.spin + p.phase);
        ctx.scale(1, Math.abs(Math.sin(el * p.spin * 1.7 + p.phase)));
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [seed]);
  return <canvas ref={canvasRef} className={`pointer-events-none absolute inset-0 z-30 ${className}`} aria-hidden="true" />;
}
