// Three.js engine for the live bingo hall.
// Imperative class driven by the React island (BingoScene.tsx). Owns the
// renderer loop, the ball machine, the crowd (tiered amphitheater) and
// ambient FX. Designed to stay smooth on mid-range phones: clamped DPR,
// one draw call for the near crowd, one for the far crowd, one per particle
// system.
//
// Art direction (tramo 1+2): soft pastel hall anchored on qori green.
// - Backdrop: mint-to-cream gradient dome, light fog for aerial depth.
// - Crowd: EVERY participant gets a seat in concentric grandstand arcs that
//   rise behind the machine. Front rows (leaders + you) render full avatar
//   chips (photo/initial + name + BINGO progress); back rows simplify to
//   tinted head chips in the same circular language. No floating, no jitter.
// - Camera: elevated 3/4 broadcast angle, machine as the hero.

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { AvatarAtlas, MAX_TILES } from "./avatarAtlas";
import { LETTER_COLORS, type BingoLetter, type Participant } from "./types";

// Front tier: full-detail avatar chips (atlas). Everyone else still gets a
// seat as a simplified head chip so the grandstand feels genuinely full.
const NEAR_COUNT = 96;

// --- ball machine variant (design exploration) ----------------------------
// 0 = original (standard PBR dome machine, committed look)
// 1 = toon gumball: glass globe on a chunky cream+green gumball body
// 2 = toon wire-cage lottery drum on legs, hand crank + exit tray
// 3 = toon capsule blower: rounded tank + clear riser tube
const MACHINE_VARIANT: 0 | 1 | 2 | 3 = 1;

// --- pastel palette -------------------------------------------------------
const PAL = {
  fog: 0xe3f1e8,
  skyTop: "#d9f2e3",
  skyMid: "#f2f3e2",
  skyHorizon: "#f3e8d3",
  floorCenter: "#fdf7e9",
  floorMid: "#e3efdc",
  floorEdge: "#c2dfce",
  tierTopA: "#dcefe4",
  tierTopB: "#f2ecd8",
  tierFaceA: "#bcdccb",
  tierFaceB: "#e2d6ba",
  machineGreen: 0x2fae7e,
  machineGreenDark: 0x1f8f66,
  cream: 0xf6f0df,
  gold: 0xe4bd63,
  glass: 0xf2fff9,
};

// Pastel tints for the far-crowd head chips (multiplied over a white sprite).
const FAR_TINTS = [
  0xa7dcc3, 0xbcd7f0, 0xf2c9cf, 0xf0ddb0, 0xd4cdf0, 0xb5e0d0, 0xbfe0ee, 0xf0cfc0,
];

type CrowdSlot = { userId: string; sig: string; compact: boolean };
type Seat = { x: number; y: number; z: number; row: number };

