import { useEffect, useMemo, useRef } from "react";
import { arenaMaxH, hashSeed, mulberry32, useViewportH, useWidth, type GameProps } from "./shared";
import { drawTicket } from "./canvasTicket";
import { drawArenaBg, hudBar, phaseBanner, rr, hexA } from "./arenaFx";

// BOMBAS "campo minado" - self-timed scripted show, faithful to the owner's
// reference: phase announcements as a clean modal, the cross bomb ROAMS the
// grid with a live row+column telegraph and a 3-2-1 count, then ONE expanding
// cross of fire wipes the whole row and column together (no mid-chaos reflow -
// the grid compacts once, after the batch falls). The pineapple drops, bounces,
// sits ticking and bursts: the host is SALVADO, mini-pineapples arc onto the
// neighbours. The jumping bomb hops across decoys with a countdown before it
// lands. WHO falls and in what order comes from the server event script
// (stage.data.events); everything drawn is a pure function of stage elapsed ms
// so all viewers stay in sync (particles are cosmetic only).

const ACCENT = "#FF5A2A";
const PAL = ["#8B7BF0", "#3FBF8F", "#F08A5D", "#EA6A9A", "#5AA0F0", "#F0B24A"];
const RED = "#ff4d4d", GREEN = "#4fd6a0", GOLD = "#F5B301", ORG = "#EF9F27";
const PHASE_LABEL: Record<string, [string, string]> = {
  cross: ["Bomba cruz", "donde caiga el 0 borra su fila y su columna"],
  pine: ["Granada piña", "el impactado se salva · sus vecinos no"],
  jump: ["Bomba saltarina", "salta entre tickets · elimina donde aterriza"],
};

// ---- choreography (ms)
const ANN = 1500;
const SWEEP = 2000, COUNT_EACH = 560, CELL_MS = 62, CROSS_HOLD = 950;
const DROP = 620, BOUNCE = 760, SIT = 950, MINI_BASE = 260, MINI_EACH = 95;
const ENTRY = 560, HOP = 580;
const DIE = 650, RELERP = 450;

interface Ev { type: string; target?: number; host?: number; victim?: number; victims?: number[]; decoys?: number[] }
interface SEv {
  type: string; host: number; target: number; victims: number[]; decoys: number[];
  t0: number; annEnd: number; detAt: number; reflowAt: number; tEnd: number;
  elimAt: Map<number, number>;
  epoch: number; // layout epoch index this event plays in
}
interface Epoch { t: number; ids: number[]; slot: Map<number, number>; rows: number }
interface Schedule {
  evs: SEv[]; epochs: Epoch[]; totalMs: number; elimTimes: number[];
  elimAtGlobal: Map<number, number>; cols: number; gridOrder: number[];
}

function build(stage: any): Schedule {
  const cols = stage.data?.cols ?? 10;
  const gridOrder: number[] = stage.data?.gridOrder ?? stage.aliveBefore ?? [];
  const events: Ev[] = stage.data?.events ?? (stage.eliminated ?? []).map((v: number) => ({ type: "jump", victim: v, decoys: [] }));
  const evs: SEv[] = []; const elimAtGlobal = new Map<number, number>(); const elimTimes: number[] = [];
  const mkEpoch = (t: number, ids: number[]): Epoch => {
    const slot = new Map<number, number>(); ids.forEach((id, i) => slot.set(id, i));
    return { t, ids, slot, rows: Math.max(1, Math.ceil(ids.length / cols)) };
  };
  const epochs: Epoch[] = [mkEpoch(0, gridOrder.slice())];
  let t = 600; let prev: string | null = null;
  events.forEach((ev, k) => {
    const victims = ev.victims ?? (ev.victim != null ? [ev.victim] : []);
    const decoys = ev.decoys ?? [];
    const ep = epochs[epochs.length - 1];
    const t0 = t; const ann = ev.type !== prev; prev = ev.type;
    const annEnd = t0 + (ann ? ANN : 400);
    const elimAt = new Map<number, number>();
    let detAt = annEnd, reflowAt = annEnd;
    if (ev.type === "cross") {
      detAt = annEnd + SWEEP + COUNT_EACH * 3;
      const ts = ep.slot.get(ev.target ?? victims[0]) ?? 0;
      const tc = ts % cols, tr = Math.floor(ts / cols);
      let maxE = detAt;
      for (const id of victims) {
        const s = ep.slot.get(id) ?? 0;
        const d = Math.abs((s % cols) - tc) + Math.abs(Math.floor(s / cols) - tr);
        const e = detAt + 130 + d * CELL_MS;
        elimAt.set(id, e); if (e > maxE) maxE = e;
      }
      reflowAt = maxE + CROSS_HOLD;
    } else if (ev.type === "pine") {
      detAt = annEnd + DROP + BOUNCE + SIT; // burst
      victims.forEach((id, i) => elimAt.set(id, detAt + MINI_BASE + i * MINI_EACH));
      reflowAt = detAt + MINI_BASE + Math.max(1, victims.length) * MINI_EACH + 800;
    } else { // jump
      const hops = decoys.length + 1;
      detAt = annEnd + ENTRY + hops * HOP;
      victims.forEach((id) => elimAt.set(id, detAt));
      reflowAt = detAt + 900;
    }
    elimAt.forEach((ms, id) => { elimAtGlobal.set(id, ms); elimTimes.push(ms); });
    const nextIds = ep.ids.filter((id) => !elimAt.has(id));
    epochs.push(mkEpoch(reflowAt, nextIds));
    t = reflowAt + RELERP + 250;
    evs.push({ type: ev.type, host: ev.host ?? -1, target: ev.target ?? victims[0] ?? -1, victims, decoys, t0, annEnd, detAt, reflowAt, tEnd: t, elimAt, epoch: k });
  });
  elimTimes.sort((a, b) => a - b);
  return { evs, epochs, totalMs: t + 700, elimTimes, elimAtGlobal, cols, gridOrder };
}

