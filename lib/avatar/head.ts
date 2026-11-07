// The avatar's head: the skull (face-shape tweaks, with the drawn face as its texture), hair and
// headwear, all built from simple shapes in code. The head never takes part in muscle shading.
import * as THREE from "three";

import { drawHeadTexture, faceColors, type FaceMood } from "./face";
import { GEAR_COLOR, HAIR_COLOR, hexOf, type Look } from "./look";

// ---------------------------------------------------------------- face textures (small cache)

const faces = new Map<string, THREE.CanvasTexture>();
function faceTexture(look: Look, mood: FaceMood, box: boolean) {
  const key = JSON.stringify([look, mood, box]);
  const hit = faces.get(key);
  if (hit) {
    faces.delete(key);
    faces.set(key, hit); // most recently used last
    return hit;
  }
  const c = document.createElement("canvas");
  c.width = box ? 256 : 1024;
  c.height = box ? 256 : 512;
  drawHeadTexture(c, look, mood, box);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  faces.set(key, t);
  // Editing makes a new texture per change: keep only the recent ones on the GPU.
  while (faces.size > 24) {
    const [k, old] = faces.entries().next().value as [string, THREE.CanvasTexture];
    faces.delete(k);
    old.dispose();
  }
  return t;
}

// ---------------------------------------------------------------- shapes

/** A dome over the top of the head: radius r, down to `reach` (0 top .. PI bottom), tipped back so the front sits higher. */
function dome(r: number, reach: number, tilt: number, mat: THREE.Material) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 36, 18, 0, Math.PI * 2, 0, reach), mat);
  m.rotation.x = -tilt;
  return m;
}
/** A shell around the sides and back, leaving the face open (`open` radians either side of the front). */
function shell(r: number, from: number, to: number, open: number, mat: THREE.Material) {
  // SphereGeometry's front (+z) is at phi = PI/2.
  return new THREE.Mesh(new THREE.SphereGeometry(r, 36, 18, Math.PI / 2 + open, Math.PI * 2 - open * 2, from, to - from), mat);
}
function ball(r: number, x: number, y: number, z: number, mat: THREE.Material, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  return m;
}
/** A point on the head's surface at a given angle from the top and around from the front. */
function onHead(r: number, fromTop: number, around: number) {
  return new THREE.Vector3(Math.sin(fromTop) * Math.sin(around), Math.cos(fromTop), Math.sin(fromTop) * Math.cos(around)).multiplyScalar(r);
}
function cone(r: number, h: number, at: THREE.Vector3, mat: THREE.Material) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 10), mat);
  m.position.copy(at);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), at.clone().normalize());
  return m;
}
function strand(r0: number, r1: number, len: number, at: THREE.Vector3, mat: THREE.Material, lean = 0) {
  const g = new THREE.CylinderGeometry(r0, r1, len, 10, 1);
  g.translate(0, -len / 2, 0);
  const m = new THREE.Mesh(g, mat);
  m.position.copy(at);
  m.rotation.x = lean;
  return m;
}

// ---------------------------------------------------------------- hair

type HairParts = { top: THREE.Object3D[]; hang: THREE.Object3D[] }; // headwear may hide the top; the hanging parts stay

function hair(look: Look, mat: THREE.Material): HairParts {
  const top: THREE.Object3D[] = [];
  const hang: THREE.Object3D[] = [];
  const cap = (r = 0.105, reach = Math.PI * 0.5, tilt = 0.32) => top.push(dome(r, reach, tilt, mat));
  switch (look.hair) {
    case "none":
      break;
    case "buzz":
      cap(0.1016, Math.PI * 0.5, 0.3);
      break;
    case "short":
      cap();
      break;
    case "sidepart":
      cap();
      top.push(ball(0.06, 0.035, 0.078, 0.045, mat, 1.2, 0.45, 1));
      break;
    case "quiff":
      cap();
      top.push(ball(0.05, 0, 0.09, 0.06, mat, 1.1, 0.75, 1));
      break;
    case "curly":
      cap(0.104);
      for (let i = 0; i < 34; i++) {
        const t = 0.15 + ((i * 0.618) % 1) * 1.2;
        const a = i * 2.4;
        const p = onHead(0.107, t, a);
        if (p.z > 0.04 && p.y < 0.06) continue; // keep the forehead clear
        top.push(ball(0.024, p.x, p.y, p.z, mat));
      }
      break;
    case "afro":
      // A big round volume set back behind the face, so the face stays in front of it.
      cap(0.104);
      top.push(ball(0.145, 0, 0.04, -0.058, mat, 1.1, 1, 1));
      break;
    case "bun":
      cap();
      top.push(ball(0.045, 0, 0.098, -0.065, mat));
      break;
    case "ponytail":
      cap();
      hang.push(ball(0.026, 0, 0.035, -0.1, mat));
      hang.push(strand(0.03, 0.012, 0.17, new THREE.Vector3(0, 0.03, -0.11), mat, 0.25));
      break;
    case "bob":
      cap();
      hang.push(shell(0.111, Math.PI * 0.25, Math.PI * 0.72, 0.95, mat));
      break;
    case "long":
      cap();
      hang.push(shell(0.112, Math.PI * 0.25, Math.PI * 0.95, 1.0, mat));
      {
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.2, 0.035, 3, 3, 1), mat);
        back.position.set(0, -0.12, -0.075);
        hang.push(back);
      }
      break;
    case "braids":
      cap();
      for (const s of [-1, 1]) for (let i = 0; i < 6; i++) hang.push(ball(0.022 - i * 0.0012, s * 0.085, -0.01 - i * 0.034, -0.035, mat));
      break;
    case "locs":
      cap(0.106);
      for (let i = 0; i < 11; i++) {
        const a = Math.PI * (0.38 + (i / 10) * 1.24); // sides and back
        const p = onHead(0.1, Math.PI * 0.5, a);
        hang.push(strand(0.011, 0.009, 0.15 + (i % 3) * 0.015, p, mat, (p.z < 0 ? 1 : -1) * 0.12));
      }
      break;
    case "mohawk":
      cap(0.1012, Math.PI * 0.42, 0.3);
      for (let i = 0; i < 7; i++) top.push(cone(0.016, 0.06, onHead(0.1, -0.55 + i * 0.27, 0), mat));
      break;
    case "spiky":
      cap();
      for (let i = 0; i < 16; i++) {
        const p = onHead(0.1, 0.25 + ((i * 0.618) % 1) * 0.85, i * 2.4);
        if (p.z > 0.05 && p.y < 0.07) continue;
        top.push(cone(0.02, 0.055, p, mat));
      }
      break;
  }
  return { top, hang };
}

