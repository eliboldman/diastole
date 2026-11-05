// The 3D avatar: a smooth mannequin in Diastole greens, built from code (no model files, so no art
// licensing). Browser-only: imported dynamically by the avatar components.
//
// Proportions come only from the athlete's own sliders (build, height). Readiness tints the areas
// that worked recently; the fitness aura grows with real milestones.
import * as THREE from "three";

import type { Look } from "./look";

export type Mood = "fresh" | "ok" | "tired" | null;
export type LoadAreas = Partial<Record<"legs" | "quads" | "shoulders" | "core", number>>;
export type SceneOpts = { look: Look; mood?: Mood; load?: LoadAreas; aura?: number; variant?: "full" | "bust"; blocks?: boolean };

const BODY = 0x2fa47c; // emerald mannequin
const BODY_FRESH = 0x34b386;
const GLOW = { ok: 0xfbbf24, tired: 0xf87171 } as const;

// ---------------------------------------------------------------- geometry helpers

/** A tapered capsule hanging down from the origin: radius r0 at the top, r1 at the bottom. */
function taper(r0: number, r1: number, len: number, seg = 24): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const a = -Math.PI / 2 + (i / steps) * (Math.PI / 2); // bottom cap: -90..0
    pts.push(new THREE.Vector2(Math.cos(a) * r1, -len + Math.sin(a) * r1));
  }
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * (Math.PI / 2); // top cap: 0..90
    pts.push(new THREE.Vector2(Math.cos(a) * r0, Math.sin(a) * r0));
  }
  return new THREE.LatheGeometry(pts, seg);
}

/** Torso from crotch to neck base: a smooth lathe, flattened front to back. */
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
  const g = new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    40,
  );
  g.scale(1, 1, 0.64);
  return g;
}

function box(w: number, h: number, d: number, yTop = true) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (yTop) g.translate(0, -h / 2, 0); // hang from the origin like taper()
  return g;
}

// ---------------------------------------------------------------- the figure

type Built = {
  root: THREE.Group;
  materials: Record<"base" | "legs" | "quads" | "shoulders" | "core", THREE.MeshStandardMaterial>;
  halos: THREE.Sprite[];
  shells: THREE.MeshBasicMaterial[];
  head: THREE.Group;
  sparkles: THREE.Group | null;
  orbit: THREE.Group | null;
};

function material(color: number, blocks: boolean) {
  return new THREE.MeshStandardMaterial({ color, roughness: blocks ? 0.7 : 0.42, metalness: 0.06, flatShading: blocks });
}