function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class BingoScene3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls!: OrbitControls;
  private clock = new THREE.Clock();
  private disposed = false;
  private pointer = new THREE.Vector2(0, 0);
  private camBase = new THREE.Vector3(3.6, 5.0, 12.8);
  private camLook = new THREE.Vector3(0, 2.4, -2.6);

  private atlas = new AvatarAtlas();
  private crowdMesh: THREE.Mesh | null = null;
  private crowdMat: THREE.ShaderMaterial | null = null;
  private farMesh: THREE.Mesh | null = null;
  private farMat: THREE.ShaderMaterial | null = null;
  private crowdSlots: CrowdSlot[] = [];
  private tierGroup: THREE.Group | null = null;
  private meId = "";
  // Hover picking + spotlight: each avatar's world center + its per-mesh id.
  private crowdPositions: { userId: string; pos: THREE.Vector3 }[] = [];
  private idOf = new Map<string, { far: boolean; id: number }>();
  private hoverCb: ((userId: string | null, x: number, y: number) => void) | null = null;
  private lastHoverId: string | null = null;
  private pointerPx = new THREE.Vector2(-9999, -9999);

  // machine
  private innerBalls!: THREE.InstancedMesh;
  private innerOutline: THREE.InstancedMesh | null = null;
  private innerData: { p: THREE.Vector3; axis: THREE.Vector3; speed: number; r: number }[] = [];
  private agitate = 0; // 0 idle .. 1 frantic
  private dome: THREE.Mesh | null = null;
  private cageSpin: THREE.Group | null = null;
  private ballYScale = 0.75;
  private ballYOff = -0.25;

  // flying ball
  private flyBall: THREE.Mesh | null = null;
  private flyStart = 0;
  private flyCurve: THREE.QuadraticBezierCurve3 | null = null;

  // ambient confetti + celebration burst
  private confetti!: THREE.Points;
  private confettiVel: Float32Array = new Float32Array(0);
  private burst: THREE.Points | null = null;
  private burstVel: Float32Array = new Float32Array(0);
  private burstStart = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    const mobile = Math.min(window.innerWidth, window.innerHeight) < 640;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.75 : 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 120);
    this.camera.position.copy(this.camBase);
    this.camera.lookAt(this.camLook);

    // Orbit + zoom: drag to orbit the gumball, wheel to zoom. Damped, no pan,
    // clamped so you can't dive under the floor or zoom past the machine.
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.target.copy(this.camLook);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.rotateSpeed = 0.55;
    this.controls.zoomSpeed = 0.8;
    this.controls.minDistance = 6.5;
    this.controls.maxDistance = 22;
    this.controls.minPolarAngle = 0.5;
    this.controls.maxPolarAngle = 1.5;
    // Barely-there automatic drift to the right; pauses while you drag.
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = -0.22;
    this.controls.update();

    this.buildEnvironment();
    this.buildMachine();
    this.buildConfetti();

    this.onResize();
    window.addEventListener("resize", this.onResize);
    window.addEventListener("pointermove", this.onPointer, { passive: true });

    this.renderer.setAnimationLoop(this.frame);
  }

  // ---------------------------------------------------------------- ambiente
  private buildEnvironment() {
    // Soft pastel backdrop: mint sky into warm cream horizon, faint bokeh.
    const bg = document.createElement("canvas");
    bg.width = 512; bg.height = 512;
    const c = bg.getContext("2d")!;
    const g = c.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, PAL.skyTop);
    g.addColorStop(0.55, PAL.skyMid);
    g.addColorStop(1, PAL.skyHorizon);
    c.fillStyle = g;
    c.fillRect(0, 0, 512, 512);
    // Very soft bokeh discs, barely-there festivity.
    for (let i = 0; i < 30; i++) {
      const x = Math.random() * 512, y = Math.random() * 300, r = 8 + Math.random() * 26;
      const rg = c.createRadialGradient(x, y, 0, x, y, r);
      const tone = i % 3;
      rg.addColorStop(0, tone === 0 ? "rgba(163,216,190,0.16)" : tone === 1 ? "rgba(232,200,140,0.13)" : "rgba(180,205,235,0.11)");
      rg.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = rg;
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    }
    const bgTex = new THREE.CanvasTexture(bg);
    bgTex.colorSpace = THREE.SRGBColorSpace;
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(60, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.62),
      new THREE.MeshBasicMaterial({ map: bgTex, side: THREE.BackSide, fog: false })
    );
    dome.position.y = -2;
    this.scene.add(dome);
    this.scene.fog = new THREE.Fog(PAL.fog, 26, 70);

    // Floor: warm cream stage center melting into soft mint.
    const fl = document.createElement("canvas");
    fl.width = 512; fl.height = 512;
    const fc = fl.getContext("2d")!;
    const fg = fc.createRadialGradient(256, 256, 20, 256, 256, 256);
    fg.addColorStop(0, PAL.floorCenter);
    fg.addColorStop(0.45, PAL.floorMid);
    fg.addColorStop(1, PAL.floorEdge);
    fc.fillStyle = fg;
    fc.fillRect(0, 0, 512, 512);
    // Whisper-thin concentric stage rings.
    fc.strokeStyle = "rgba(255,255,255,0.35)";
    for (let r = 56; r < 250; r += 46) {
      fc.lineWidth = 2;
      fc.beginPath(); fc.arc(256, 256, r, 0, Math.PI * 2); fc.stroke();
    }
    const flTex = new THREE.CanvasTexture(fl);
    flTex.colorSpace = THREE.SRGBColorSpace;
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(40, 48),
      new THREE.MeshStandardMaterial({ map: flTex, roughness: 0.9, metalness: 0.02 })
    );
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    // Lighting: bright soft ambient dome + one gentle warm key + mint fill.
    this.scene.add(new THREE.HemisphereLight(0xfffdf6, 0xd6e7db, 1.05));
    const key = new THREE.DirectionalLight(0xffefd2, 1.15);
    key.position.set(7, 12, 8);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xd9f2e4, 0.45);
    fill.position.set(-8, 6, -4);
    this.scene.add(fill);
  }

  // ----------------------------------------------------------- ball machine
  private buildMachine() {
    switch (MACHINE_VARIANT as number) {
      case 1: this.buildMachineGumball(); break;
      case 2: this.buildMachineCage(); break;
      case 3: this.buildMachineBlower(); break;
      default: this.buildMachineOriginal();
    }
  }

  private buildMachineOriginal() {
    const machine = new THREE.Group();

    // Cream podium disc grounds the machine on the stage (gold side band,
    // cream top - no floating rings).
    const podium = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.6, 0.24, 48), [
      new THREE.MeshStandardMaterial({ color: PAL.gold, roughness: 0.32, metalness: 0.7 }),
      new THREE.MeshStandardMaterial({ color: PAL.cream, roughness: 0.6, metalness: 0.05 }),
      new THREE.MeshStandardMaterial({ color: PAL.cream, roughness: 0.6, metalness: 0.05 }),
    ]);
    podium.position.y = 0.12;
    machine.add(podium);

    // Pedestal: qori green with a soft gold band.
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.45, 1.85, 1.05, 40),
      new THREE.MeshStandardMaterial({ color: PAL.machineGreen, roughness: 0.42, metalness: 0.18 })
    );
    base.position.y = 0.74;
    machine.add(base);

    const trim = new THREE.Mesh(
      new THREE.TorusGeometry(1.47, 0.08, 14, 44),
      new THREE.MeshStandardMaterial({ color: PAL.gold, roughness: 0.28, metalness: 0.8 })
    );
    trim.rotation.x = Math.PI / 2;
    trim.position.y = 1.3;
    machine.add(trim);

    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.95, 1.18, 0.34, 36),
      new THREE.MeshStandardMaterial({ color: PAL.machineGreenDark, roughness: 0.45, metalness: 0.15 })
    );
    neck.position.y = 1.46;
    machine.add(neck);

    // Glass dome.
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(1.35, 40, 28),
      new THREE.MeshPhysicalMaterial({
        color: PAL.glass,
        roughness: 0.06,
        metalness: 0,
        transparent: true,
        opacity: 0.28,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.dome.position.y = 2.75;
    this.dome.renderOrder = 5;
    machine.add(this.dome);

    // Thin gold meridian band sells the sphere (classic bingo cage cue).
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(1.36, 0.03, 10, 64),
      new THREE.MeshStandardMaterial({ color: PAL.gold, roughness: 0.3, metalness: 0.75 })
    );
    band.position.y = 2.75;
    band.rotation.x = Math.PI / 2.4;
    machine.add(band);

    // Chute where the winning ball exits, pointing up.
    const chute = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17, 0.23, 0.34, 20, 1, true),
      new THREE.MeshStandardMaterial({ color: PAL.gold, roughness: 0.3, metalness: 0.75, side: THREE.DoubleSide })
    );
    chute.position.y = 4.06;
    machine.add(chute);

    // Balls tumbling inside the dome (letter colors softened toward pastel).
    const n = 26;
    const geo = new THREE.SphereGeometry(0.16, 14, 12);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.05 });
    this.innerBalls = new THREE.InstancedMesh(geo, mat, n);
    const white = new THREE.Color(0xffffff);
    const cols = Object.values(LETTER_COLORS).map((c) => new THREE.Color(c).lerp(white, 0.15));
    for (let i = 0; i < n; i++) {
      const r = 0.35 + Math.random() * 0.75;
      this.innerData.push({
        p: new THREE.Vector3().randomDirection().multiplyScalar(r),
        axis: new THREE.Vector3().randomDirection(),
        speed: 0.6 + Math.random() * 1.2,
        r,
      });
      this.innerBalls.setColorAt(i, cols[i % cols.length]);
    }
    if (this.innerBalls.instanceColor) this.innerBalls.instanceColor.needsUpdate = true;
    this.innerBalls.position.y = 2.75;
    machine.add(this.innerBalls);

    this.scene.add(machine);
  }

  // --- shared toon pieces for the exploration variants ---------------------

  /** Cream cell-shaded podium disc grounding every toon machine. */
  private toonPodium(machine: THREE.Group) {
    const disc = outlined(new THREE.CylinderGeometry(2.3, 2.42, 0.26, 48), toon(PAL.cream), 1.02, 1.35);
    disc.position.y = 0.13;
    machine.add(disc);
    const lip = new THREE.Mesh(
      new THREE.TorusGeometry(2.36, 0.045, 10, 56),
      toon(PAL.gold)
    );
    lip.rotation.x = Math.PI / 2;
    lip.position.y = 0.27;
    machine.add(lip);
  }

  /** Instanced toon balls + inverted-hull outlines tumbling in the chamber. */
  private buildToonBalls(
    machine: THREE.Group,
    opts: { count: number; ballR: number; maxR: number; y: number; yScale: number; yOff: number; speed?: number }
  ) {
    const { count, ballR, maxR, y, yScale, yOff } = opts;
    this.ballYScale = yScale;
    this.ballYOff = yOff;
    const geo = new THREE.SphereGeometry(ballR, 14, 12);
    const mat = new THREE.MeshToonMaterial({ gradientMap: toonGradient() });
    this.innerBalls = new THREE.InstancedMesh(geo, mat, count);
    const white = new THREE.Color(0xffffff);
    const cols = Object.values(LETTER_COLORS).map((c) => new THREE.Color(c).lerp(white, 0.2));
    for (let i = 0; i < count; i++) {
      const r = maxR * (0.32 + Math.random() * 0.64);
      this.innerData.push({
        p: new THREE.Vector3().randomDirection().multiplyScalar(r),
        axis: new THREE.Vector3().randomDirection(),
        speed: (opts.speed ?? 1) * (0.6 + Math.random() * 1.2),
        r,
      });
      this.innerBalls.setColorAt(i, cols[i % cols.length]);
    }
    if (this.innerBalls.instanceColor) this.innerBalls.instanceColor.needsUpdate = true;
    this.innerBalls.position.y = y;
    machine.add(this.innerBalls);
    // Outline shell: same matrices, slightly fatter sphere, backfaces in ink.
    this.innerOutline = new THREE.InstancedMesh(
      new THREE.SphereGeometry(ballR * 1.14, 14, 12),
      new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }),
      count
    );
    this.innerOutline.position.y = y;
    machine.add(this.innerOutline);
  }

  // --- variant 1: toon gumball globe ---------------------------------------
  private buildMachineGumball() {
    const machine = new THREE.Group();
    this.toonPodium(machine);

    // Chunky gumball body: dark green foot, qori-green tapered body, gold collar.
    const foot = outlined(new THREE.CylinderGeometry(1.0, 1.4, 0.5, 36), toon(PAL.machineGreenDark), 1.035, 1.2);
    foot.position.y = 0.5;
    machine.add(foot);
    const body = outlined(new THREE.CylinderGeometry(1.12, 1.34, 1.3, 36), toon(PAL.machineGreen), 1.035);
    body.position.y = 1.38;
    machine.add(body);

    // Dispensing hatch (cream) with a dark cartoon opening.
    const hatch = outlined(new THREE.BoxGeometry(0.66, 0.52, 0.16), toon(PAL.cream), 1.06);
    hatch.position.set(0, 1.12, 1.24);
    hatch.rotation.x = 0.06;
    machine.add(hatch);
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.26, 0.03), new THREE.MeshBasicMaterial({ color: INK }));
    slot.position.set(0, 1.1, 1.335);
    slot.rotation.x = 0.06;
    machine.add(slot);

    // Clover badge on the body's upper front.
    machine.add(cloverBadge(0.62, 0, 1.78, 1.26, -0.12));

    const collar = outlined(new THREE.CylinderGeometry(1.02, 1.18, 0.3, 36), toon(0xd8ab4e), 1.04, 1.25);
    collar.position.y = 2.1;
    machine.add(collar);

    // Toon glass globe + rim-shader outline + cartoon shine.
    const globeGeo = new THREE.SphereGeometry(1.3, 40, 28);
    this.dome = new THREE.Mesh(globeGeo, toonGlass(0.24));
    this.dome.position.y = 3.0;
    this.dome.renderOrder = 5;
    machine.add(this.dome);
    const rim = new THREE.Mesh(globeGeo, glassRimMat());
    rim.position.y = 3.0;
    rim.renderOrder = 6;
    machine.add(rim);
    machine.add(shineBlob(-0.62, 3.72, 0.92, 0.34, 0.52));
    machine.add(shineBlob(-0.34, 3.32, 1.13, 0.1, 0.14));

    // Gold exit port on top (drawn ball pops out through here).
    const port = outlined(new THREE.CylinderGeometry(0.26, 0.36, 0.32, 24), toon(PAL.gold), 1.07, 1.25);
    port.position.y = 4.28;
    machine.add(port);

    this.buildToonBalls(machine, { count: 26, ballR: 0.17, maxR: 1.0, y: 3.0, yScale: 0.72, yOff: -0.18 });
    this.scene.add(machine);
  }

  // --- variant 2: toon wire-cage lottery drum ------------------------------
  private buildMachineCage() {
    const machine = new THREE.Group();
    this.toonPodium(machine);

    // Green base bar + two tapered legs holding the drum axle.
    const bar = outlined(new THREE.BoxGeometry(3.5, 0.52, 1.05), toon(PAL.machineGreen), 1.03, 1.12);
    bar.position.y = 0.52;
    machine.add(bar);
    machine.add(cloverBadge(0.42, -0.95, 0.55, 0.56, 0));
    for (const s of [-1, 1]) {
      const leg = outlined(new THREE.CylinderGeometry(0.13, 0.2, 2.0, 20), toon(PAL.machineGreenDark), 1.09);
      leg.position.set(s * 1.42, 1.72, 0);
      leg.rotation.z = -s * 0.07;
      machine.add(leg);
      const hub = outlined(new THREE.CylinderGeometry(0.2, 0.2, 0.34, 18), toon(PAL.gold), 1.12);
      hub.rotation.z = Math.PI / 2;
      hub.position.set(s * 1.32, 2.65, 0);
      machine.add(hub);
    }

    // Hand crank on the right hub.
    const arm = outlined(new THREE.BoxGeometry(0.09, 0.5, 0.09), toon(PAL.gold), 1.2);
    arm.position.set(1.6, 2.45, 0);
    machine.add(arm);
    const knob = outlined(new THREE.SphereGeometry(0.11, 14, 12), toon(PAL.cream), 1.14);
    knob.position.set(1.6, 2.2, 0);
    machine.add(knob);

    // The spinning cage itself: hoops around the axle + meridian ribs.
    const cage = new THREE.Group();
    cage.position.y = 2.65;
    const cageGold = 0xd8ab4e;
    const hoops: [number, number][] = [[0, 1.14], [0.52, 1.0], [-0.52, 1.0], [0.9, 0.6], [-0.9, 0.6]];
    for (const [x, r] of hoops) {
      const hoop = outlinedTorus(r, 0.045, toon(cageGold));
      hoop.rotation.y = Math.PI / 2;
      hoop.position.x = x;
      cage.add(hoop);
    }
    for (let k = 0; k < 4; k++) {
      const rib = outlinedTorus(1.14, 0.038, toon(cageGold));
      rib.rotation.x = (k * Math.PI) / 4;
      cage.add(rib);
    }
    machine.add(cage);
    this.cageSpin = cage;

    // Short chute half-pipe from the drum down to a cream tray on the base.
    const chute = new THREE.Mesh(
      new THREE.CylinderGeometry(0.21, 0.24, 0.75, 16, 1, true, 0, Math.PI),
      new THREE.MeshToonMaterial({ color: cageGold, gradientMap: toonGradient(), side: THREE.DoubleSide })
    );
    chute.position.set(0.62, 1.28, 0.78);
    chute.rotation.set(-0.95, 0, 0.35);
    machine.add(chute);
    const tray = outlined(new THREE.CylinderGeometry(0.5, 0.6, 0.22, 26), toon(PAL.cream), 1.04, 1.35);
    tray.position.set(0.95, 0.62, 1.15);
    machine.add(tray);
    const restCols = [0x74a5f0, 0x4fc79f];
    for (let i = 0; i < 2; i++) {
      const rb = outlined(new THREE.SphereGeometry(0.15, 14, 12), toon(restCols[i]), 1.14);
      rb.position.set(0.95 + (i === 0 ? -0.15 : 0.17), 0.86, 1.13 + (i === 0 ? 0.07 : -0.06));
      machine.add(rb);
    }

    this.buildToonBalls(machine, { count: 24, ballR: 0.16, maxR: 0.82, y: 2.65, yScale: 0.85, yOff: 0 });
    this.scene.add(machine);
  }

  // --- variant 3: toon capsule blower --------------------------------------
  private buildMachineBlower() {
    const machine = new THREE.Group();
    this.toonPodium(machine);

    // Rounded green base pod with cream control panel + gold button.
    const pod = outlined(new THREE.CylinderGeometry(1.28, 1.5, 1.05, 40), toon(PAL.machineGreen), 1.03);
    pod.position.y = 0.78;
    machine.add(pod);
    const belt = new THREE.Mesh(new THREE.TorusGeometry(1.31, 0.06, 10, 48), toon(PAL.gold));
    belt.rotation.x = Math.PI / 2;
    belt.position.y = 1.28;
    machine.add(belt);
    const panel = outlined(new THREE.BoxGeometry(0.92, 0.44, 0.14), toon(PAL.cream), 1.06);
    panel.position.set(0, 0.72, 1.42);
    panel.rotation.x = -0.12;
    machine.add(panel);
    const button = outlined(new THREE.CylinderGeometry(0.11, 0.13, 0.09, 18), toon(PAL.gold), 1.15, 1.6);
    button.position.set(0.24, 0.74, 1.5);
    button.rotation.x = Math.PI / 2 - 0.12;
    machine.add(button);
    const lamp = outlined(new THREE.CylinderGeometry(0.07, 0.09, 0.08, 14), toon(0xf2c9cf), 1.18, 1.7);
    lamp.position.set(-0.24, 0.74, 1.5);
    lamp.rotation.x = Math.PI / 2 - 0.12;
    machine.add(lamp);
    machine.add(cloverBadge(0.44, 0, 1.06, 1.44, -0.1));

    // Neck ring where the tank seats.
    const neck = outlined(new THREE.CylinderGeometry(0.8, 1.05, 0.32, 32), toon(PAL.machineGreenDark), 1.045, 1.25);
    neck.position.y = 1.44;
    machine.add(neck);

    // Toon glass capsule tank + rim outline + shine.
    const tankGeo = new THREE.CapsuleGeometry(0.94, 0.95, 6, 28);
    this.dome = new THREE.Mesh(tankGeo, toonGlass(0.22));
    this.dome.position.y = 2.72;
    this.dome.renderOrder = 5;
    machine.add(this.dome);
    const rim = new THREE.Mesh(tankGeo, glassRimMat());
    rim.position.y = 2.72;
    rim.renderOrder = 6;
    machine.add(rim);
    machine.add(shineBlob(-0.46, 3.5, 0.68, 0.24, 0.62));
    machine.add(shineBlob(-0.26, 2.85, 0.82, 0.08, 0.12));

    // Gold collar + clear riser tube where the drawn ball rides up.
    const collar = outlined(new THREE.CylinderGeometry(0.3, 0.42, 0.26, 24), toon(PAL.gold), 1.08, 1.3);
    collar.position.y = 4.12;
    machine.add(collar);
    const tubeGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.85, 20, 1, true);
    const tube = new THREE.Mesh(tubeGeo, toonGlass(0.2));
    tube.position.y = 4.5;
    tube.renderOrder = 5;
    machine.add(tube);
    const tubeEdge = new THREE.Mesh(tubeGeo, glassRimMat());
    tubeEdge.position.y = 4.5;
    tubeEdge.renderOrder = 6;
    machine.add(tubeEdge);
    const tubeRim = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.05, 10, 24), toon(PAL.gold));
    tubeRim.rotation.x = Math.PI / 2;
    tubeRim.position.y = 4.94;
    machine.add(tubeRim);

    this.buildToonBalls(machine, { count: 30, ballR: 0.15, maxR: 0.68, y: 2.72, yScale: 0.62, yOff: -0.55, speed: 1.5 });
    this.scene.add(machine);
  }

  // -------------------------------------------------------------- confetti
  private buildConfetti() {
    const n = 80;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    this.confettiVel = new Float32Array(n);
    const palette = [new THREE.Color(0x9fdcc0), new THREE.Color(0xefd9a0), new THREE.Color(0xbcd7f0), new THREE.Color(0xf2c9cf)];
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 26;
      pos[i * 3 + 1] = Math.random() * 11;
      pos[i * 3 + 2] = -2 - Math.random() * 14;
      this.confettiVel[i] = 0.2 + Math.random() * 0.4;
      const c = palette[i % palette.length];
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this.confetti = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 0.08, vertexColors: true, transparent: true, opacity: 0.7, depthWrite: false })
    );
    this.scene.add(this.confetti);
  }

  /** Celebration burst (called on bingo). */
  celebrate() {
    if (this.burst) { this.scene.remove(this.burst); this.burst.geometry.dispose(); }
    const n = 320;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    this.burstVel = new Float32Array(n * 3);
    const palette = [new THREE.Color(0x10b981), new THREE.Color(0xf0d488), new THREE.Color(0xffffff), new THREE.Color(0xe4bd63), new THREE.Color(0xa8cdf0)];
    for (let i = 0; i < n; i++) {
      pos[i * 3] = 0; pos[i * 3 + 1] = 3.4; pos[i * 3 + 2] = 0.5;
      const dir = new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.4 + 0.4, (Math.random() - 0.2)).normalize();
      const sp = 3.5 + Math.random() * 5.5;
      this.burstVel[i * 3] = dir.x * sp;
      this.burstVel[i * 3 + 1] = dir.y * sp;
      this.burstVel[i * 3 + 2] = dir.z * sp;
      const c = palette[i % palette.length];
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this.burst = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 0.14, vertexColors: true, transparent: true, opacity: 1, depthWrite: false })
    );
    this.burstStart = this.clock.elapsedTime;
    this.scene.add(this.burst);
  }

  // ----------------------------------------------------------------- crowd
  /**
   * Seat layout: concentric grandstand arcs wrapping the back of the stage,
   * each row a little higher and further out (amphitheater). Deterministic -
   * no jitter, consistent spacing. Row 0 is closest to the machine.
   */
  private buildSeats(total: number): { seats: Seat[]; rows: number[] } {
    const seats: Seat[] = [];
    const rowCounts: number[] = [];
    // Full concentric rings AROUND the machine, leaving a wedge open toward the
    // camera (+z) so the bolillero is never blocked. Angle is measured from +z
    // (front): seats fill FRONT_GAP..(2PI - FRONT_GAP), i.e. the sides + back.
    // Seat 0 of each row sits at the front edge (nearest the camera) - that's
    // where "me" ends up (see setParticipants), on the front row.
    const FRONT_GAP = 0.8; // ~46 deg clear wedge toward the viewer
    const avail = Math.PI * 2 - FRONT_GAP * 2;
    let row = 0;
    while (seats.length < total) {
      const radius = 6.6 + row * 1.28;
      const y = 0.5 + row * 0.62;
      const spacing = row < 3 ? 1.55 : row < 5 ? 1.15 : 0.94;
      const step = spacing / radius;
      const capacity = Math.max(6, Math.floor(avail / step) + 1);
      const inRow = Math.min(capacity, total - seats.length);
      // Alternate front-right / front-left outward so the closest (best-ranked
      // + me) flank the front opening, then wrap around the back.
      for (let k = 0; k < inRow; k++) {
        const side = k % 2 === 0 ? 1 : -1;
        const idx = Math.floor(k / 2);
        const a = side * (FRONT_GAP + idx * step); // from +z, both ways around
        seats.push({ x: Math.sin(a) * radius, y, z: Math.cos(a) * radius, row });
      }
      rowCounts.push(inRow);
      row++;
    }
    return { seats, rows: rowCounts };
  }

  /** Pastel grandstand steps under the crowd so nobody floats. */
  private buildTiers(rowCount: number) {
    if (this.tierGroup) {
      this.scene.remove(this.tierGroup);
      this.tierGroup.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        if (m.material) (m.material as THREE.Material).dispose();
      });
    }
    const group = new THREE.Group();
    for (let row = 0; row < rowCount; row++) {
      const radius = 6.6 + row * 1.28;
      const topY = 0.5 + row * 0.62 - 0.5; // seat bottoms rest on this
      const even = row % 2 === 0;
      const topMat = new THREE.MeshStandardMaterial({
        color: even ? PAL.tierTopA : PAL.tierTopB,
        roughness: 0.88,
        metalness: 0.02,
      });
      const faceMat = new THREE.MeshStandardMaterial({
        color: even ? PAL.tierFaceA : PAL.tierFaceB,
        roughness: 0.88,
        metalness: 0.02,
      });
      // Full concentric step ring around the machine.
      const top = new THREE.Mesh(new THREE.RingGeometry(radius - 0.6, radius + 0.6, 72), topMat);
      top.rotation.x = -Math.PI / 2;
      top.position.y = topY;
      group.add(top);
      // Riser wall down to the previous step.
      const riserH = row === 0 ? topY : 0.6;
      const wall = new THREE.Mesh(
        new THREE.CylinderGeometry(radius - 0.6, radius - 0.6, riserH, 72, 1, true),
        faceMat
      );
      wall.position.y = topY - riserH / 2;
      group.add(wall);
    }
    this.scene.add(group);
    this.tierGroup = group;
  }

  /**
   * Build/rebuild the crowd. EVERY participant gets a seat. The best-ranked
   * (closest to bingo) + you take the front rows as full avatar chips; the
   * rest fill the back rows as simplified pastel head chips.
   */
  setParticipants(all: Participant[], meId: string) {
    this.meId = meId;
    const { seats, rows } = this.buildSeats(all.length);
    this.buildTiers(rows.length);

    // Near tier ends exactly on a row boundary so chip sizes stay uniform
    // within each row (full chips rows 0..4, head chips behind).
    let seatsInFront = 0;
    for (let r = 0; r < Math.min(5, rows.length); r++) seatsInFront += rows[r];
    const nearN = Math.min(seatsInFront, NEAR_COUNT, MAX_TILES, all.length);

    const sorted = [...all].sort((a, b) => b.marks - a.marks);
    let near = sorted.slice(0, nearN);
    let far = sorted.slice(nearN);
    // "Me" always sits front-and-center: seat 0 (front row, nearest the camera).
    const meNearIdx = near.findIndex((p) => p.userId === meId);
    if (meNearIdx > 0) {
      const [meP] = near.splice(meNearIdx, 1);
      near.unshift(meP);
    } else if (meNearIdx === -1) {
      const me = all.find((p) => p.userId === meId);
      if (me) {
        far = far.filter((p) => p.userId !== meId);
        if (near.length) far.unshift(near.pop()!);
        near.unshift(me);
      }
    }

    // ---- near tier: atlas billboards ------------------------------------
    // Rows 0-2 = full chips (avatar + name + BINGO progress). Rows 3-4 =
    // compact chips (avatar circle only) so mid rows stay quiet.
    this.atlas.assign(near);
    this.crowdSlots = near.map((p, i) => ({
      userId: p.userId,
      sig: progressSig(p),
      compact: seats[i].row > 2,
    }));
    near.forEach((p, i) => this.atlas.draw(p, p.userId === meId, seats[i].row > 2));

    this.crowdPositions = [];
    this.idOf.clear();
    const nOff = new Float32Array(near.length * 3);
    const nScale = new Float32Array(near.length);
    const nTile = new Float32Array(near.length * 2);
    const nPhase = new Float32Array(near.length);
    const nId = new Float32Array(near.length);
    for (let i = 0; i < near.length; i++) {
      const s = seats[i];
      const compact = s.row > 2;
      nOff[i * 3] = s.x;
      nOff[i * 3 + 1] = s.y + (compact ? 0.48 : 0.62); // chip center above seat
      nOff[i * 3 + 2] = s.z;
      nScale[i] = compact ? 0.82 : s.row === 0 ? 1.12 : s.row === 1 ? 1.04 : 0.98;
      const t = this.atlas.tileOf(near[i].userId)!;
      nTile[i * 2] = t.u;
      nTile[i * 2 + 1] = t.v;
      nPhase[i] = (hash32(near[i].userId) % 628) / 100;
      nId[i] = i;
      this.idOf.set(near[i].userId, { far: false, id: i });
      this.crowdPositions.push({ userId: near[i].userId, pos: new THREE.Vector3(nOff[i * 3], nOff[i * 3 + 1], nOff[i * 3 + 2]) });
    }

    if (this.crowdMesh) {
      this.scene.remove(this.crowdMesh);
      this.crowdMesh.geometry.dispose();
    }
    const plane = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = plane.index;
    geo.attributes.position = plane.attributes.position;
    geo.attributes.uv = plane.attributes.uv;
    geo.instanceCount = near.length;
    geo.setAttribute("iOffset", new THREE.InstancedBufferAttribute(nOff, 3));
    geo.setAttribute("iScale", new THREE.InstancedBufferAttribute(nScale, 1));
    geo.setAttribute("iTile", new THREE.InstancedBufferAttribute(nTile, 2));
    geo.setAttribute("iPhase", new THREE.InstancedBufferAttribute(nPhase, 1));
    geo.setAttribute("iId", new THREE.InstancedBufferAttribute(nId, 1));

    if (!this.crowdMat) {
      this.crowdMat = new THREE.ShaderMaterial({
        uniforms: {
          uMap: { value: this.atlas.texture },
          uTime: { value: 0 },
          uTiles: { value: 16 },
          uFogColor: { value: new THREE.Color(PAL.fog) },
          uHiId: { value: -1 },
          uHiActive: { value: 0 },
        },
        vertexShader: CROWD_VERT,
        fragmentShader: CROWD_FRAG,
        transparent: true,
        depthWrite: true,
      });
    }
    this.crowdMesh = new THREE.Mesh(geo, this.crowdMat);
    this.crowdMesh.frustumCulled = false;
    this.scene.add(this.crowdMesh);

    // ---- far tier: simplified pastel head chips -------------------------
    if (this.farMesh) {
      this.scene.remove(this.farMesh);
      this.farMesh.geometry.dispose();
    }
    if (far.length) {
      const fOff = new Float32Array(far.length * 3);
      const fScale = new Float32Array(far.length);
      const fCol = new Float32Array(far.length * 3);
      const fPhase = new Float32Array(far.length);
      const fId = new Float32Array(far.length);
      const col = new THREE.Color();
      for (let i = 0; i < far.length; i++) {
        const s = seats[near.length + i];
        fOff[i * 3] = s.x;
        fOff[i * 3 + 1] = s.y + 0.38;
        fOff[i * 3 + 2] = s.z;
        fScale[i] = 0.82;
        col.setHex(FAR_TINTS[hash32(far[i].userId) % FAR_TINTS.length]);
        fCol[i * 3] = col.r; fCol[i * 3 + 1] = col.g; fCol[i * 3 + 2] = col.b;
        fPhase[i] = (hash32(far[i].userId) % 628) / 100;
        fId[i] = i;
        this.idOf.set(far[i].userId, { far: true, id: i });
        this.crowdPositions.push({ userId: far[i].userId, pos: new THREE.Vector3(fOff[i * 3], fOff[i * 3 + 1], fOff[i * 3 + 2]) });
      }
      const fGeo = new THREE.InstancedBufferGeometry();
      fGeo.index = plane.index;
      fGeo.attributes.position = plane.attributes.position;
      fGeo.attributes.uv = plane.attributes.uv;
      fGeo.instanceCount = far.length;
      fGeo.setAttribute("iOffset", new THREE.InstancedBufferAttribute(fOff, 3));
      fGeo.setAttribute("iScale", new THREE.InstancedBufferAttribute(fScale, 1));
      fGeo.setAttribute("iColor", new THREE.InstancedBufferAttribute(fCol, 3));
      fGeo.setAttribute("iPhase", new THREE.InstancedBufferAttribute(fPhase, 1));
      fGeo.setAttribute("iId", new THREE.InstancedBufferAttribute(fId, 1));

      if (!this.farMat) {
        this.farMat = new THREE.ShaderMaterial({
          uniforms: {
            uMap: { value: makeHeadChipTexture() },
            uTime: { value: 0 },
            uFogColor: { value: new THREE.Color(PAL.fog) },
            uHiId: { value: -1 },
            uHiActive: { value: 0 },
          },
          vertexShader: FAR_VERT,
          fragmentShader: FAR_FRAG,
          transparent: true,
          depthWrite: true,
        });
      }
      this.farMesh = new THREE.Mesh(fGeo, this.farMat);
      this.farMesh.frustumCulled = false;
      this.scene.add(this.farMesh);
    }
  }

  /** Repaint only the tiles whose progress changed (cheap per ball). */
  updateProgress(all: Participant[]) {
    if (!this.crowdSlots.length) return;
    const byId = new Map(all.map((p) => [p.userId, p]));
    for (const slot of this.crowdSlots) {
      const p = byId.get(slot.userId);
      if (!p) continue;
      const sig = progressSig(p);
      if (sig !== slot.sig) {
        slot.sig = sig;
        this.atlas.draw(p, p.userId === this.meId, slot.compact);
      }
    }
  }

  // -------------------------------------------------------- hover + spotlight
  /** Dim every avatar except the highlighted one (spotlight). null clears it. */
  setHighlight(userId: string | null): void {
    const info = userId ? this.idOf.get(userId) : undefined;
    const active = userId ? 1 : 0;
    if (this.crowdMat) {
      this.crowdMat.uniforms.uHiActive.value = active;
      this.crowdMat.uniforms.uHiId.value = info && !info.far ? info.id : -1;
    }
    if (this.farMat) {
      this.farMat.uniforms.uHiActive.value = active;
      this.farMat.uniforms.uHiId.value = info && info.far ? info.id : -1;
    }
  }

  /** React callback for scene-avatar hover: (userId|null, clientX, clientY). */
  setHoverCallback(fn: (userId: string | null, x: number, y: number) => void): void {
    this.hoverCb = fn;
  }

  /** Project an avatar's world position to client pixels (null if behind cam). */
  worldToScreen(userId: string): { x: number; y: number } | null {
    const e = this.crowdPositions.find((c) => c.userId === userId);
    if (!e) return null;
    const v = e.pos.clone().project(this.camera);
    if (v.z > 1) return null;
    const rect = this.canvas.getBoundingClientRect();
    return { x: (v.x * 0.5 + 0.5) * rect.width + rect.left, y: (-v.y * 0.5 + 0.5) * rect.height + rect.top };
  }

  /** Nearest avatar to the pointer (screen space); notifies on change. */
  private pickHover(): void {
    if (!this.hoverCb) return;
    const rect = this.canvas.getBoundingClientRect();
    const px = this.pointerPx.x, py = this.pointerPx.y;
    let bestId: string | null = null;
    let bestD = 28; // px threshold
    const v = new THREE.Vector3();
    for (const c of this.crowdPositions) {
      v.copy(c.pos).project(this.camera);
      if (v.z > 1) continue;
      const sx = (v.x * 0.5 + 0.5) * rect.width + rect.left;
      const sy = (-v.y * 0.5 + 0.5) * rect.height + rect.top;
      const d = Math.hypot(sx - px, sy - py);
      if (d < bestD) { bestD = d; bestId = c.userId; }
    }
    if (bestId !== this.lastHoverId) {
      this.lastHoverId = bestId;
      if (bestId) {
        const s = this.worldToScreen(bestId);
        this.hoverCb(bestId, s?.x ?? px, s?.y ?? py);
      } else {
        this.hoverCb(null, 0, 0);
      }
    }
  }

  // ------------------------------------------------------------ ball flight
  /** Dispense a ball: agitate the dome, then fly it up toward the display. */
  drawBall(letter: BingoLetter, number: number) {
    this.agitate = 1;
    if (this.flyBall) {
      this.scene.remove(this.flyBall);
      disposeBallMesh(this.flyBall);
      this.flyBall = null;
    }

    // Ball texture: letter color with a white patch showing letter+number.
    const cv = document.createElement("canvas");
    cv.width = 256; cv.height = 128;
    const c = cv.getContext("2d")!;
    c.fillStyle = LETTER_COLORS[letter];
    c.fillRect(0, 0, 256, 128);
    c.fillStyle = "#ffffff";
    c.beginPath(); c.ellipse(128, 64, 52, 44, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#0f172a";
    c.textAlign = "center";
    c.font = "bold 30px system-ui, sans-serif";
    c.fillText(letter, 128, 56);
    c.font = "bold 34px system-ui, sans-serif";
    c.fillText(String(number), 128, 92);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;

    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 26, 20),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.25, metalness: 0.05 })
    );
    ball.position.set(0, 2.8, 0);
    if (MACHINE_VARIANT !== 0) {
      // Toon variants: ink outline shell travels with the drawn ball.
      const shell = new THREE.Mesh(
        new THREE.SphereGeometry(0.34 * 1.09, 26, 20),
        new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide })
      );
      ball.add(shell);
    }
    this.scene.add(ball);
    this.flyBall = ball;
    this.flyStart = this.clock.elapsedTime;
    this.flyCurve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 2.9, 0),
      new THREE.Vector3(0.5, 5.8, 1.4),
      new THREE.Vector3(0, 5.3, 3.4)
    );
  }

  // ------------------------------------------------------------------ loop
  private onResize = () => {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    const narrow = w < 640 || w < h;
    // Portrait: pull back + up and widen so machine + grandstand still fit.
    if (narrow) {
      this.camera.fov = 58;
      this.camBase.set(0.8, 7.6, 16.2);
      this.camLook.set(0, 2.2, 0);
    } else {
      this.camera.fov = 46;
      this.camBase.set(3.2, 6.6, 13.8);
      this.camLook.set(0, 2.2, 0);
    }
    this.camera.updateProjectionMatrix();
    // Reset the camera to its framing base (also the initial constructor call).
    // Resizes are rare, so snapping the orbit back here is acceptable.
    this.camera.position.copy(this.camBase);
    if (this.controls) {
      this.controls.target.copy(this.camLook);
      this.controls.update();
    }
  };

  private onPointer = (e: PointerEvent) => {
    this.pointer.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    // Avatar hover is MOUSE-ONLY: touch has no hover, and picking while
    // drag-orbiting on mobile would flicker the card/spotlight. Also require the
    // pointer be over the canvas (not a HUD panel on top).
    if (e.pointerType === "mouse" && e.target === this.canvas) {
      this.pointerPx.set(e.clientX, e.clientY);
      this.pickHover();
    } else if (this.lastHoverId !== null) {
      this.lastHoverId = null;
      this.hoverCb?.(null, 0, 0);
    }
  };

  private frame = () => {
    if (this.disposed) return;
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;

    // User-driven camera: OrbitControls (drag to orbit, wheel to zoom).
    this.controls.update();

    // Tumbling balls inside the dome (speed up while agitating).
    this.agitate = Math.max(0, this.agitate - dt * 0.45);
    const speedMul = 1 + this.agitate * 3.2;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (let i = 0; i < this.innerData.length; i++) {
      const d = this.innerData[i];
      q.setFromAxisAngle(d.axis, d.speed * speedMul * dt);
      d.p.applyQuaternion(q);
      const jitter = this.agitate * 0.05;
      m.setPosition(
        d.p.x + (Math.random() - 0.5) * jitter,
        d.p.y * this.ballYScale + this.ballYOff + (Math.random() - 0.5) * jitter,
        d.p.z + (Math.random() - 0.5) * jitter
      );
      this.innerBalls.setMatrixAt(i, m);
      if (this.innerOutline) this.innerOutline.setMatrixAt(i, m);
    }
    this.innerBalls.instanceMatrix.needsUpdate = true;
    if (this.innerOutline) this.innerOutline.instanceMatrix.needsUpdate = true;

    // Flying ball along its curve (1.35s), then a quick pop-out.
    if (this.flyBall && this.flyCurve) {
      const ft = (t - this.flyStart) / 1.35;
      if (ft <= 1) {
        const e = easeInOutCubic(Math.min(ft, 1));
        this.flyCurve.getPoint(e, this.flyBall.position);
        // Spins out fast as it's dispensed, then eases down so the number settles
        // readable by the time it hands off to the HUD reveal.
        const spin = 1 - Math.min(ft, 1); // 1 -> 0 across the flight
        const decel = spin * spin; // quadratic ease-out on the spin speed
        this.flyBall.rotation.y += dt * (17 * decel + 0.5);
        this.flyBall.rotation.x += dt * (7 * decel + 0.2);
        const s = 1 + e * 1.15;
        this.flyBall.scale.setScalar(s);
      } else if (ft <= 1.22) {
        // hand-off to the HUD reveal: scale out quickly
        const k = (ft - 1) / 0.22;
        this.flyBall.scale.setScalar(2.15 * (1 - easeInCubic(k)));
      } else {
        this.scene.remove(this.flyBall);
        disposeBallMesh(this.flyBall);
        this.flyBall = null;
        this.flyCurve = null;
      }
    }

    // Ambient confetti drifting down.
    const cp = this.confetti.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < this.confettiVel.length; i++) {
      let y = cp.getY(i) - this.confettiVel[i] * dt;
      if (y < 0.2) y = 10 + Math.random() * 2;
      cp.setY(i, y);
      cp.setX(i, cp.getX(i) + Math.sin(t * 0.8 + i) * dt * 0.2);
    }
    cp.needsUpdate = true;

    // Celebration burst physics.
    if (this.burst) {
      const bp = this.burst.geometry.attributes.position as THREE.BufferAttribute;
      const life = t - this.burstStart;
      for (let i = 0; i < bp.count; i++) {
        this.burstVel[i * 3 + 1] -= 6.5 * dt;
        bp.setXYZ(
          i,
          bp.getX(i) + this.burstVel[i * 3] * dt,
          bp.getY(i) + this.burstVel[i * 3 + 1] * dt,
          bp.getZ(i) + this.burstVel[i * 3 + 2] * dt
        );
      }
      bp.needsUpdate = true;
      (this.burst.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - life / 2.6);
      if (life > 2.8) {
        this.scene.remove(this.burst);
        this.burst.geometry.dispose();
        this.burst = null;
      }
    }

    if (this.crowdMat) this.crowdMat.uniforms.uTime.value = t;
    if (this.farMat) this.farMat.uniforms.uTime.value = t;
    if (MACHINE_VARIANT === 0 && this.dome) this.dome.rotation.y = t * 0.15;
    if (this.cageSpin) this.cageSpin.rotation.x -= dt * (0.6 + this.agitate * 2.6);

    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    this.disposed = true;
    this.controls.dispose();
    this.renderer.setAnimationLoop(null);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("pointermove", this.onPointer);
    this.atlas.dispose();
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      mats.forEach((mm) => mm.dispose());
    });
    this.renderer.dispose();
  }
}

