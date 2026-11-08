// The 3D avatar: a smooth mannequin in Diastole greens, segmented into 18 muscle regions, built
// from code (no model files, so no art licensing). Browser-only: imported dynamically.
//
// Every triangle belongs to one region (or none: head, hands, feet), so worked muscles can be
// shaded per workout and tapped to edit. Proportions come only from the athlete's sliders.
import * as THREE from "three";

import { accentHex } from "@/lib/accent";
import type { Look } from "./look";
import { PAIN_COLOR, type Pain, type PainLevel, type Spot } from "./pain";
import { REGIONS, type Level, type Region, type Strain } from "./strain";

export type Mood = "fresh" | "ok" | "tired" | null;
export type SceneOpts = {
  look: Look;
  mood?: Mood;
  strain?: Strain; // muscles worked (a workout) or still recovering (the avatar)
  pain?: Pain; // sore spots (the check-in)
  mode?: "strain" | "pain"; // what the colors show (and what a tap picks)
  aura?: number;
  variant?: "full" | "bust";
  view?: "front" | "back"; // still images
  blocks?: boolean;
};

// ---------------------------------------------------------------- colors

const BASE = new THREE.Color(0x2fa47c);
// Each region a touch lighter or darker, so the segments read even when nothing is worked.
const REGION_SHADE: Record<Region, THREE.Color> = Object.fromEntries(
  REGIONS.map((r, i) => {
    const c = BASE.clone();
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    const offs = [0.035, -0.03, 0.015, -0.045, 0.045, -0.015, 0.025, -0.035];
    c.setHSL(hsl.h + ((i % 3) - 1) * 0.006, hsl.s, hsl.l + offs[i % offs.length]);
    return [r, c];
  }),
) as Record<Region, THREE.Color>;
export const STRAIN_COLOR: Record<Level, string> = { 1: "#fcd34d", 2: "#fb923c", 3: "#f87171" };
const STRAIN = { 1: new THREE.Color(STRAIN_COLOR[1]), 2: new THREE.Color(STRAIN_COLOR[2]), 3: new THREE.Color(STRAIN_COLOR[3]) } as const;
const UNSEG = BASE.clone().offsetHSL(0, -0.04, 0.02); // head, hands, feet
const PAIN = { 1: new THREE.Color(PAIN_COLOR[1]), 2: new THREE.Color(PAIN_COLOR[2]), 3: new THREE.Color(PAIN_COLOR[3]) } as const;
const MUTED = BASE.clone().offsetHSL(0, -0.12, -0.04); // pain mode: everything not marked recedes

// ---------------------------------------------------------------- geometry

/** A tapered capsule hanging down from the origin: radius r0 at the top, r1 at the bottom. */
function taper(r0: number, r1: number, len: number, seg = 32, rows = 10): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const caps = 8;
  for (let i = 0; i <= caps; i++) {
    const a = -Math.PI / 2 + (i / caps) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.cos(a) * r1, -len + Math.sin(a) * r1));
  }
  for (let i = 1; i < rows; i++) pts.push(new THREE.Vector2(r1 + (r0 - r1) * (i / rows), -len + len * (i / rows)));
  for (let i = 0; i <= caps; i++) {
    const a = (i / caps) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.cos(a) * r0, Math.sin(a) * r0));
  }
  return new THREE.LatheGeometry(pts, seg);
}

/** Torso from crotch to neck base: a smooth lathe (fine rows for clean region edges), flattened front to back. */
function torsoGeometry(): THREE.BufferGeometry {
  const profile: [number, number][] = [
    [0.0, 0.86],
    [0.07, 0.87],
    [0.135, 0.9],
    [0.16, 0.96],
    [0.148, 1.04],
    [0.13, 1.1],
    [0.14, 1.18],
    [0.165, 1.28],
    [0.172, 1.35],
    [0.155, 1.41],
    [0.1, 1.46],
    [0.055, 1.49],
    [0.0, 1.5],
  ];
  const curve = new THREE.CatmullRomCurve3(profile.map(([r, y]) => new THREE.Vector3(r, y, 0)));
  const pts = curve.getPoints(90).map((p) => new THREE.Vector2(Math.max(0, p.x), p.y));
  const g = new THREE.LatheGeometry(pts, 72);
  g.scale(1, 1, 0.64);
  return g;
}

function box(w: number, h: number, d: number, hang = true) {
  const g = new THREE.BoxGeometry(w, h, d, 4, 6, 3);
  if (hang) g.translate(0, -h / 2, 0); // hang from the origin like taper()
  return g;
}

// ---------------------------------------------------------------- regions