function buildFigure(o: SceneOpts): Built {
  const blocks = Boolean(o.blocks);
  const { build, height } = o.look;
  const base = o.mood === "fresh" ? BODY_FRESH : BODY;
  const mats = {
    base: material(base, blocks),
    legs: material(base, blocks),
    quads: material(base, blocks),
    shoulders: material(base, blocks),
    core: material(base, blocks),
  };
  const glow = o.mood === "ok" || o.mood === "tired" ? GLOW[o.mood] : null;
  if (glow && o.load) {
    for (const k of ["legs", "quads", "shoulders", "core"] as const) {
      const v = o.load[k] ?? 0;
      if (v > 0.05) mats[k].userData.glow = Math.min(1, v); // the green stays green; shells below do the glowing
    }
  }

  const mesh = (g: THREE.BufferGeometry, m: THREE.Material) => {
    const x = new THREE.Mesh(g, m);
    x.castShadow = false;
    return x;
  };
  const limb = (r0: number, r1: number, len: number, m: THREE.Material) =>
    blocks ? mesh(box(r0 * 2, len + r1, r0 * 1.7), m) : mesh(taper(r0, r1, len), m);
  const joint = (r: number, m: THREE.Material) => (blocks ? mesh(box(r * 2, r * 2, r * 2, false), m) : mesh(new THREE.SphereGeometry(r, 20, 14), m));

  const root = new THREE.Group();
  // Everything below the neck takes the athlete's sliders; the head keeps its size.
  const body = new THREE.Group();
  body.scale.set(build, height, build);
  root.add(body);

  // Torso
  body.add(blocks ? (() => {
    const t = new THREE.Group();
    const chest = mesh(box(0.34, 0.3, 0.2, false), mats.core);
    chest.position.y = 1.3;
    const waist = mesh(box(0.27, 0.18, 0.17, false), mats.core);
    waist.position.y = 1.1;
    const hips = mesh(box(0.3, 0.16, 0.18, false), mats.core);
    hips.position.y = 0.94;
    t.add(chest, waist, hips);
    return t;
  })() : mesh(torsoGeometry(), mats.core));

  // Neck
  const neck = blocks ? mesh(box(0.08, 0.1, 0.08, false), mats.base) : mesh(new THREE.CylinderGeometry(0.043, 0.05, 0.12, 20), mats.base);
  neck.position.y = 1.53;
  body.add(neck);

  // Arms: A-pose like a mannequin, slight bend at the elbow.
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.2, 1.4, 0);
    shoulder.rotation.z = side * 0.32;
    if (o.mood === "tired") shoulder.rotation.z = side * 0.24; // shoulders drop a little
    shoulder.add(joint(0.058, mats.shoulders));
    shoulder.add(limb(0.05, 0.039, 0.29, mats.shoulders));
    const elbow = new THREE.Group();
    elbow.position.y = -0.3;
    elbow.rotation.z = side * -0.1;
    elbow.rotation.x = -0.12;
    elbow.add(joint(0.04, mats.base));
    elbow.add(limb(0.039, 0.029, 0.26, mats.base));
    const hand = blocks ? mesh(box(0.05, 0.1, 0.03), mats.base) : mesh(taper(0.03, 0.022, 0.08), mats.base);
    hand.scale.z = blocks ? 1 : 0.55;
    hand.position.y = -0.27;
    elbow.add(hand);
    shoulder.add(elbow);
    body.add(shoulder);
  }

  // Legs
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.088, 0.92, 0);
    hip.rotation.z = side * 0.03;
    hip.add(limb(0.083, 0.056, 0.42, mats.quads));
    const knee = new THREE.Group();
    knee.position.y = -0.43;
    knee.add(joint(0.056, mats.quads));
    knee.add(limb(0.055, 0.036, 0.41, mats.legs));
    const foot = blocks ? mesh(box(0.08, 0.06, 0.2, false), mats.legs) : mesh(taper(0.036, 0.03, 0.17), mats.legs);
    if (!blocks) {
      foot.rotation.x = -Math.PI / 2 + 0.08;
      foot.scale.set(1.15, 1, 0.75);
    }
    foot.position.set(0, -0.44, 0.03);
    knee.add(foot);
    hip.add(knee);
    body.add(hip);
  }

  // Head: an egg on the neck, a little forward, mannequin style. Sits on top of the scaled body.
  const head = new THREE.Group();
  head.position.y = 1.59 * height;
  const skull = blocks ? mesh(box(0.2, 0.24, 0.21), mats.base) : mesh(new THREE.SphereGeometry(0.1, 32, 24), mats.base);
  if (blocks) skull.position.y = 0.2;
  else {
    // One smooth egg, narrower at the chin, tipped slightly forward.
    const p = (skull.geometry as THREE.BufferGeometry).attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const k = y < 0 ? 1 + y * 2.2 : 1; // taper the lower half toward the chin
      p.setX(i, p.getX(i) * k);
      p.setZ(i, p.getZ(i) * (y < 0 ? 1 + y * 1.2 : 1));
    }
    skull.geometry.computeVertexNormals();
    skull.scale.set(0.95, 1.25, 1.05);
    skull.position.set(0, 0.1, 0.012);
    skull.rotation.x = -0.08;
  }
  head.add(skull);
  if (o.mood === "tired") head.rotation.x = 0.16; // a tired head dips
  root.add(head);

  // Readiness glow, part 1: a see-through shell just outside each loaded limb (an outline of light).
  const halos: THREE.Sprite[] = [];
  const shells: THREE.MeshBasicMaterial[] = [];
  if (glow) {
    const targets: THREE.Mesh[] = [];
    root.traverse((x) => {
      const m = x as THREE.Mesh;
      if (m.isMesh && (m.material as THREE.MeshStandardMaterial).userData?.glow) targets.push(m);
    });
    for (const m of targets) {
      const v = (m.material as THREE.MeshStandardMaterial).userData.glow as number;
      const mat = new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.26 + v * 0.36, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false });
      mat.userData.base = mat.opacity;
      shells.push(mat);
      const shell = new THREE.Mesh(m.geometry, mat);
      // Grow around the limb's own center, not its origin (the torso's origin is at the floor).
      m.geometry.computeBoundingBox();
      const c = m.geometry.boundingBox!.getCenter(new THREE.Vector3());
      const k = 1.14;
      shell.scale.setScalar(k);
      shell.position.copy(c).multiplyScalar(1 - k);
      m.add(shell);
    }
  }
  // Part 2: soft light behind the body around those areas.
  if (glow && o.load) {
    const spots: Record<keyof LoadAreas, [number, number][]> = {
      legs: [[-0.09, 0.28], [0.09, 0.28]],
      quads: [[-0.09, 0.7], [0.09, 0.7]],
      shoulders: [[-0.21, 1.36], [0.21, 1.36]],
      core: [[0, 1.15]],
    };
    const tex = radialTexture(glow === GLOW.tired ? "#f87171" : "#fbbf24");
    for (const k of Object.keys(spots) as (keyof LoadAreas)[]) {
      const v = Math.min(1, o.load[k] ?? 0);
      if (v <= 0.05) continue;
      for (const [x, y] of spots[k]) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.3 + v * 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
        sp.position.set(x * build, y * height, -0.14); // behind the body: glows around the edges
        const size = k === "core" ? 0.62 : k === "shoulders" ? 0.4 : 0.46;
        sp.scale.set(size * build, (k === "legs" || k === "quads" ? size * 1.5 : size) * height, 1);
        sp.userData.base = sp.material.opacity;
        halos.push(sp);
        root.add(sp);
      }
    }
  }

  // Fresh: a few calm sparkles near the head.
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

  // Fitness aura: halo, then a ring at the feet, then orbiting specks; gold at the top level.
  let orbit: THREE.Group | null = null;
  const level = Math.max(0, Math.min(4, Math.round(o.aura ?? 0)));
  if (level > 0) {
    const gold = level >= 4;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(gold ? "#fde68a" : "#6ee7b7"), transparent: true, opacity: 0.18 + level * 0.07, depthWrite: false }));
    halo.scale.set(1.5 + level * 0.12, 2.3 + level * 0.12, 1);
    halo.position.set(0, 0.95 * height, -0.4);
    root.add(halo);
    if (level >= 2) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.42, 0.006, 8, 64),
        new THREE.MeshBasicMaterial({ color: gold ? 0xfbbf24 : 0x6ee7b7, transparent: true, opacity: 0.55 }),
      );
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

  // Soft contact shadow
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.34, 40),
    new THREE.MeshBasicMaterial({ map: radialTexture("#000000"), transparent: true, opacity: 0.45, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.002;
  shadow.scale.set(build, 1, 1);
  root.add(shadow);

  return { root, materials: mats, halos, shells, head, sparkles, orbit };
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
  const fill = new THREE.DirectionalLight(0x9cc7ff, 0.35);
  fill.position.set(-3, 1, 2);
  scene.add(key, rim, fill);
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

export type Stage = {
  render: (t: number, spin: number) => void;
  update: (o: SceneOpts) => void; // rebuild the figure in place (slider changes)
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
  const free = (root: THREE.Object3D) =>
    root.traverse((x) => {
      const m = x as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((y) => y.dispose());
      else mat?.dispose();
    });
  const stage: Stage = {
    animated: fig.shells.length > 0 || fig.halos.length > 0 || Boolean(fig.sparkles) || Boolean(fig.orbit),
    update(next) {
      scene.remove(fig.root);
      free(fig.root);
      fig = buildFigure(next);
      scene.add(fig.root);
      stage.animated = fig.shells.length > 0 || fig.halos.length > 0 || Boolean(fig.sparkles) || Boolean(fig.orbit);
      const aspect = cam.aspect;
      cam = camera(next.variant ?? "full", aspect, next.look.height);
    },
    render(t, spin) {
      fig.root.rotation.y = spin;
      const beat = 0.75 + 0.25 * Math.sin(t / 700);
      for (const m of fig.shells) m.opacity = m.userData.base * beat;
      for (const h of fig.halos) (h.material as THREE.SpriteMaterial).opacity = h.userData.base * beat;
      if (fig.sparkles) fig.sparkles.children.forEach((s, i) => ((s as THREE.Mesh).scale.setScalar(0.7 + 0.3 * Math.sin(t / 500 + i * 2))));
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
  const key = JSON.stringify([o.look, o.mood ?? null, o.load ?? null, o.aura ?? 0, o.variant ?? "full", Boolean(o.blocks), px]);
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
    fig.root.rotation.y = variant === "bust" ? 0.25 : 0.35;
    scene.add(fig.root);
    shared.renderer.render(scene, camera(variant, w / h, o.look.height));
    resolve(shared.canvas.toDataURL("image/png"));
    scene.traverse((x) => {
      const m = x as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | undefined;
      if (mat && !Array.isArray(mat)) mat.dispose();
    });
  });
  snaps.set(key, p);
  return p;
}
