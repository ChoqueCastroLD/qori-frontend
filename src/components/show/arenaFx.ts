// Shared "cinematic dark premium" chrome for the canvas games. One visual
// language: deep lit background with depth, translucent glass HUD, glowing
// progress + phase banners, and rich tickets (photo/initial with soft glow).
// Every game composes these so the show feels like one polished product.

import { getTicketImg } from "./canvasTicket";

export const INK = "#0b0b12";
export const GLASS = "rgba(18,18,28,0.62)";
export const GLASS_BORDER = "rgba(255,255,255,0.10)";
export const TXT = "#F5F6FA";
export const MUT = "#9aa0b0";
export const GOLD = "#F5B301";
export const CYAN = "#38E1FF";

export function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

// A deterministic bokeh field so the backdrop has depth without wall-clock RNG.
function bokeh(i: number) {
  const a = Math.sin(i * 127.1) * 43758.5453; const b = Math.sin(i * 311.7) * 24634.63;
  return { x: (a - Math.floor(a)), y: (b - Math.floor(b)), s: ((Math.sin(i * 74.7) + 1) / 2) };
}

export function drawArenaBg(ctx: CanvasRenderingContext2D, W: number, H: number, accent: string, t: number) {
  // base vertical gradient
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#141420"); g.addColorStop(0.55, "#0d0d15"); g.addColorStop(1, "#08080d");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // top accent glow
  const rg = ctx.createRadialGradient(W / 2, -40, 20, W / 2, -40, Math.max(W, H) * 0.9);
  rg.addColorStop(0, hexA(accent, 0.22)); rg.addColorStop(0.4, hexA(accent, 0.06)); rg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
  // drifting bokeh dots
  for (let i = 1; i <= 26; i++) {
    const b = bokeh(i);
    const x = (b.x * W + t * (0.2 + b.s * 0.3)) % W;
    const y = (b.y * (H - 40) + 20 + Math.sin(t * 0.01 + i) * 6);
    ctx.globalAlpha = 0.05 + b.s * 0.06;
    ctx.beginPath(); ctx.arc(x, y, 1 + b.s * 2.5, 0, Math.PI * 2); ctx.fillStyle = accent; ctx.fill();
  }
  ctx.globalAlpha = 1;
  // vignette
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
}

export function glassPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 12) {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
  ctx.fillStyle = GLASS; rr(ctx, x, y, w, h, r); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = GLASS_BORDER; ctx.lineWidth = 1; rr(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r); ctx.stroke();
  // top sheen
  ctx.strokeStyle = "rgba(255,255,255,0.06)"; ctx.beginPath(); ctx.moveTo(x + r, y + 1.5); ctx.lineTo(x + w - r, y + 1.5); ctx.stroke();
}

export function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, opts: { size?: number; color?: string; weight?: number; align?: CanvasTextAlign; spacing?: number; upper?: boolean } = {}) {
  ctx.save();
  ctx.font = `${opts.weight ?? 600} ${opts.size ?? 13}px Inter, system-ui, sans-serif`;
  ctx.fillStyle = opts.color ?? TXT; ctx.textAlign = opts.align ?? "left"; ctx.textBaseline = "middle";
  try { (ctx as any).letterSpacing = (opts.spacing ?? 0) + "px"; } catch {}
  ctx.fillText(opts.upper ? text.toUpperCase() : text, x, y);
  try { (ctx as any).letterSpacing = "0px"; } catch {}
  ctx.restore();
}

// Live counter + goal + progress bar in a glass strip at the top.
export function hudBar(ctx: CanvasRenderingContext2D, W: number, opts: { title: string; icon?: (x: number, y: number) => void; alive: number; goal: number; pct: number; accent: string; phase?: string }) {
  const x = 12, y = 10, w = W - 24, h = 44;
  glassPanel(ctx, x, y, w, h, 12);
  const cy = y + 16;
  label(ctx, opts.title, x + 16, cy, { size: 13, weight: 700, color: TXT, spacing: 0.5 });
  if (opts.phase) {
    ctx.font = "700 13px Inter, system-ui, sans-serif";
    const titleW = ctx.measureText(opts.title).width + opts.title.length * 0.5;
    ctx.font = "700 11px Inter, system-ui, sans-serif"; const pw = ctx.measureText(opts.phase.toUpperCase()).width + 20;
    const px = x + 16 + titleW + 14;
    ctx.fillStyle = hexA(opts.accent, 0.2); rr(ctx, px, cy - 9, pw, 18, 9); ctx.fill();
    ctx.strokeStyle = hexA(opts.accent, 0.55); ctx.lineWidth = 1; rr(ctx, px + 0.5, cy - 8.5, pw - 1, 17, 9); ctx.stroke();
    label(ctx, opts.phase, px + pw / 2, cy, { size: 11, weight: 700, color: lighten(opts.accent), align: "center", upper: true, spacing: 0.6 });
  }
  // right: alive / goal
  label(ctx, `Quedan ${opts.alive}`, x + w - 16, cy, { size: 13, weight: 700, color: TXT, align: "right" });
  label(ctx, `avanzan ${opts.goal}`, x + w - 16, y + 33, { size: 10, weight: 600, color: MUT, align: "right", upper: true, spacing: 1 });
  // progress bar
  const bx = x + 16, by = y + 31, bw = w - 32 - 120, bh = 5;
  ctx.fillStyle = "rgba(255,255,255,0.10)"; rr(ctx, bx, by, bw, bh, 3); ctx.fill();
  ctx.save(); ctx.shadowColor = opts.accent; ctx.shadowBlur = 10;
  ctx.fillStyle = opts.accent; rr(ctx, bx, by, Math.max(3, bw * Math.max(0, Math.min(1, opts.pct))), bh, 3); ctx.fill();
  ctx.restore();
}

// Big centered phase announcement (fades in/out via alpha 0..1).
export function phaseBanner(ctx: CanvasRenderingContext2D, W: number, H: number, title: string, sub: string, alpha: number, accent: string) {
  if (alpha <= 0.01) return;
  ctx.save(); ctx.globalAlpha = Math.min(1, alpha);
  const w = Math.min(W - 60, 420), h = 92, x = (W - w) / 2, y = H / 2 - h / 2 - 10;
  ctx.shadowColor = hexA(accent, 0.5); ctx.shadowBlur = 30;
  glassPanel(ctx, x, y, w, h, 16);
  ctx.shadowBlur = 0;
  // accent bar
  ctx.fillStyle = accent; rr(ctx, x, y + 14, 4, h - 28, 2); ctx.fill();
  label(ctx, title, W / 2, y + 36, { size: 24, weight: 800, color: TXT, align: "center", upper: true, spacing: 1.5 });
  label(ctx, sub, W / 2, y + 64, { size: 12.5, weight: 500, color: MUT, align: "center" });
  ctx.restore();
}

// utils
export function hexA(hex: string, a: number) {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
export function lighten(hex: string) {
  const h = hex.replace("#", ""); const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = Math.min(255, parseInt(n.slice(0, 2), 16) + 70), g = Math.min(255, parseInt(n.slice(2, 4), 16) + 70), b = Math.min(255, parseInt(n.slice(4, 6), 16) + 70);
  return `rgb(${r},${g},${b})`;
}

export { getTicketImg };