type Classify = (p: THREE.Vector3) => Region | null;
type ClassifySpot = (p: THREE.Vector3) => Spot | null;

// Sides: the figure faces the camera, so its left is at +x.
const sideOf = (side: number) => (side > 0 ? "l" : "r");
const torsoSpot: ClassifySpot = ({ x, y, z }) => {
  const front = z > 0.01;
  if (y > 1.46) return "neck";
  if (y > 1.21) return front ? "chest" : "upper_back";
  if (y > 1.0) return front ? "abs" : "lower_back";
  return `hip_${x > 0 ? "l" : "r"}`;
};
const upperArmSpot = (side: number): ClassifySpot => ({ y }) => (y > -0.15 ? `shoulder_${sideOf(side)}` : `elbow_${sideOf(side)}`);
const forearmSpot = (side: number): ClassifySpot => ({ y }) => (y > -0.12 ? `elbow_${sideOf(side)}` : `wrist_${sideOf(side)}`);
const thighSpot = (side: number): ClassifySpot => ({ x, y, z }) =>
  y > -0.05 ? `hip_${sideOf(side)}` : x * -side > 0.034 ? `groin_${sideOf(side)}` : z >= 0 ? `quad_${sideOf(side)}` : `hamstring_${sideOf(side)}`;
const shinSpot = (side: number): ClassifySpot => ({ y, z }) =>
  y > -0.06 ? `knee_${sideOf(side)}` : y < -0.34 ? `ankle_${sideOf(side)}` : z > 0.004 ? `shin_${sideOf(side)}` : `calf_${sideOf(side)}`;
const fixedSpot = (s: Spot | null): ClassifySpot => () => s;

const torsoRegion: Classify = ({ x, y, z }) => {
  const ax = Math.abs(x);
  const front = z > 0.01;
  if (y > 1.445) return "traps";
  if (y > 1.21) {
    if (front) return ax > 0.158 && y < 1.33 ? "lats" : "chest";
    return ax < 0.085 ? "upper_back" : y < 1.37 ? "lats" : "upper_back";
  }
  if (y > 1.0) {
    if (front) return ax < 0.07 ? "abs" : "obliques";
    return ax < 0.075 ? "lower_back" : y > 1.11 ? "lats" : "obliques";
  }
  return front ? "hip_flexors" : "glutes";
};
const armUpper: Classify = ({ z }) => (z >= 0 ? "biceps" : "triceps");
const thigh =
  (side: number): Classify =>
  ({ x, z }) =>
    x * -side > 0.034 ? "adductors" : z >= 0 ? "quads" : "hamstrings";
const kneeRegion: Classify = ({ z }) => (z >= 0 ? "quads" : "hamstrings");
const shin: Classify = ({ z }) => (z > 0.004 ? "shins" : "calves");
const neckRegion: Classify = ({ z }) => (z < 0 ? "traps" : null);
const always =
  (r: Region | null): Classify =>
  () =>
    r;

/** Make faces paintable: one region (and one pain spot) per triangle, by its center; colors per vertex. */
function segment(mesh: THREE.Mesh, classify: Classify, spotOf?: ClassifySpot) {
  const g = (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry) as THREE.BufferGeometry;
  g.computeVertexNormals();
  mesh.geometry = g;
  mesh.updateMatrix();
  const pos = g.attributes.position;
  const faces = pos.count / 3;
  const regions: (Region | null)[] = new Array(faces);
  const spots: (Spot | null)[] = new Array(faces);
  const c = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let f = 0; f < faces; f++) {
    c.set(0, 0, 0);
    for (let k = 0; k < 3; k++) c.add(v.fromBufferAttribute(pos, f * 3 + k));
    c.multiplyScalar(1 / 3).applyMatrix4(mesh.matrix); // into the parent's space (blocks boxes are offset)
    regions[f] = classify(c);
    spots[f] = spotOf ? spotOf(c) : null;
  }
  g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3));
  mesh.userData.faceRegions = regions;
  mesh.userData.faceSpots = spots;
}

type Paint = { mode: "strain" | "pain"; strain: Strain; pain: Pain };

