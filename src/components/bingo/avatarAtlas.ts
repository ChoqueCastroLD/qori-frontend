// Canvas texture atlas for the crowd billboards.
// One 2048px atlas holds up to 256 tiles (128px each). Every visible
// participant gets a tile: BINGO progress chips on top, avatar circle with
// rings (green = you, gold = suertudo), nickname below. Avatars with a real
// photo URL load lazily and repaint only their own tile.

import * as THREE from "three";
import { LETTERS, LETTER_COLORS, type Participant } from "./types";

export const ATLAS_SIZE = 2048;
export const TILE = 128;
export const TILES_PER_ROW = ATLAS_SIZE / TILE; // 16
export const MAX_TILES = TILES_PER_ROW * TILES_PER_ROW; // 256

// Pastel gradients (dark initials on top) so generated avatars sit inside
// the soft hall palette instead of fighting it.
const AVATAR_PALETTES: [string, string][] = [
  ["#bdeeda", "#8ad4b8"],
  ["#c3ddf5", "#93bce8"],
  ["#f6d3da", "#eba8b8"],
  ["#f7e3b8", "#ecc389"],
  ["#ddd6f5", "#b8abe8"],
  ["#cdeec0", "#a3d896"],
  ["#c6e8f0", "#8fcfe0"],
  ["#f6d8c8", "#eab396"],
];
const INITIALS_COLOR = "#2f4a42";

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export type TileInfo = { index: number; u: number; v: number };

export class AvatarAtlas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  private assigned = new Map<string, TileInfo>();
  private imageCache = new Map<string, HTMLImageElement>();
  private disposed = false;

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = ATLAS_SIZE;
    this.canvas.height = ATLAS_SIZE;
    this.ctx = this.canvas.getContext("2d")!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.texture.generateMipmaps = true;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
  }

  /** Assign tiles to a list of participants (order = tile order). */
  assign(list: { userId: string }[]): void {
    this.assigned.clear();
    list.slice(0, MAX_TILES).forEach((p, i) => {
      const col = i % TILES_PER_ROW;
      const row = Math.floor(i / TILES_PER_ROW);
      this.assigned.set(p.userId, {
        index: i,
        u: col / TILES_PER_ROW,
        // Flip v: three.js UV origin is bottom-left, canvas is top-left.
        v: 1 - (row + 1) / TILES_PER_ROW,
      });
    });
  }

  tileOf(userId: string): TileInfo | undefined {
    return this.assigned.get(userId);
  }

  /**
   * Paint (or repaint) one participant tile.
   * compact = avatar circle + rings only (no name, no progress chips) - used
   * for mid rows so the grandstand stays orderly instead of a wall of text.
   */
  draw(p: Participant, isMe: boolean, compact = false): void {
    const info = this.assigned.get(p.userId);
    if (!info || this.disposed) return;
    const ctx = this.ctx;
    const x0 = (info.index % TILES_PER_ROW) * TILE;
    const y0 = Math.floor(info.index / TILES_PER_ROW) * TILE;
    ctx.clearRect(x0, y0, TILE, TILE);
    ctx.save();
    ctx.translate(x0, y0);

    // --- progress chips (B I N G O), completed = filled letter color -------
    // Tuned for the light pastel hall: quiet when empty, colorful when done.
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (!compact) {
      const chipW = 17, chipH = 15, gap = 3;
      const rowW = chipW * 5 + gap * 4;
      let cx = (TILE - rowW) / 2;
      ctx.font = "bold 11px system-ui, sans-serif";
      for (const L of LETTERS) {
        const done = p.bestLetters.includes(L);
        if (done) {
          // Completed column: colored letter chip.
          roundRect(ctx, cx, 6, chipW, chipH, 4);
          ctx.fillStyle = LETTER_COLORS[L];
          ctx.fill();
          ctx.fillStyle = "#ffffff";
          ctx.fillText(L, cx + chipW / 2, 6 + chipH / 2 + 0.5);
        } else {
          // Pending: quiet dot, no letter - keeps the grandstand calm.
          ctx.beginPath();
          ctx.arc(cx + chipW / 2, 6 + chipH / 2, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255,255,255,0.5)";
          ctx.fill();
        }
        cx += chipW + gap;
      }
    }

    // --- avatar circle with rings ------------------------------------------
    const ac = compact ? { x: TILE / 2, y: 64, r: 42 } : { x: TILE / 2, y: 62, r: 29 };
    // Consistent white frame on every chip; state rings stack outside:
    // green ring = you, gold ring = suertudo (both can appear together).
    const ringR = ac.r + 3;
    if (p.suertudo) {
      ctx.beginPath();
      ctx.arc(ac.x, ac.y, ringR + (isMe ? 4.5 : 0), 0, Math.PI * 2);
      ctx.strokeStyle = "#e0a83c";
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    if (isMe) {
      ctx.beginPath();
      ctx.arc(ac.x, ac.y, ringR, 0, Math.PI * 2);
      ctx.strokeStyle = "#10b981";
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(ac.x, ac.y, ac.r + 1.5, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.arc(ac.x, ac.y, ac.r, 0, Math.PI * 2);
    ctx.clip();

    const img = p.avatarUrl ? this.imageCache.get(p.avatarUrl) : undefined;
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, ac.x - ac.r, ac.y - ac.r, ac.r * 2, ac.r * 2);
    } else {
      // Generated initials avatar (stable colors per user).
      const h = hashStr(p.userId);
      const [c1, c2] = AVATAR_PALETTES[h % AVATAR_PALETTES.length];
      const g = ctx.createLinearGradient(ac.x - ac.r, ac.y - ac.r, ac.x + ac.r, ac.y + ac.r);
      g.addColorStop(0, c1);
      g.addColorStop(1, c2);
      ctx.fillStyle = g;
      ctx.fillRect(ac.x - ac.r, ac.y - ac.r, ac.r * 2, ac.r * 2);
      ctx.fillStyle = INITIALS_COLOR;
      ctx.font = `bold ${compact ? 36 : 26}px system-ui, sans-serif`;
      ctx.fillText(p.nickname.slice(0, 2).toUpperCase(), ac.x, ac.y + 1);
      if (p.avatarUrl) this.lazyLoad(p, isMe, compact);
    }
    ctx.restore();

    if (!compact) {
      // --- nickname pill (light, readable on the pastel hall) --------------
      const name = p.nickname.length > 12 ? p.nickname.slice(0, 11) + ".." : p.nickname;
      ctx.font = "600 13px system-ui, sans-serif";
      const tw = Math.min(TILE - 8, ctx.measureText(name).width + 14);
      roundRect(ctx, (TILE - tw) / 2, 101, tw, 20, 10);
      ctx.fillStyle = "rgba(255,255,255,0.88)";
      ctx.fill();
      ctx.fillStyle = "#155e50";
      ctx.fillText(name, TILE / 2, 111.5);
    }

    ctx.restore();
    this.texture.needsUpdate = true;
  }

  private lazyLoad(p: Participant, isMe: boolean, compact: boolean): void {
    const url = p.avatarUrl!;
    if (this.imageCache.has(url)) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    this.imageCache.set(url, img);
    img.onload = () => {
      if (!this.disposed) this.draw(p, isMe, compact);
    };
    img.src = url;
  }

  dispose(): void {
    this.disposed = true;
    this.texture.dispose();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