// --- crowd shaders --------------------------------------------------------
const CROWD_VERT = /* glsl */ `
  attribute vec3 iOffset;
  attribute float iScale;
  attribute vec2 iTile;
  attribute float iPhase;
  attribute float iId;
  uniform float uTime;
  uniform float uTiles;
  uniform float uHiId;
  uniform float uHiActive;
  varying vec2 vUv;
  varying float vDepth;
  varying float vHi;
  void main() {
    vUv = uv / uTiles + iTile;
    vHi = (uHiActive < 0.5 || abs(iId - uHiId) < 0.5) ? 1.0 : 0.0;
    float bob = sin(uTime * 1.7 + iPhase) * 0.028;
    vec4 mv = modelViewMatrix * vec4(iOffset + vec3(0.0, bob, 0.0), 1.0);
    mv.xy += position.xy * iScale;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;
const CROWD_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uFogColor;
  varying vec2 vUv;
  varying float vDepth;
  varying float vHi;
  void main() {
    vec4 c = texture2D(uMap, vUv);
    if (c.a < 0.12) discard;
    float fogF = smoothstep(13.0, 34.0, vDepth) * 0.55;
    vec3 rgb = mix(c.rgb, uFogColor, fogF);
    float dim = (1.0 - vHi) * 0.66;         // fade the non-highlighted into the hall
    rgb = mix(rgb, uFogColor, dim);
    gl_FragColor = vec4(rgb, c.a * (1.0 - (1.0 - vHi) * 0.5));
  }
`;
const FAR_VERT = /* glsl */ `
  attribute vec3 iOffset;
  attribute float iScale;
  attribute vec3 iColor;
  attribute float iPhase;
  attribute float iId;
  uniform float uTime;
  uniform float uHiId;
  uniform float uHiActive;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vDepth;
  varying float vHi;
  void main() {
    vUv = uv;
    vColor = iColor;
    vHi = (uHiActive < 0.5 || abs(iId - uHiId) < 0.5) ? 1.0 : 0.0;
    float bob = sin(uTime * 1.7 + iPhase) * 0.02;
    vec4 mv = modelViewMatrix * vec4(iOffset + vec3(0.0, bob, 0.0), 1.0);
    mv.xy += position.xy * iScale;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;
const FAR_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uFogColor;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vDepth;
  varying float vHi;
  void main() {
    vec4 c = texture2D(uMap, vUv);
    if (c.a < 0.12) discard;
    float fogF = smoothstep(13.0, 34.0, vDepth) * 0.6;
    vec3 rgb = mix(c.rgb * vColor, uFogColor, fogF);
    float dim = (1.0 - vHi) * 0.66;
    rgb = mix(rgb, uFogColor, dim);
    gl_FragColor = vec4(rgb, c.a * (1.0 - (1.0 - vHi) * 0.5));
  }
`;