function paint(meshes: THREE.Mesh[], p: Paint) {
  for (const m of meshes) {
    const regions = m.userData.faceRegions as (Region | null)[];
    const spots = m.userData.faceSpots as (Spot | null)[];
    const col = (m.geometry as THREE.BufferGeometry).attributes.color as THREE.BufferAttribute;
    for (let f = 0; f < regions.length; f++) {
      const r = regions[f];
      let color: THREE.Color;
      if (p.mode === "pain") {
        const s = spots[f];
        const lvl = s ? (p.pain[s] as PainLevel | undefined) : undefined;
        color = lvl ? PAIN[lvl] : MUTED;
      } else {
        const lvl = r ? p.strain[r] : undefined;
        color = lvl ? STRAIN[lvl] : r ? REGION_SHADE[r] : UNSEG;
      }
      for (let k = 0; k < 3; k++) col.setXYZ(f * 3 + k, color.r, color.g, color.b);
    }
    col.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- the figure

type Built = { root: THREE.Group; meshes: THREE.Mesh[]; sparkles: THREE.Group | null; orbit: THREE.Group | null };

function buildFigure(o: SceneOpts): Built {
  const blocks = Boolean(o.blocks);
  const { build, height } = o.look;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: blocks ? 0.7 : 0.42, metalness: 0.06, flatShading: blocks });
  const meshes: THREE.Mesh[] = [];
  // Position first (some regions depend on where the part sits), then segment.
  const part = (g: THREE.BufferGeometry, classify: Classify, at?: (m: THREE.Mesh) => void, spotOf?: ClassifySpot) => {
    const m = new THREE.Mesh(g, mat);
    at?.(m);
    segment(m, classify, spotOf);
    meshes.push(m);
    return m;
  };
  const limb = (r0: number, r1: number, len: number, classify: Classify, spotOf?: ClassifySpot) =>
    part(blocks ? box(r0 * 2, len + r1, r0 * 1.7) : taper(r0, r1, len), classify, undefined, spotOf);
  const joint = (r: number, classify: Classify, spotOf?: ClassifySpot) => part(blocks ? box(r * 2, r * 2, r * 2, false) : new THREE.SphereGeometry(r, 24, 16), classify, undefined, spotOf);

  const root = new THREE.Group();
  const body = new THREE.Group(); // everything below the neck takes the sliders; the head keeps its size
  body.scale.set(build, height, build);
  root.add(body);

  if (blocks) {
    for (const [w, h, d, y] of [
      [0.34, 0.3, 0.2, 1.3],
      [0.27, 0.18, 0.17, 1.1],
      [0.3, 0.16, 0.18, 0.94],
    ]) {
      body.add(part(box(w, h, d, false), torsoRegion, (m) => (m.position.y = y), torsoSpot));
    }
  } else body.add(part(torsoGeometry(), torsoRegion, undefined, torsoSpot));

  body.add(
    part(blocks ? box(0.08, 0.1, 0.08, false) : new THREE.CylinderGeometry(0.043, 0.05, 0.12, 24, 2), neckRegion, (m) => (m.position.y = 1.53), fixedSpot("neck")),
  );

  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.2, 1.4, 0);
    shoulder.rotation.z = side * (o.mood === "tired" ? 0.24 : 0.32);
    shoulder.add(joint(0.058, always("shoulders"), fixedSpot(`shoulder_${sideOf(side)}`)));
    shoulder.add(limb(0.05, 0.039, 0.29, armUpper, upperArmSpot(side)));
    const elbow = new THREE.Group();
    elbow.position.y = -0.3;
    elbow.rotation.z = side * -0.1;
    elbow.rotation.x = -0.12;
    elbow.add(joint(0.04, always("forearms"), fixedSpot(`elbow_${sideOf(side)}`)));
    elbow.add(limb(0.039, 0.029, 0.26, always("forearms"), forearmSpot(side)));
    elbow.add(
      part(blocks ? box(0.05, 0.1, 0.03) : taper(0.03, 0.022, 0.08, 16, 2), always(null), (m) => {
        m.scale.z = blocks ? 1 : 0.55;
        m.position.y = -0.27;
      }, fixedSpot(`wrist_${sideOf(side)}`)),
    );
    shoulder.add(elbow);
    body.add(shoulder);
  }

  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.088, 0.92, 0);
    hip.rotation.z = side * 0.03;
    hip.add(limb(0.083, 0.056, 0.42, thigh(side), thighSpot(side)));
    const knee = new THREE.Group();
    knee.position.y = -0.43;
    knee.add(joint(0.056, kneeRegion, fixedSpot(`knee_${sideOf(side)}`)));
    knee.add(limb(0.055, 0.036, 0.41, shin, shinSpot(side)));
    knee.add(
      part(blocks ? box(0.08, 0.06, 0.2, false) : taper(0.036, 0.03, 0.17, 16, 2), always(null), (m) => {
        if (!blocks) {
          m.rotation.x = -Math.PI / 2 + 0.08;
          m.scale.set(1.15, 1, 0.75);
        }
        m.position.set(0, -0.44, 0.03);
      }, fixedSpot(`foot_${sideOf(side)}`)),
    );
    hip.add(knee);
    body.add(hip);
  }

  // Head: one smooth egg, narrower at the chin, tipped slightly forward.
  const head = new THREE.Group();
  head.position.y = 1.59 * height;
  const skullGeo = blocks ? box(0.2, 0.24, 0.21, false) : new THREE.SphereGeometry(0.1, 32, 24);
  if (!blocks) {
    const p = skullGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y < 0) {
        p.setX(i, p.getX(i) * (1 + y * 2.2));
        p.setZ(i, p.getZ(i) * (1 + y * 1.2));
      }
    }
  }
  head.add(
    part(skullGeo, always(null), (m) => {
      if (blocks) m.position.y = 0.12;
      else {
        m.scale.set(0.95, 1.25, 1.05);
        m.position.set(0, 0.1, 0.012);
        m.rotation.x = -0.08;
      }
    }),
  );
  if (o.mood === "tired") head.rotation.x = 0.16;
  root.add(head);

  paint(meshes, { mode: o.mode ?? "strain", strain: o.strain ?? {}, pain: o.pain ?? {} });

  let sparkles: THREE.Group | null = null;
  if (o.mood === "fresh") {
    sparkles = new THREE.Group();
    const m = new THREE.MeshBasicMaterial({ color: 0xa7f3d0, transparent: true, opacity: 0.85 });
    for (const [x, y, z, s] of [
      [0.28, 1.86, 0.05, 1],
      [-0.3, 1.64, 0.1, 0.75],
      [0.34, 1.42, -0.05, 0.6],
    ]) {
      const p = new THREE.Mesh(new THREE.OctahedronGeometry(0.022 * s), m);
      p.position.set(x, y * height, z);
      sparkles.add(p);
    }
    root.add(sparkles);
  }

  let orbit: THREE.Group | null = null;
  const level = Math.max(0, Math.min(4, Math.round(o.aura ?? 0)));
  if (level > 0) {
    const gold = level >= 4;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(gold ? "#fde68a" : accentHex()), transparent: true, opacity: 0.18 + level * 0.07, depthWrite: false }));
    halo.scale.set(1.5 + level * 0.12, 2.3 + level * 0.12, 1);
    halo.position.set(0, 0.95 * height, -0.4);
    root.add(halo);
    if (level >= 2) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.006, 8, 64), new THREE.MeshBasicMaterial({ color: gold ? 0xfbbf24 : 0x6ee7b7, transparent: true, opacity: 0.55 }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.01;
      root.add(ring);
    }
    if (level >= 3) {
      orbit = new THREE.Group();
      const m = new THREE.MeshBasicMaterial({ color: gold ? 0xfde68a : 0xa7f3d0 });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const p = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), m);
        p.position.set(Math.cos(a) * 0.48, 0.3 + (i % 3) * 0.5 * height, Math.sin(a) * 0.48);
        orbit.add(p);
      }
      root.add(orbit);
    }
  }

  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.34, 40), new THREE.MeshBasicMaterial({ map: radialTexture("#000000"), transparent: true, opacity: 0.45, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.002;
  shadow.scale.set(build, 1, 1);
  root.add(shadow);

  return { root, meshes, sparkles, orbit };
}

const textures = new Map<string, THREE.Texture>();
function radialTexture(color: string) {
  let t = textures.get(color);
  if (t) return t;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, color);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  textures.set(color, t);
  return t;
}