export function duration(stage: any): number { return build(stage).totalMs; }
export function elimCountAt(stage: any, ms: number): number { const s = build(stage); let n = 0; for (const e of s.elimTimes) if (e <= ms) n++; return n; }

export default function BombsGame({ participants, stage, stageIdx, myIndices, winnerSet, isFinaleDone, stageStartMs, speed }: GameProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const vh = useViewportH();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sched = useMemo(() => build(stage), [stage]);
  const color = (i: number) => PAL[(participants[i]?.number ?? i) % PAL.length];

  const H = Math.min(arenaMaxH(vh), 520);
  const W = Math.max(280, Math.min(width || 0, 760));
  const pad = 18, top = 70;
  const maxRows = sched.epochs[0]?.rows ?? 1;
  const availH = H - top - 14;
  const cellW = (W - pad * 2) / sched.cols;
  const rowH = Math.max(34, Math.min(84, availH / maxRows));
  const ballR = Math.max(11, Math.min(22, Math.min(cellW, rowH) * 0.34));

  const clockBase = useRef(0);
  useEffect(() => { clockBase.current = typeof performance !== "undefined" ? performance.now() : 0; }, [stageStartMs]);

  const sim = useRef({ parts: [] as any[], lastMs: -1 });
  const R = useRef({ participants, myIndices, winnerSet, isFinaleDone, color, W, H, pad, top, cellW, rowH, ballR, availH });
  R.current = { participants, myIndices, winnerSet, isFinaleDone, color, W, H, pad, top, cellW, rowH, ballR, availH };

  // deterministic waypoints for the cross-bomb roam (synced across viewers)
  const roam = useMemo(() => {
    const out: number[][] = [];
    sched.evs.forEach((ev, k) => {
      if (ev.type !== "cross") { out.push([]); return; }
      const r = mulberry32(hashSeed(stageIdx ?? 0, k, ev.target, 733));
      const ids = sched.epochs[ev.epoch].ids.filter((id) => id !== ev.target);
      const wps: number[] = [];
      for (let i = 0; i < 3 && ids.length; i++) wps.push(ids[Math.floor(r() * ids.length)]);
      wps.push(ev.target);
      out.push(wps);
    });
    return out;
  }, [sched, stageIdx]);

  useEffect(() => {
    const cvs = canvasRef.current; if (!cvs || W < 280) return;
    const ctx = cvs.getContext("2d"); if (!ctx) return;
    const dpr = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
    cvs.width = W * dpr; cvs.height = H * dpr; cvs.style.width = W + "px"; cvs.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let raf = 0;
    const nowMs = () => (stageStartMs != null ? Date.now() - stageStartMs : (performance.now() - clockBase.current) * (speed ?? 1));

    const slotXY = (ep: Epoch, slot: number) => {
      const c = R.current;
      const col = slot % sched.cols, row = Math.floor(slot / sched.cols);
      const gTop = c.top + Math.max(0, (c.availH - ep.rows * c.rowH) / 2);
      return { x: c.pad + col * c.cellW + c.cellW / 2, y: gTop + row * c.rowH + c.rowH / 2 };
    };
    // pure position of a ticket at time ms (handles the single post-event reflow)
    const posOf = (id: number, ms: number) => {
      let e = 0;
      for (let i = sched.epochs.length - 1; i >= 0; i--) if (sched.epochs[i].t <= ms) { e = i; break; }
      while (e > 0 && !sched.epochs[e].slot.has(id)) e--;
      const ep = sched.epochs[e];
      const p = slotXY(ep, ep.slot.get(id) ?? 0);
      if (e > 0 && ms < ep.t + RELERP && sched.epochs[e - 1].slot.has(id)) {
        const prev = slotXY(sched.epochs[e - 1], sched.epochs[e - 1].slot.get(id)!);
        const k = ms <= ep.t ? 0 : (ms - ep.t) / RELERP;
        const s = k * k * (3 - 2 * k);
        return { x: prev.x + (p.x - prev.x) * s, y: prev.y + (p.y - prev.y) * s };
      }
      return p;
    };

    const bombGlyph = (x: number, y: number, r: number, tk: number, rot = 0, sq = 0) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      if (sq > 0) ctx.scale(1 + sq * 0.3, 1 - sq * 0.25);
      // warm halo so the dark body reads over any backdrop
      ctx.save(); ctx.shadowColor = "#FFB25A"; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(0, 0, r + 1, 0, Math.PI * 2); ctx.fillStyle = "rgba(255,178,90,0.28)"; ctx.fill(); ctx.restore();
      const bg = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.15, 0, 0, r * 1.1);
      bg.addColorStop(0, "#8a8a98"); bg.addColorStop(0.55, "#44444f"); bg.addColorStop(1, "#20202a");
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = bg; ctx.fill();
      ctx.strokeStyle = "#c3c3ce"; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.beginPath(); ctx.arc(-r * 0.32, -r * 0.32, r * 0.26, 0, Math.PI * 2); ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.fill();
      // cap + fuse
      ctx.fillStyle = "#6e6e78"; rr(ctx, r * 0.18, -r * 1.12, r * 0.5, r * 0.32, 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(r * 0.42, -r * 1.05); ctx.quadraticCurveTo(r * 0.95, -r * 1.7, r * 0.32, -r * 2);
      ctx.strokeStyle = "#c9c9d2"; ctx.lineWidth = 1.8; ctx.stroke();
      ctx.save(); ctx.shadowColor = GOLD; ctx.shadowBlur = 11;
      ctx.beginPath(); ctx.arc(r * 0.32, -r * 2, 2.6 + Math.max(0, Math.sin(tk * 0.9)) * 1.2, 0, Math.PI * 2);
      ctx.fillStyle = "#FFE08A"; ctx.fill(); ctx.restore();
      ctx.restore();
    };
    const pineGlyph = (x: number, y: number, r: number, rot = 0, sq = 1) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(1 + (sq - 1) * 1.2, 1 - (sq - 1) * 0.9);
      ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.ellipse(0, 0, r * 0.8, r, 0, 0, Math.PI * 2); ctx.fillStyle = "#5f9a2a"; ctx.fill(); ctx.shadowBlur = 0;
      ctx.strokeStyle = "#97C459"; ctx.lineWidth = 1;
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(-r * 0.7, i * r * 0.45); ctx.lineTo(r * 0.7, i * r * 0.45); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(-r * 0.35, -r); ctx.lineTo(r * 0.35, r); ctx.stroke();
      ctx.fillStyle = "#B4B2A9"; ctx.fillRect(-2, -r - 5, 4, 5);
      ctx.restore();
    };
    const countGlyph = (x: number, y: number, n: number, tk: number, urgent: boolean) => {
      const scale = (urgent ? 1.3 : 1.05) + Math.max(0, Math.sin(tk * (urgent ? 0.5 : 0.3))) * 0.3;
      ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
      ctx.shadowColor = "rgba(0,0,0,0.8)"; ctx.shadowBlur = 6;
      ctx.fillStyle = n >= 3 ? GOLD : n === 2 ? ORG : RED;
      ctx.font = "800 20px Inter, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(String(n), 0, 0); ctx.restore();
    };
    const spawnBoom = (x: number, y: number, big: boolean) => {
      const s = sim.current;
      const n = big ? 26 : 13;
      for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, sp = (big ? 3 : 2) + Math.random() * (big ? 5.5 : 3.5); s.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, life: 1, dec: 0.028, r: 2 + Math.random() * 3, c: i % 3 === 0 ? "#FFE7B0" : i % 2 ? ACCENT : "#ff7a4d", glow: i % 2 === 0 }); }
      for (let i = 0; i < (big ? 7 : 3); i++) s.parts.push({ x: x + (Math.random() - 0.5) * 10, y: y + (Math.random() - 0.5) * 6, vx: (Math.random() - 0.5) * 0.7, vy: -0.4 - Math.random() * 0.7, life: 1, dec: 0.012, c: "#5F5E5A", r: 3 + Math.random() * 4, sm: 1 });
    };
    // pure expanding shockwave rings for a boom at time t0
    const waveFx = (x: number, y: number, ms: number, t0: number, big: boolean) => {
      const dt = ms - t0; if (dt < 0 || dt > 620) return;
      const p = dt / 620;
      ctx.save(); ctx.globalAlpha = (1 - p) * 0.9; ctx.shadowColor = ACCENT; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(x, y, (big ? 16 : 9) + dt * (big ? 0.16 : 0.11), 0, Math.PI * 2);
      ctx.strokeStyle = ACCENT; ctx.lineWidth = big ? 4 : 2.5; ctx.stroke();
      if (dt < 260) { ctx.globalAlpha = 1 - dt / 260; ctx.beginPath(); ctx.arc(x, y, 4 + dt * 0.1, 0, Math.PI * 2); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke(); }
      ctx.restore();
    };

    const frame = () => {
      const c = R.current; const s = sim.current; const ms = nowMs();
      const tk = (typeof performance !== "undefined" ? performance.now() : 0) / 16.667;

      const gone = new Set<number>(); sched.elimAtGlobal.forEach((t2, id) => { if (t2 <= ms) gone.add(id); });
      // one-shot particles on crossings
      let shakeKick = 0;
      if (s.lastMs >= 0 && ms > s.lastMs && ms - s.lastMs < 500) {
        sched.elimAtGlobal.forEach((t2, id) => { if (t2 > s.lastMs && t2 <= ms) { const p = posOf(id, t2); spawnBoom(p.x, p.y, false); shakeKick = Math.max(shakeKick, 4); } });
        for (const ev of sched.evs) if (ev.detAt > s.lastMs && ev.detAt <= ms && (ev.type === "cross" || ev.type === "pine")) { const tp = posOf(ev.type === "pine" ? ev.host : ev.target, ev.detAt); spawnBoom(tp.x, tp.y, true); shakeKick = Math.max(shakeKick, 9); }
      }
      s.lastMs = ms;
      for (const p of s.parts) { p.x += p.vx; p.y += p.vy; if (p.sm) { p.vy *= 0.98; p.r += 0.06; } else p.vy += 0.07; p.life -= p.dec; }
      s.parts = s.parts.filter((p: any) => p.life > 0);

      // pure screen shake driven by recent booms
      let shake = 0;
      for (const ev of sched.evs) {
        if (ev.type !== "jump" && ms >= ev.detAt) shake = Math.max(shake, 9 * Math.pow(0.82, (ms - ev.detAt) / 16.667));
        ev.elimAt.forEach((t2) => { if (ms >= t2) shake = Math.max(shake, 3.5 * Math.pow(0.82, (ms - t2) / 16.667)); });
      }
      shake = Math.min(shake, 10); if (shake < 0.3) shake = 0;

      const ev = sched.evs.find((e) => ms >= e.t0 && ms < e.tEnd);
      const annA = ev && ms < ev.annEnd && ev.annEnd - ev.t0 > 500
        ? (() => { const p = (ms - ev.t0) / ANN; return p < 0.15 ? p / 0.15 : p > 0.82 ? Math.max(0, (1 - p) / 0.18) : 1; })()
        : 0;

      const shX = Math.sin(tk * 3.1) * shake, shY = Math.cos(tk * 2.7) * shake;
      ctx.save(); ctx.translate(shX, shY);
      drawArenaBg(ctx, c.W, c.H, ACCENT, tk);

      // scorch decals where tickets died (fade over 5s)
      sched.elimAtGlobal.forEach((t2, id) => {
        if (ms < t2 || ms > t2 + 5000) return;
        const p = posOf(id, t2);
        ctx.save(); ctx.globalAlpha = 0.4 * (1 - (ms - t2) / 5000);
        ctx.beginPath(); ctx.ellipse(p.x, p.y + c.ballR * 0.5, c.ballR * 1.2, c.ballR * 0.5, 0, 0, Math.PI * 2);
        ctx.fillStyle = "#060608"; ctx.fill(); ctx.restore();
      });

      // fear set (jitter) computed per event below
      const fear = new Set<number>();

      // ---------- event choreography (telegraphs under tickets) ----------
      if (ev && ms >= ev.annEnd) {
        const ep = sched.epochs[ev.epoch];
        const gTop = c.top + Math.max(0, (c.availH - ep.rows * c.rowH) / 2);
        if (ev.type === "cross") {
          const rel = ms - ev.annEnd;
          const armLen = ev.detAt - ev.annEnd; const settle = armLen * 0.8;
          // bomb position: roam over waypoints, settle on target for the last beat
          const wps = roam[sched.evs.indexOf(ev)] ?? [ev.target];
          let bx = 0, by = 0, curId = ev.target;
          if (rel < settle) {
            const fp = rel / settle; const segf = fp * (wps.length - 1);
            const i0 = Math.min(wps.length - 2, Math.floor(segf)); const f = segf - i0;
            const a = posOf(wps[i0], ms), b = posOf(wps[i0 + 1], ms);
            const sm = f * f * (3 - 2 * f);
            bx = a.x + (b.x - a.x) * sm; by = a.y + (b.y - a.y) * sm - c.ballR - 16 - Math.sin(fp * Math.PI * 5) * 8;
            // nearest ticket under the bomb owns the telegraph
            let bd = 1e9;
            for (const id of ep.ids) { if (gone.has(id)) continue; const p = posOf(id, ms); const d = Math.hypot(p.x - bx, p.y - by); if (d < bd) { bd = d; curId = id; } }
          } else if (ms < ev.detAt) {
            const tp = posOf(ev.target, ms); bx = tp.x; by = tp.y - c.ballR - 16; curId = ev.target;
          }
          if (ms < ev.detAt) {
            // row+column telegraph on the current ticket
            const slot = ep.slot.get(curId) ?? 0; const col = slot % sched.cols, row = Math.floor(slot / sched.cols);
            const locked = rel >= settle; const urgent = ms > ev.detAt - COUNT_EACH;
            ctx.save();
            ctx.globalAlpha = (urgent ? 0.15 : 0.09) + Math.sin(tk * (urgent ? 0.5 : 0.25)) * 0.04;
            ctx.fillStyle = RED;
            rr(ctx, c.pad, gTop + row * c.rowH + 3, c.W - c.pad * 2, c.rowH - 6, 8); ctx.fill();
            rr(ctx, c.pad + col * c.cellW + 3, gTop + 2, c.cellW - 6, ep.rows * c.rowH - 4, 8); ctx.fill();
            ctx.globalAlpha = 1; ctx.strokeStyle = hexA(RED, locked ? 0.85 : 0.5); ctx.lineWidth = locked ? 2 : 1; ctx.setLineDash([6, 5]);
            rr(ctx, c.pad, gTop + row * c.rowH + 3, c.W - c.pad * 2, c.rowH - 6, 8); ctx.stroke();
            rr(ctx, c.pad + col * c.cellW + 3, gTop + 2, c.cellW - 6, ep.rows * c.rowH - 4, 8); ctx.stroke();
            ctx.setLineDash([]); ctx.restore();
            if (locked) for (const id of ep.ids) { if (gone.has(id)) continue; const sl = ep.slot.get(id)!; if (sl % sched.cols === col || Math.floor(sl / sched.cols) === row) fear.add(id); }
          }
        } else if (ev.type === "pine" && ev.host >= 0) {
          const hp = posOf(ev.host, ms); const rel = ms - ev.annEnd;
          if (rel >= DROP && ms < ev.detAt + 400) {
            // green "saved" telegraph ring on the host
            ctx.save(); ctx.strokeStyle = ms >= ev.detAt ? GREEN : ORG; ctx.globalAlpha = 0.75; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
            ctx.beginPath(); ctx.arc(hp.x, hp.y, c.ballR + 7 + Math.sin(tk * 0.4) * 2, 0, Math.PI * 2); ctx.stroke();
            ctx.setLineDash([]); ctx.restore();
            if (ms < ev.detAt) fear.add(ev.host);
          }
        } else if (ev.type === "jump") {
          const rel = ms - ev.annEnd;
          const path = [...ev.decoys, ev.victims[0]];
          if (ms < ev.detAt && path.length) {
            const seg = rel < ENTRY ? 0 : Math.min(path.length - 1, Math.floor((rel - ENTRY) / HOP));
            const perch = path[Math.max(0, rel < ENTRY ? 0 : seg)];
            const hard = perch === ev.victims[0] && seg === path.length - 1;
            const pp = posOf(perch, ms);
            ctx.save(); ctx.strokeStyle = RED; ctx.lineWidth = hard ? 3 : 1.5; ctx.globalAlpha = hard ? 1 : 0.55;
            ctx.setLineDash(hard ? [] : [4, 4]);
            ctx.beginPath(); ctx.arc(pp.x, pp.y, c.ballR + 7 + Math.sin(tk * 0.45) * 2, 0, Math.PI * 2); ctx.stroke();
            ctx.setLineDash([]); ctx.restore();
          }
        }
      }

      // ---------- cross detonation beams (one clean expanding cross) ----------
      for (const cev of sched.evs) {
        if (cev.type !== "cross" || ms < cev.detAt || ms > cev.detAt + 900) continue;
        const ep = sched.epochs[cev.epoch];
        const gTop = c.top + Math.max(0, (c.availH - ep.rows * c.rowH) / 2);
        const tp = slotXY(ep, ep.slot.get(cev.target) ?? 0);
        const dt = ms - cev.detAt;
        const a = Math.max(0, 1 - dt / 700);
        const reachX = (dt / CELL_MS) * c.cellW, reachY = (dt / CELL_MS) * c.rowH;
        const bw = Math.min(26, c.rowH * 0.42);
        ctx.save(); ctx.globalAlpha = a * 0.9; ctx.shadowColor = ORG; ctx.shadowBlur = 18; ctx.fillStyle = ORG;
        ctx.fillRect(Math.max(c.pad, tp.x - reachX), tp.y - bw / 2, Math.min(tp.x - c.pad, reachX), bw);
        ctx.fillRect(tp.x, tp.y - bw / 2, Math.min(c.W - c.pad - tp.x, reachX), bw);
        ctx.fillRect(tp.x - bw / 2, Math.max(gTop, tp.y - reachY), bw, Math.min(tp.y - gTop, reachY));
        ctx.fillRect(tp.x - bw / 2, tp.y, bw, Math.min(gTop + ep.rows * c.rowH - tp.y, reachY));
        if (dt < 240) { ctx.globalAlpha = (1 - dt / 240) * 0.9; ctx.fillStyle = "#FFF1C0"; const cw2 = bw * 0.4; ctx.fillRect(Math.max(c.pad, tp.x - reachX), tp.y - cw2 / 2, Math.min(tp.x - c.pad, reachX), cw2); ctx.fillRect(tp.x, tp.y - cw2 / 2, Math.min(c.W - c.pad - tp.x, reachX), cw2); }
        ctx.restore();
        waveFx(tp.x, tp.y, ms, cev.detAt, true);
      }
      // pine burst wave
      for (const pev of sched.evs) if (pev.type === "pine" && ms >= pev.detAt) { const hp = posOf(pev.host, pev.detAt); waveFx(hp.x, hp.y - c.ballR - 10, ms, pev.detAt, true); }
      // per-victim pop waves
      sched.elimAtGlobal.forEach((t2, id) => { if (ms >= t2) { const p = posOf(id, t2); waveFx(p.x, p.y, ms, t2, false); } });

      // ---------- tickets ----------
      const epNow = (() => { let e = 0; for (let i = sched.epochs.length - 1; i >= 0; i--) if (sched.epochs[i].t <= ms) { e = i; break; } return sched.epochs[e]; })();
      const aliveIds = sched.gridOrder.filter((id) => !gone.has(id));
      const showName = aliveIds.length <= 24 && c.rowH >= 56;
      // dying tickets first (under the living)
      sched.elimAtGlobal.forEach((t2, id) => {
        if (ms < t2 || ms > t2 + DIE) return;
        const f = (ms - t2) / DIE; const p = posOf(id, t2); const pt = c.participants[id];
        ctx.save(); ctx.globalAlpha = 1 - f; ctx.translate(p.x, p.y + f * f * c.rowH * 0.9); ctx.rotate(f * 0.9); ctx.scale(1 - f * 0.35, 1 - f * 0.35);
        drawTicket(ctx, { x: 0, y: 0, r: c.ballR, color: "#2b2b33", number: pt?.number ?? id + 1, nickname: pt?.nickname, dim: true, showLabel: true, showName: false });
        ctx.restore(); ctx.globalAlpha = 1;
      });
      for (const id of aliveIds) {
        const p = posOf(id, ms); const pt = c.participants[id];
        let fx = 0, fy = 0, sq = 0, lift = 0;
        if (fear.has(id)) { fx = Math.sin(tk * 1.3 + (id % 7)) * 2.5; fy = Math.cos(tk * 1.5) * 1.5; }
        // pine host: squash on thump, hop on burst, SALVADO after
        for (const pev of sched.evs) {
          if (pev.type === "pine" && pev.host === id) {
            const thumpT = pev.annEnd + DROP;
            if (ms >= thumpT && ms < thumpT + 240) sq = Math.max(sq, (1 - (ms - thumpT) / 240) * 1.1);
            if (ms >= pev.detAt && ms < pev.detAt + 420) { const bp = (ms - pev.detAt) / 420; lift = Math.sin(bp * Math.PI) * 16; }
          }
          if (pev.type === "jump") {
            const path = [...pev.decoys, pev.victims[0]];
            for (let si = 0; si < path.length; si++) {
              if (path[si] !== id) continue;
              const landT = pev.annEnd + ENTRY + si * HOP;
              if (ms >= landT && ms < landT + 220) sq = Math.max(sq, (1 - (ms - landT) / 220));
            }
          }
        }
        ctx.save(); ctx.translate(p.x + fx, p.y + fy - lift);
        if (sq > 0) ctx.scale(1 + sq * 0.22, 1 - sq * 0.2);
        drawTicket(ctx, { x: 0, y: 0, r: c.ballR, color: c.color(id), number: pt?.number ?? id + 1, nickname: pt?.nickname, avatarUrl: pt?.avatarUrl, mine: c.myIndices.has(id), winner: c.isFinaleDone && c.winnerSet.has(id), showName });
        ctx.restore();
        // SALVADO badge lingers on the pine host
        for (const pev of sched.evs) if (pev.type === "pine" && pev.host === id && ms >= pev.detAt && ms < pev.detAt + 2600) {
          const a2 = Math.min(1, (pev.detAt + 2600 - ms) / 700);
          ctx.save(); ctx.globalAlpha = a2; ctx.shadowColor = GREEN; ctx.shadowBlur = 10;
          ctx.beginPath(); ctx.arc(p.x, p.y - lift, c.ballR + 6, 0, Math.PI * 2); ctx.strokeStyle = GREEN; ctx.lineWidth = 2.5; ctx.stroke();
          ctx.fillStyle = GREEN; ctx.font = "800 11px Inter, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText("SALVADO", p.x, p.y - lift - c.ballR - 13); ctx.restore();
        }
      }

      // ---------- flying glyphs (drawn over tickets) ----------
      if (ev && ms >= ev.annEnd) {
        const rel = ms - ev.annEnd;
        if (ev.type === "cross" && ms < ev.detAt) {
          const wps = roam[sched.evs.indexOf(ev)] ?? [ev.target];
          let bx: number, by: number;
          const armLen = ev.detAt - ev.annEnd; const settle = armLen * 0.8;
          if (rel < settle) {
            const fp = rel / settle; const segf = fp * (wps.length - 1);
            const i0 = Math.min(wps.length - 2, Math.floor(segf)); const f = segf - i0;
            const a = posOf(wps[i0], ms), b = posOf(wps[i0 + 1], ms);
            const sm = f * f * (3 - 2 * f);
            bx = a.x + (b.x - a.x) * sm; by = a.y + (b.y - a.y) * sm - c.ballR - 16 - Math.sin(fp * Math.PI * 5) * 8;
          } else { const tp = posOf(ev.target, ms); bx = tp.x; by = tp.y - c.ballR - 16; }
          bombGlyph(bx, by, 11, tk, Math.sin(tk * 0.15) * 0.1);
          // red cross sight under the glyph
          ctx.save(); ctx.strokeStyle = RED; ctx.lineWidth = 2; ctx.globalAlpha = 0.9;
          ctx.beginPath(); ctx.moveTo(bx - 13, by); ctx.lineTo(bx + 13, by); ctx.moveTo(bx, by - 13); ctx.lineTo(bx, by + 13); ctx.stroke(); ctx.restore();
          // continuous countdown 5..1 across the whole arming window; frozen at 1
          const n = Math.max(1, Math.ceil((1 - rel / armLen) * 4) + 1);
          countGlyph(bx, by - 26, n, tk, n <= 1);
        } else if (ev.type === "pine") {
          const hp = posOf(ev.host, ms);
          const gy0 = hp.y - c.ballR - 12;
          if (rel < DROP) { const p = rel / DROP; pineGlyph(hp.x, -26 + (gy0 + 26) * p * p, 10, p * 5); }
          else if (rel < DROP + BOUNCE) { const p = (rel - DROP) / BOUNCE; const bh = Math.abs(Math.sin(p * Math.PI * 2.5)) * 22 * (1 - p); pineGlyph(hp.x, gy0 - bh, 10, 0, bh < 3 ? 1.3 : 1); }
          else if (ms < ev.detAt) { pineGlyph(hp.x + Math.sin(tk * 0.7) * 1.5, gy0, 10, 0, 1 + Math.max(0, Math.sin(tk * 0.35)) * 0.18); }
          // minis arcing to the victims
          if (ms >= ev.detAt) {
            const src = { x: hp.x, y: gy0 };
            ev.victims.forEach((id, i) => {
              const at = ev.elimAt.get(id)!; if (ms >= at) return;
              const start = ev.detAt; const p = Math.max(0, (ms - start) / (at - start));
              const vp = posOf(id, ms);
              const px = src.x + (vp.x - src.x) * p, py = src.y + (vp.y - src.y) * p - Math.sin(p * Math.PI) * (28 + (i % 4) * 9);
              pineGlyph(px, py, 6, p * 6);
            });
          }
        } else if (ev.type === "jump" && ev.victims[0] != null && ms < ev.detAt + 60) {
          const path = [...ev.decoys, ev.victims[0]];
          let bx: number, by: number, rot = 0, sq = 0, cnt = path.length;
          if (rel < ENTRY) {
            const p = rel / ENTRY; const t0 = posOf(path[0], ms);
            bx = t0.x; by = -24 + (t0.y - c.ballR - 14 + 24) * p * p; cnt = path.length;
          } else {
            const seg = Math.min(path.length - 1, Math.floor((rel - ENTRY) / HOP));
            const p = Math.min(1, ((rel - ENTRY) % HOP) / (HOP * 0.92));
            const from = posOf(path[seg], ms);
            const to = posOf(path[Math.min(seg + 1, path.length - 1)], ms);
            const sm = p * p * (3 - 2 * p);
            bx = from.x + (to.x - from.x) * sm;
            by = (from.y - c.ballR - 14) + ((to.y - c.ballR - 14) - (from.y - c.ballR - 14)) * sm - Math.sin(sm * Math.PI) * 44;
            rot = (sm - 0.5) * 0.7 * (to.x > from.x ? 1 : -1);
            sq = sm > 0.92 ? (sm - 0.92) * 8 : 0;
            cnt = path.length - 1 - seg;
          }
          if (ms < ev.detAt) {
            bombGlyph(bx, by, 11, tk, rot, sq);
            countGlyph(bx, by - 24, Math.max(1, cnt), tk, cnt <= 1);
          }
        }
      }

      // particles on top
      for (const p of s.parts) { ctx.save(); ctx.globalAlpha = Math.max(0, p.life) * (p.sm ? 0.4 : 1); if (p.glow) { ctx.shadowColor = p.c; ctx.shadowBlur = 8; } ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fillStyle = p.c; ctx.fill(); ctx.restore(); }
      ctx.globalAlpha = 1;

      // ---------- announcement modal (dims the arena, no clash with the grid) ----------
      if (ev && annA > 0) {
        const pl = PHASE_LABEL[ev.type];
        if (pl) {
          ctx.save(); ctx.globalAlpha = annA * 0.6; ctx.fillStyle = "#05050a"; ctx.fillRect(0, 0, c.W, c.H); ctx.restore();
          phaseBanner(ctx, c.W, c.H, pl[0], pl[1], annA, ACCENT);
        }
      }
      ctx.restore();

      const aliveCount = sched.gridOrder.length - gone.size;
      const goal = sched.gridOrder.length - sched.elimTimes.length;
      hudBar(ctx, c.W, { title: "Campo minado", alive: aliveCount, goal, pct: sched.totalMs ? Math.min(1, ms / sched.totalMs) : 1, accent: ACCENT, phase: ev ? PHASE_LABEL[ev.type]?.[0] : ms >= sched.totalMs - 700 ? "Completado" : undefined });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [W, H, sched, roam, stageStartMs, speed]);

  return (
    <div ref={ref} className="overflow-hidden rounded-2xl bg-black" style={{ height: H }}>
      <canvas ref={canvasRef} className="mx-auto block" />
    </div>
  );
}