// ---------------------------------------------------------------- headwear

function headwear(look: Look, mat: THREE.Material, dark: THREE.Material): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  const brim = (r: number, y: number, z: number) => {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.007, 32, 1, false, Math.PI / 2 + 0.15, Math.PI - 0.3), mat);
    b.rotation.y = Math.PI;
    b.position.set(0, y, z);
    b.rotation.x = 0.12;
    b.scale.set(1, 1, 1.1);
    return b;
  };
  switch (look.headwear) {
    case "none":
      break;
    case "cap":
      out.push(dome(0.109, Math.PI * 0.5, 0.12, mat), brim(0.085, 0.022, 0.07));
      out.push(ball(0.008, 0, 0.109, -0.008, mat));
      break;
    case "visor": {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.103, 0.01, 8, 48), mat);
      band.rotation.x = Math.PI / 2 - 0.12;
      band.position.y = 0.035;
      out.push(band, brim(0.085, 0.03, 0.07));
      break;
    }
    case "beanie": {
      out.push(dome(0.111, Math.PI * 0.5, 0.12, mat));
      const fold = new THREE.Mesh(new THREE.TorusGeometry(0.108, 0.013, 8, 48), mat);
      fold.rotation.x = Math.PI / 2 - 0.12;
      fold.position.y = 0.012;
      out.push(fold, ball(0.022, 0, 0.115, -0.012, mat));
      break;
    }
    case "headband": {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.102, 0.012, 8, 48), mat);
      band.rotation.x = Math.PI / 2 - 0.22;
      band.position.y = 0.058;
      out.push(band);
      break;
    }
    case "helmet": {
      const shellM = dome(0.124, Math.PI * 0.47, 0.18, mat);
      shellM.scale.set(1, 0.95, 1.15);
      out.push(shellM);
      for (const x of [-0.035, 0, 0.035]) {
        const v = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.01, 0.17), dark);
        v.position.set(x, 0.117, -0.01);
        v.rotation.x = 0.1;
        out.push(v);
      }
      break;
    }
    case "aero": {
      const shellM = dome(0.118, Math.PI * 0.5, 0.1, mat);
      out.push(shellM);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.2, 24), mat);
      tail.rotation.x = -Math.PI / 2 - 0.25;
      tail.position.set(0, 0.04, -0.15);
      out.push(tail);
      const shield = new THREE.Mesh(
        new THREE.SphereGeometry(0.113, 32, 8, Math.PI / 2 - 1.05, 2.1, Math.PI * 0.4, Math.PI * 0.17),
        new THREE.MeshStandardMaterial({ color: 0x2a3550, roughness: 0.15, metalness: 0.6, transparent: true, opacity: 0.85 }),
      );
      out.push(shield);
      break;
    }
    case "swimcap": {
      const m = dome(0.1045, Math.PI * 0.56, 0.24, mat);
      out.push(m);
      break;
    }
    case "wrap": {
      out.push(dome(0.113, Math.PI * 0.36, 0.05, mat));
      out.push(shell(0.113, Math.PI * 0.2, Math.PI * 0.98, 0.72, mat));
      const drape = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.095, 0.1, 32, 1, true), mat);
      drape.position.set(0, -0.12, -0.01);
      out.push(drape);
      break;
    }
  }
  return out;
}
// Headwear that covers the hair's top (anything sitting on the head); the wrap covers it all.
const COVERS_TOP = new Set(["cap", "beanie", "helmet", "aero", "swimcap", "wrap"]);