// ---------------------------------------------------------------- scenes

function lights(scene: THREE.Scene) {
  scene.add(new THREE.HemisphereLight(0xd1fae5, 0x1d5a43, 1.15));
  const key = new THREE.DirectionalLight(0xffffff, 1.9);
  key.position.set(2, 3.2, 3);
  const rim = new THREE.DirectionalLight(0x6ee7b7, 1.6);
  rim.position.set(-2.4, 2.2, -3);
  const back = new THREE.DirectionalLight(0xffffff, 0.8); // so the back view isn't in shadow
  back.position.set(1.5, 2.5, -3);
  const fill = new THREE.DirectionalLight(0x9cc7ff, 0.35);
  fill.position.set(-3, 1, 2);
  scene.add(key, rim, back, fill);
}

function camera(variant: "full" | "bust", aspect: number, height: number) {
  if (variant === "bust") {
    const c = new THREE.PerspectiveCamera(28, aspect, 0.1, 20);
    c.position.set(0, 1.62 * height, 1.12);
    c.lookAt(0, 1.58 * height, 0);
    return c;
  }
  const c = new THREE.PerspectiveCamera(24, aspect, 0.1, 20);
  c.position.set(0, 1.05, 5.6);
  c.lookAt(0, 0.93 * height, 0);
  return c;
}