/**
 * Shared sprite for the far crowd: a simple "head + shoulders" chip in the
 * same circular language as the avatar tiles. Drawn white, tinted per
 * instance with a pastel color.
 */
function makeHeadChipTexture(): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = 64; cv.height = 64;
  const c = cv.getContext("2d")!;
  // shoulders
  c.fillStyle = "#f2f2f2";
  c.beginPath();
  c.ellipse(32, 54, 20, 13, 0, Math.PI, 0);
  c.fill();
  // head
  c.beginPath();
  c.arc(32, 26, 14, 0, Math.PI * 2);
  c.fillStyle = "#ffffff";
  c.fill();
  // soft rim so chips separate against the tiers
  c.strokeStyle = "rgba(90,110,100,0.35)";
  c.lineWidth = 2;
  c.beginPath();
  c.arc(32, 26, 14, 0, Math.PI * 2);
  c.stroke();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function progressSig(p: Participant): string {
  return p.bestLetters.join("") + "|" + p.marks + "|" + (p.avatarUrl ?? "");
}

function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
function easeInCubic(x: number): number {
  return x * x * x;
}

function disposeBallMesh(mesh: THREE.Mesh) {
  mesh.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.MeshStandardMaterial | undefined;
    if (mat) {
      mat.map?.dispose();
      mat.dispose();
    }
  });
}