// ---------------------------------------------------------------- the head

const SHAPES: Record<Look["face"], { sx: number; sy: number; taperX: number; taperZ: number }> = {
  oval: { sx: 0.95, sy: 1.25, taperX: 2.2, taperZ: 1.2 },
  round: { sx: 1.0, sy: 1.17, taperX: 1.5, taperZ: 0.9 },
  long: { sx: 0.9, sy: 1.34, taperX: 2.0, taperZ: 1.1 },
  square: { sx: 0.99, sy: 1.22, taperX: 0.9, taperZ: 0.8 },
  heart: { sx: 0.98, sy: 1.24, taperX: 3.0, taperZ: 1.3 },
};

/**
 * Everything above the neck, in the head group's space (origin at the base of the skull).
 * Hair and headwear sit in the skull's own frame, so they follow the face shape.
 */
export function buildHead(look: Look, mood: FaceMood, blocks: boolean): THREE.Group {
  const head = new THREE.Group();
  const hairMat = new THREE.MeshStandardMaterial({ color: hexOf(HAIR_COLOR, look.hairColor), roughness: 0.85, flatShading: blocks });
  const gear = hexOf(GEAR_COLOR, look.headwearColor);
  const gearMat = new THREE.MeshStandardMaterial({ color: gear, roughness: look.headwear === "swimcap" ? 0.18 : 0.5, metalness: 0.05, flatShading: blocks });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x15181b, roughness: 0.6 });

  if (blocks) {
    // The Blocks theme: a box head with the face on its front, and boxy hair/headwear.
    const skin = new THREE.MeshStandardMaterial({ map: faceTexture(look, mood, true), roughness: 0.7, flatShading: true });
    const plain = new THREE.MeshStandardMaterial({ color: faceColors(look).skin, roughness: 0.7, flatShading: true });
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.24, 0.21), [plain, plain, plain, plain, skin, plain]);
    skull.position.y = 0.12;
    head.add(skull);
    const covered = look.headwear !== "none" && look.headwear !== "headband" && look.headwear !== "visor";
    if (look.hair !== "none" && !covered) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.215, 0.07, 0.225), hairMat);
      h.position.set(0, 0.225, -0.005);
      head.add(h);
      if (["long", "bob", "braids", "locs", "ponytail"].includes(look.hair)) {
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.215, look.hair === "bob" ? 0.14 : 0.24, 0.04), hairMat);
        back.position.set(0, look.hair === "bob" ? 0.15 : 0.1, -0.11);
        head.add(back);
      }
    }
    if (covered) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.225, 0.085, 0.23), gearMat);
      h.position.set(0, 0.235, -0.005);
      head.add(h);
      if (look.headwear === "cap") {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.08), gearMat);
        b.position.set(0, 0.2, 0.14);
        head.add(b);
      }
    } else if (look.headwear === "headband" || look.headwear === "visor") {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.212, 0.03, 0.222), gearMat);
      band.position.set(0, 0.2, 0);
      head.add(band);
    }
    return head;
  }

  const shape = SHAPES[look.face];
  const geo = new THREE.SphereGeometry(0.1, 48, 32);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y < 0) {
      p.setX(i, p.getX(i) * (1 + y * shape.taperX));
      p.setZ(i, p.getZ(i) * (1 + y * shape.taperZ));
    } else if (look.face === "heart") p.setX(i, p.getX(i) * (1 + y * 0.4));
    else if (look.face === "square") p.setX(i, p.getX(i) * (1 + Math.abs(p.getZ(i)) * -0.6));
  }
  geo.computeVertexNormals();
  const skull = new THREE.Group(); // the skull's frame: hair and headwear live in here too
  skull.scale.set(shape.sx, shape.sy, 1.05);
  skull.position.set(0, 0.1, 0.012);
  skull.rotation.x = -0.08;
  skull.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: faceTexture(look, mood, false), roughness: 0.55, metalness: 0.02 })));

  // Ears: small flattened spheres on the sides, so hair and glasses have something to sit against.
  const earMat = new THREE.MeshStandardMaterial({ color: faceColors(look).skin, roughness: 0.6 });
  for (const s of [-1, 1]) skull.add(ball(0.02, s * 0.098 * (shape.sx > 0.97 ? 0.98 : 1), 0.0, 0.0, earMat, 0.5, 1.1, 0.8));

  const h = hair(look, hairMat);
  const hw = headwear(look, gearMat, darkMat);
  const hideTop = COVERS_TOP.has(look.headwear);
  const hideAll = look.headwear === "wrap";
  if (!hideTop) h.top.forEach((o) => skull.add(o));
  if (!hideAll) h.hang.forEach((o) => skull.add(o));
  hw.forEach((o) => skull.add(o));
  head.add(skull);
  return head;
}