function free(root: THREE.Object3D) {
  root.traverse((x) => {
    const m = x as THREE.Mesh;
    m.geometry?.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((y) => y.dispose());
    else mat?.dispose();
  });
}

export type Stage = {
  render: (t: number, spin: number) => void;
  update: (o: SceneOpts) => void; // rebuild in place (slider changes)
  setPaint: (p: { mode?: "strain" | "pain"; strain?: Strain; pain?: Pain }) => void; // repaint only (taps)
  pick: (x: number, y: number) => { region: Region | null; spot: Spot | null } | null; // canvas pixel -> what's under it
  resize: (w: number, h: number) => void;
  dispose: () => void;
  animated: boolean;
};

/** A live, rotatable avatar drawing into the given canvas. */
export function createStage(canvas: HTMLCanvasElement, o: SceneOpts): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  lights(scene);
  let fig = buildFigure(o);
  scene.add(fig.root);
  let cam = camera(o.variant ?? "full", canvas.clientWidth / Math.max(1, canvas.clientHeight), o.look.height);
  const ray = new THREE.Raycaster();
  const stage: Stage = {
    animated: Boolean(fig.sparkles) || Boolean(fig.orbit),
    update(next) {
      scene.remove(fig.root);
      free(fig.root);
      fig = buildFigure(next);
      scene.add(fig.root);
      stage.animated = Boolean(fig.sparkles) || Boolean(fig.orbit);
      cam = camera(next.variant ?? "full", cam.aspect, next.look.height);
    },
    setPaint(p) {
      paint(fig.meshes, { mode: p.mode ?? "strain", strain: p.strain ?? {}, pain: p.pain ?? {} });
    },
    pick(x, y) {
      const r = canvas.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2((x / r.width) * 2 - 1, -(y / r.height) * 2 + 1), cam);
      fig.root.updateMatrixWorld(true);
      const hit = ray.intersectObjects(fig.meshes, false)[0];
      if (!hit || hit.faceIndex == null) return null;
      return {
        region: (hit.object.userData.faceRegions as (Region | null)[])[hit.faceIndex] ?? null,
        spot: (hit.object.userData.faceSpots as (Spot | null)[])[hit.faceIndex] ?? null,
      };
    },
    render(t, spin) {
      fig.root.rotation.y = spin;
      if (fig.sparkles) fig.sparkles.children.forEach((s, i) => (s as THREE.Mesh).scale.setScalar(0.7 + 0.3 * Math.sin(t / 500 + i * 2)));
      if (fig.orbit) fig.orbit.rotation.y = t / 6000;
      renderer.render(scene, cam);
    },
    resize(w, h) {
      renderer.setSize(w, h, false);
      cam.aspect = w / Math.max(1, h);
      cam.updateProjectionMatrix();
    },
    dispose() {
      free(scene);
      renderer.dispose();
    },
  };
  return stage;
}

// ---------------------------------------------------------------- still snapshots for small spots
// One shared offscreen renderer draws every small avatar into an image, so a feed full of avatars
// never opens dozens of WebGL contexts.

let shared: { renderer: THREE.WebGLRenderer; canvas: HTMLCanvasElement } | null = null;
const snaps = new Map<string, Promise<string>>();

export function snapshot(o: SceneOpts, px = 192): Promise<string> {
  const key = JSON.stringify([o.look, o.mood ?? null, o.strain ?? null, o.pain ?? null, o.mode ?? "strain", o.aura ?? 0, o.variant ?? "full", o.view ?? null, Boolean(o.blocks), px]);
  const hit = snaps.get(key);
  if (hit) return hit;
  const p = new Promise<string>((resolve) => {
    if (!shared) {
      const canvas = document.createElement("canvas");
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: "low-power" });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      shared = { renderer, canvas };
    }
    const variant = o.variant ?? "full";
    const w = px;
    const h = variant === "bust" ? px : Math.round(px * 1.6);
    shared.renderer.setPixelRatio(1);
    shared.renderer.setSize(w, h, false);
    const scene = new THREE.Scene();
    lights(scene);
    const fig = buildFigure(o);
    fig.root.rotation.y = o.view === "back" ? Math.PI : o.view === "front" ? 0 : variant === "bust" ? 0.25 : 0.35;
    scene.add(fig.root);
    shared.renderer.render(scene, camera(variant, w / h, o.look.height));
    resolve(shared.canvas.toDataURL("image/png"));
    free(fig.root);
  });
  snaps.set(key, p);
  return p;
}