// --- toon helpers (machine exploration) ------------------------------------
const INK = 0x35544a; // deep qori-green ink for cartoon outlines

let _grad: THREE.DataTexture | null = null;
/** 4-step gradient map shared by every MeshToonMaterial in the machine. */
function toonGradient(): THREE.DataTexture {
  if (_grad) return _grad;
  const data = new Uint8Array([115, 175, 220, 255]);
  _grad = new THREE.DataTexture(data, 4, 1, THREE.RedFormat);
  _grad.minFilter = THREE.NearestFilter;
  _grad.magFilter = THREE.NearestFilter;
  _grad.needsUpdate = true;
  return _grad;
}

function toon(color: number): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonGradient() });
}

/** Cartoon glass: pale mint, mostly transparent, cell-stepped shading. */
function toonGlass(opacity: number): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    color: 0xeafff6,
    gradientMap: toonGradient(),
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

/**
 * Silhouette rim for transparent shapes: fades ink in where the surface
 * normal turns away from the eye (inverted hulls would show through glass).
 */
function glassRimMat(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uInk: { value: new THREE.Color(INK) } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vE;
      void main() {
        vN = normalMatrix * normal;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vE = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uInk;
      varying vec3 vN; varying vec3 vE;
      void main() {
        float f = 1.0 - abs(dot(normalize(vN), normalize(vE)));
        float a = smoothstep(0.6, 0.78, f);
        gl_FragColor = vec4(uInk, a * 0.95);
      }
    `,
    transparent: true,
    depthWrite: false,
  });
}

/** Opaque mesh + inverted-hull ink outline (thickY lets flat discs read). */
function outlined(geo: THREE.BufferGeometry, mat: THREE.Material, thick = 1.045, thickY?: number): THREE.Group {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }));
  hull.scale.set(thick, thickY ?? thick, thick);
  g.add(hull);
  g.add(new THREE.Mesh(geo, mat));
  return g;
}

/** Torus + proper hull (fatter tube, same major radius) for cage bars. */
function outlinedTorus(r: number, tube: number, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.TorusGeometry(r, tube + 0.022, 8, 40), new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide })));
  g.add(new THREE.Mesh(new THREE.TorusGeometry(r, tube, 8, 40), mat));
  return g;
}

/** Classic cartoon glass shine: soft white blob stuck to the glass surface. */
function shineBlob(x: number, y: number, z: number, sx: number, sy: number): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(1, 14, 12),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false })
  );
  m.scale.set(sx, sy, 0.06);
  m.position.set(x, y, z);
  m.lookAt(x * 3, y + (y - 3) * 2, z * 3);
  m.renderOrder = 7;
  return m;
}

/** Cream badge with the qori clover embossed in green (brand mark). */
function cloverBadge(size: number, x: number, y: number, z: number, tiltX: number): THREE.Mesh {
  const cv = document.createElement("canvas");
  cv.width = 256; cv.height = 256;
  const c = cv.getContext("2d")!;
  c.fillStyle = "#f6f0df";
  c.beginPath(); c.arc(128, 128, 118, 0, Math.PI * 2); c.fill();
  c.lineWidth = 12;
  c.strokeStyle = "#e4bd63";
  c.beginPath(); c.arc(128, 128, 110, 0, Math.PI * 2); c.stroke();
  // Clover: same leaf path as src/lib/icons.ts, rotated 4x around the center.
  const leaf = new Path2D(
    "M12 12C10.9 10.3 8.1 9.6 8.1 6.9A2.75 2.75 0 0 1 12 4.6a2.75 2.75 0 0 1 3.9 2.3c0 2.7-2.8 3.4-3.9 5.1Z"
  );
  c.fillStyle = "#1f8f66";
  const s = 7.4;
  c.translate(128 - 12 * s, 128 - 12 * s);
  c.scale(s, s);
  c.translate(12, 12); c.rotate(Math.PI / 4); c.translate(-12, -12);
  for (let k = 0; k < 4; k++) {
    c.fill(leaf);
    c.translate(12, 12); c.rotate(Math.PI / 2); c.translate(-12, -12);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true })
  );
  mesh.position.set(x, y, z);
  mesh.rotation.x = tiltX;
  return mesh;
}

/** Quick capability check so the island can fall back to 2D gracefully. */
export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
