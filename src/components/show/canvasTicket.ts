// Rich ticket rendering for the canvas games — cinematic dark theme. A ticket is
// a glowing disc showing the owner's PHOTO (clipped) or a gradient with their
// initial, plus optional name + number chips. Images are cached and drawn once
// loaded (never read back, so no CORS taint issues); until then we fall back to
// the initial.

const imgCache = new Map<string, HTMLImageElement | null>();

export function getTicketImg(url: string | null | undefined): HTMLImageElement | null {
  if (!url) return null;
  if (imgCache.has(url)) return imgCache.get(url);
  imgCache.set(url, null);
  try {
    const img = new Image();
    img.onload = () => imgCache.set(url, img);
    img.onerror = () => imgCache.set(url, null);
    img.src = url;
  } catch { imgCache.set(url, null); }
  return null;
}

const GOLD = "#F5B301";
const CYAN = "#38E1FF";

export interface TicketDraw {
  x: number; y: number; r: number;
  number: number;
  nickname?: string | null;
  avatarUrl?: string | null;
  color: string;
  mine?: boolean;
  winner?: boolean;
  alpha?: number;
  showLabel?: boolean; // "#NN" chip under the disc
  showName?: boolean;  // nickname chip under the disc
  dim?: boolean;       // greyed / eliminated look
}

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y); ctx.arcTo(x + w, y, x + w, y + h, rad); ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad); ctx.arcTo(x, y, x + w, y, rad); ctx.closePath();
}

function shade(hex: string, amt: number) {
  const h = hex.replace("#", ""); const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  const r = clamp(parseInt(n.slice(0, 2), 16) + amt), g = clamp(parseInt(n.slice(2, 4), 16) + amt), b = clamp(parseInt(n.slice(4, 6), 16) + amt);
  return `rgb(${r},${g},${b})`;
}

export function drawTicket(ctx: CanvasRenderingContext2D, t: TicketDraw) {
  const { x, y, r } = t;
  ctx.save();
  ctx.globalAlpha = t.alpha ?? 1;

  // soft drop shadow for depth
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)"; ctx.shadowBlur = Math.max(4, r * 0.4); ctx.shadowOffsetY = Math.max(2, r * 0.12);
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = "#000"; ctx.fill();
  ctx.restore();

  // highlight ring for mine / winner (glowing)
  if (t.winner || t.mine) {
    ctx.save();
    ctx.shadowColor = t.winner ? GOLD : CYAN; ctx.shadowBlur = r * 0.9;
    ctx.beginPath(); ctx.arc(x, y, r + Math.max(2.5, r * 0.14), 0, Math.PI * 2);
    ctx.strokeStyle = t.winner ? GOLD : CYAN; ctx.lineWidth = Math.max(2, r * 0.14); ctx.stroke();
    ctx.restore();
  }

  const img = r >= 9 ? getTicketImg(t.avatarUrl) : null;
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
  if (img) {
    ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
    if (t.dim) { ctx.fillStyle = "rgba(10,10,14,0.62)"; ctx.fillRect(x - r, y - r, r * 2, r * 2); }
  } else {
    const base = t.dim ? "#2b2b33" : t.color;
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.05);
    g.addColorStop(0, shade(base, 45)); g.addColorStop(0.55, base); g.addColorStop(1, shade(base, -40));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    if (r >= 9) {
      const letter = (t.nickname?.trim()?.[0] ?? String(t.number)).toUpperCase();
      ctx.fillStyle = t.dim ? "#6b6b76" : "rgba(255,255,255,0.95)";
      ctx.font = `700 ${Math.round(r * 1.0)}px Inter, system-ui, sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(letter, x, y);
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.92)"; ctx.font = `700 ${Math.max(8, Math.round(r * 0.95))}px Inter, system-ui, sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(t.number), x, y);
    }
  }
  // glossy top highlight
  ctx.globalAlpha = (t.alpha ?? 1) * (t.dim ? 0.06 : 0.18);
  const gl = ctx.createLinearGradient(x, y - r, x, y);
  gl.addColorStop(0, "rgba(255,255,255,1)"); gl.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gl; ctx.fillRect(x - r, y - r, r * 2, r);
  ctx.restore();

  // rim
  ctx.globalAlpha = t.alpha ?? 1;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = t.dim ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.28)"; ctx.lineWidth = 1.5; ctx.stroke();

  // name + number chips under the disc
  let below = y + r + 4;
  if (t.showName && r >= 13 && t.nickname) {
    const name = t.nickname.length > 12 ? t.nickname.slice(0, 11) + "…" : t.nickname;
    ctx.font = `600 ${Math.max(9, Math.round(r * 0.42))}px Inter, system-ui, sans-serif`;
    const w = ctx.measureText(name).width + 10; const h = Math.round(r * 0.62);
    ctx.fillStyle = "rgba(8,8,12,0.72)"; rrect(ctx, x - w / 2, below, w, h, h / 2); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.92)"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(name, x, below + h / 2 + 0.5);
    below += h + 3;
  }
  if (t.showLabel && r >= 9) {
    const lbl = "#" + t.number;
    ctx.font = `700 ${Math.max(9, Math.round(r * 0.5))}px Inter, system-ui, sans-serif`;
    const w = ctx.measureText(lbl).width + 8; const h = Math.round(r * 0.6);
    ctx.fillStyle = t.mine ? "rgba(56,225,255,0.9)" : t.winner ? "rgba(245,179,1,0.92)" : "rgba(8,8,12,0.7)";
    rrect(ctx, x - w / 2, below, w, h, h / 2); ctx.fill();
    ctx.fillStyle = t.mine || t.winner ? "#0b0b12" : "rgba(255,255,255,0.9)"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(lbl, x, below + h / 2 + 0.5);
  }
  ctx.restore();
}
