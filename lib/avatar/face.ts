// The avatar's face, drawn in 2D: onto the head's texture (3D) and into the editor's picker tiles.
// Original line art, no outside assets. Face units: x -1..1 left to right, y up; eyes near y 0.18.
import { EYE_COLOR, GEAR_COLOR, HAIR_COLOR, SKIN, hexOf, type Look } from "./look";

export type FaceMood = "fresh" | "ok" | "tired" | null;
/** Where face space lands on the canvas: centre, pixels per unit, and vertical squash (the head is taller than wide). */
export type Frame = { cx: number; cy: number; s: number; ky: number };

const INK = "#1f1714";

// ---------------------------------------------------------------- color helpers

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(k >= 1 ? c + (255 - c) * (k - 1) : c * k)));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
const lum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
};
/** Seeded randomness so freckles and stubble don't jump around between redraws. */
function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ---------------------------------------------------------------- the face

export type FaceColors = { skin: string; hair: string; eye: string; gear: string };

export function faceColors(look: Look): FaceColors {
  return { skin: hexOf(SKIN, look.skin), hair: hexOf(HAIR_COLOR, look.hairColor), eye: hexOf(EYE_COLOR, look.eyeColor), gear: hexOf(GEAR_COLOR, look.glassesColor) };
}

/** Lay out the features (in face units) from the look's sliders. */
function layout(look: Look) {
  const eyeY = 0.18 + look.eyeY * 0.1;
  return {
    eyeX: 0.3 * look.eyeGap,
    eyeY,
    eyeR: 0.1 * look.eyeSize,
    browY: eyeY + 0.17 * Math.max(0.85, look.eyeSize) + look.browY * 0.07,
    noseY: -0.13,
    noseK: look.noseSize,
    mouthY: -0.44 + look.mouthY * 0.08,
    mouthK: look.mouthSize,
  };
}

/**
 * Draw the whole face. `wrap` is true on the head texture, where the canvas wraps all the way round
 * (goggle straps go round the back); false for flat tiles.
 */
export function drawFace(g: CanvasRenderingContext2D, look: Look, mood: FaceMood, f: Frame, wrap = false) {
  const c = faceColors(look);
  const L = layout(look);
  g.save();
  g.translate(f.cx, f.cy);
  g.scale(f.s, -f.s * f.ky);
  g.lineCap = "round";
  g.lineJoin = "round";

  marks(g, look, c);
  facialHair(g, look, c, L);
  nose(g, look, c, L);
  mouth(g, look, c, L, mood);
  for (const side of [-1, 1]) eye(g, look, c, side * L.eyeX, L.eyeY, L.eyeR, side, mood);
  for (const side of [-1, 1]) brow(g, look, c, side * L.eyeX, L.browY, side);
  glasses(g, look, c, L, f, wrap);
  g.restore();
}

function marks(g: CanvasRenderingContext2D, look: Look, c: FaceColors) {
  if (look.marks === "blush" || look.marks === "both") {
    for (const side of [-1, 1]) {
      const grad = g.createRadialGradient(side * 0.46, -0.2, 0, side * 0.46, -0.2, 0.17);
      grad.addColorStop(0, "rgba(240,110,120,0.45)");
      grad.addColorStop(1, "rgba(240,110,120,0)");
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(side * 0.46, -0.2, 0.2, 0.15, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  if (look.marks === "freckles" || look.marks === "both") {
    const r = seeded(7);
    g.fillStyle = shade(c.skin, lum(c.skin) > 0.5 ? 0.72 : 0.6);
    for (let i = 0; i < 26; i++) {
      const side = i % 2 ? 1 : -1;
      const x = side * (0.12 + r() * 0.36);
      const y = -0.08 - r() * 0.16 + (Math.abs(x) < 0.2 ? 0.06 : 0);
      g.beginPath();
      g.arc(x, y, 0.009 + r() * 0.008, 0, Math.PI * 2);
      g.fill();
    }
  }
}

function eye(g: CanvasRenderingContext2D, look: Look, c: FaceColors, x: number, y: number, r: number, side: number, mood: FaceMood) {
  const style = look.eyes;
  const sparkle = () => {
    g.fillStyle = "rgba(255,255,255,0.95)";
    g.beginPath();
    g.arc(x - r * 0.22, y + r * 0.25, r * 0.17, 0, Math.PI * 2);
    g.fill();
    if (mood === "fresh") {
      g.beginPath();
      g.arc(x + r * 0.2, y - r * 0.18, r * 0.08, 0, Math.PI * 2);
      g.fill();
    }
  };
  const iris = (ir: number, h = 1) => {
    g.fillStyle = c.eye;
    g.beginPath();
    g.ellipse(x, y - r * 0.05, ir, ir * h, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = INK;
    g.beginPath();
    g.ellipse(x, y - r * 0.05, ir * 0.48, ir * 0.48 * h, 0, 0, Math.PI * 2);
    g.fill();
  };
  const white = (w: number, h: number, almond = false) => {
    g.beginPath();
    if (almond) {
      g.moveTo(x - w, y);
      g.quadraticCurveTo(x, y + h * 2, x + w, y);
      g.quadraticCurveTo(x, y - h * 1.6, x - w, y);
    } else g.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
    g.closePath();
  };
  const sclera = (w: number, h: number, almond = false, irisR = r * 0.62) => {
    white(w, h, almond);
    g.fillStyle = "#fbfaf7";
    g.fill();
    g.save();
    white(w, h, almond);
    g.clip();
    iris(irisR);
    g.restore();
    white(w, h, almond);
    g.strokeStyle = INK;
    g.lineWidth = 0.018;
    g.stroke();
    sparkle();
  };
  // Heavy lids: the "sleepy" style always, and any open eye when today's readiness says tired.
  const lid = (amount: number, w: number, h: number) => {
    g.save();
    white(w * 1.08, h * 1.08);
    g.clip();
    g.fillStyle = shade(c.skin, 0.93);
    g.fillRect(x - w * 1.2, y + h * 1.2 - h * 2.4 * amount, w * 2.4, h * 2.4 * amount);
    g.restore();
    g.strokeStyle = INK;
    g.lineWidth = 0.02;
    g.beginPath();
    g.moveTo(x - w, y + h - h * 2 * amount + h * 0.15);
    g.quadraticCurveTo(x, y + h - h * 2 * amount - h * 0.05, x + w, y + h - h * 2 * amount + h * 0.15);
    g.stroke();
  };

  switch (style) {
    case "dot":
      g.fillStyle = INK;
      g.beginPath();
      g.ellipse(x, y, r * 0.5, r * 0.72, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "rgba(255,255,255,0.9)";
      g.beginPath();
      g.arc(x - r * 0.15, y + r * 0.25, r * 0.15, 0, Math.PI * 2);
      g.fill();
      if (mood === "tired") {
        g.strokeStyle = INK;
        g.lineWidth = 0.022;
        g.beginPath();
        g.moveTo(x - r * 0.75, y + r * 0.55);
        g.lineTo(x + r * 0.75, y + r * 0.45);
        g.stroke();
      }
      return;
    case "happy":
      g.strokeStyle = INK;
      g.lineWidth = 0.035;
      g.beginPath();
      g.moveTo(x - r, y - r * 0.2);
      g.quadraticCurveTo(x, y + r * 1.1, x + r, y - r * 0.2);
      g.stroke();
      return;
    case "round":
      sclera(r, r * 1.1);
      break;
    case "wide":
      sclera(r * 1.18, r * 1.25, false, r * 0.55);
      break;
    case "almond":
      sclera(r * 1.15, r * 0.62, true, r * 0.55);
      g.strokeStyle = INK;
      g.lineWidth = 0.03;
      g.beginPath();
      g.moveTo(x - r * 1.15, y);
      g.quadraticCurveTo(x, y + r * 1.24, x + r * 1.15, y);
      g.stroke();
      break;
    case "narrow":
      sclera(r * 1.15, r * 0.42, true, r * 0.45);
      break;
    case "lashes":
      sclera(r, r * 1.1);
      g.strokeStyle = INK;
      g.lineWidth = 0.02;
      // Three short lashes on the outer top edge.
      for (const deg of [25, 50, 75]) {
        const a = ((side > 0 ? deg : 180 - deg) * Math.PI) / 180;
        const sx = x + Math.cos(a) * r;
        const sy = y + Math.sin(a) * r * 1.1;
        g.beginPath();
        g.moveTo(sx, sy);
        g.lineTo(sx + Math.cos(a) * r * 0.4, sy + Math.sin(a) * r * 0.4);
        g.stroke();
      }
      break;
    case "sleepy":
      sclera(r, r * 1.0);
      lid(0.5, r, r);
      return;
  }
  if (mood === "tired" && style !== "narrow") lid(0.4, style === "almond" ? r * 1.15 : r, style === "almond" ? r * 0.7 : r * 1.1);
}

function brow(g: CanvasRenderingContext2D, look: Look, c: FaceColors, x: number, y: number, side: number) {
  if (look.brows === "none") return;
  g.strokeStyle = shade(c.hair, lum(c.hair) > 0.6 ? 0.75 : 0.95);
  const w = 0.13;
  const inner = x - side * w; // toward the nose
  const outer = x + side * w;
  g.beginPath();
  switch (look.brows) {
    case "thin":
      g.lineWidth = 0.022;
      g.moveTo(inner, y);
      g.quadraticCurveTo(x, y + 0.05, outer, y - 0.01);
      break;
    case "straight":
      g.lineWidth = 0.04;
      g.moveTo(inner, y + 0.005);
      g.lineTo(outer, y + 0.005);
      break;
    case "arched":
      g.lineWidth = 0.032;
      g.moveTo(inner, y - 0.01);
      g.quadraticCurveTo(x + side * 0.02, y + 0.09, outer, y - 0.03);
      break;
    case "thick":
      g.lineWidth = 0.065;
      g.moveTo(inner, y);
      g.quadraticCurveTo(x, y + 0.035, outer, y - 0.005);
      break;
    case "angled":
      g.lineWidth = 0.05;
      g.moveTo(inner, y - 0.035);
      g.lineTo(outer, y + 0.03);
      break;
    case "bushy":
      g.lineWidth = 0.075;
      g.moveTo(inner, y);
      g.quadraticCurveTo(x, y + 0.045, outer, y);
      g.stroke();
      g.lineWidth = 0.02;
      for (let i = 0; i <= 5; i++) {
        const px = inner + (outer - inner) * (i / 5);
        g.moveTo(px, y + 0.035);
        g.lineTo(px + side * 0.015, y + 0.06);
      }
      break;
  }
  g.stroke();
}

function nose(g: CanvasRenderingContext2D, look: Look, c: FaceColors, L: ReturnType<typeof layout>) {
  const k = L.noseK;
  const y = L.noseY;
  const line = lum(c.skin) > 0.3 ? shade(c.skin, lum(c.skin) > 0.5 ? 0.7 : 0.62) : shade(c.skin, 1.45);
  g.strokeStyle = line;
  g.fillStyle = line;
  g.lineWidth = 0.022;
  switch (look.nose) {
    case "none":
      return;
    case "dot":
      g.beginPath();
      g.ellipse(0, y, 0.035 * k, 0.025 * k, 0, 0, Math.PI * 2);
      g.fill();
      return;
    case "button": {
      const grad = g.createRadialGradient(0, y - 0.01 * k, 0, 0, y - 0.01 * k, 0.09 * k);
      grad.addColorStop(0, `${line}66`);
      grad.addColorStop(1, `${line}00`);
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(0, y, 0.09 * k, 0.07 * k, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = line;
      for (const s of [-1, 1]) {
        g.beginPath();
        g.ellipse(s * 0.032 * k, y - 0.03 * k, 0.016 * k, 0.011 * k, 0, 0, Math.PI * 2);
        g.fill();
      }
      return;
    }
    case "line":
      g.beginPath();
      g.moveTo(0.015 * k, y + 0.12 * k);
      g.quadraticCurveTo(0.04 * k, y - 0.02 * k, 0, y - 0.04 * k);
      g.lineTo(-0.04 * k, y - 0.03 * k);
      g.stroke();
      return;
    case "wide":
      g.beginPath();
      g.moveTo(-0.07 * k, y);
      g.quadraticCurveTo(-0.075 * k, y - 0.05 * k, -0.03 * k, y - 0.045 * k);
      g.quadraticCurveTo(0, y - 0.06 * k, 0.03 * k, y - 0.045 * k);
      g.quadraticCurveTo(0.075 * k, y - 0.05 * k, 0.07 * k, y);
      g.stroke();
      return;
    case "pointed":
      g.beginPath();
      g.moveTo(0, y + 0.12 * k);
      g.lineTo(0.05 * k, y - 0.04 * k);
      g.lineTo(-0.01 * k, y - 0.045 * k);
      g.stroke();
      return;
  }
}

function mouth(g: CanvasRenderingContext2D, look: Look, c: FaceColors, L: ReturnType<typeof layout>, mood: FaceMood) {
  const k = L.mouthK;
  const y = L.mouthY;
  const w = 0.17 * k;
  // Dark lines vanish on the deepest skin tones: those get a warm mid-tone instead.
  const lip = lum(c.skin) > 0.45 ? "#7a3a35" : lum(c.skin) > 0.3 ? "#3a1a14" : "#b06a5a";
  const inside = "#5b1d22";
  g.strokeStyle = lip;
  g.lineWidth = 0.028;
  const open = (h: number, teeth: boolean, tongue: boolean) => {
    g.beginPath();
    g.moveTo(-w, y + 0.01);
    g.quadraticCurveTo(0, y + 0.03, w, y + 0.01);
    g.quadraticCurveTo(0, y - h, -w, y + 0.01);
    g.closePath();
    g.fillStyle = inside;
    g.fill();
    g.save();
    g.clip();
    if (teeth) {
      g.fillStyle = "#fbfaf6";
      g.fillRect(-w, y - h * 0.22, w * 2, h * 0.3);
    }
    if (tongue) {
      g.fillStyle = "#e46a7a";
      g.beginPath();
      g.ellipse(0, y - h * 0.55, w * 0.62, h * 0.48, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    g.stroke();
  };
  // A tired day softens the smile a little; the choice itself is never replaced.
  const lift = mood === "tired" ? 0.6 : 1;
  g.beginPath();
  switch (look.mouth) {
    case "smile":
      g.moveTo(-w, y + 0.03);
      g.quadraticCurveTo(0, y - 0.11 * lift, w, y + 0.03);
      g.stroke();
      return;
    case "small":
      g.moveTo(-w * 0.55, y + 0.015);
      g.quadraticCurveTo(0, y - 0.05 * lift, w * 0.55, y + 0.015);
      g.stroke();
      return;
    case "neutral":
      g.moveTo(-w * 0.8, y);
      g.lineTo(w * 0.8, y);
      g.stroke();
      return;
    case "smirk":
      g.moveTo(-w * 0.8, y - 0.005);
      g.quadraticCurveTo(w * 0.2, y - 0.03, w * 0.85, y + 0.05 * lift);
      g.stroke();
      return;
    case "determined":
      g.moveTo(-w * 0.85, y - 0.02);
      g.quadraticCurveTo(0, y + 0.012, w * 0.85, y - 0.02);
      g.stroke();
      g.lineWidth = 0.018;
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(s * w * 0.98, y + 0.005);
        g.lineTo(s * w * 1.05, y - 0.03);
        g.stroke();
      }
      return;
    case "grin":
      open(0.16 * k * lift, true, false);
      return;
    case "tongue":
      open(0.15 * k * lift, false, true);
      return;
    case "open":
      g.ellipse(0, y - 0.02, 0.06 * k, 0.075 * k, 0, 0, Math.PI * 2);
      g.fillStyle = inside;
      g.fill();
      g.stroke();
      return;
  }
}

function facialHair(g: CanvasRenderingContext2D, look: Look, c: FaceColors, L: ReturnType<typeof layout>) {
  const style = look.facialHair;
  if (style === "none") return;
  const col = c.hair;
  const y = L.mouthY;
  const mustache = (curl: boolean) => {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(0, y + 0.1);
    g.bezierCurveTo(0.08, y + 0.13, 0.2, y + 0.09, 0.22, y + 0.02);
    if (curl) g.bezierCurveTo(0.3, y + 0.0, 0.34, y + 0.08, 0.3, y + 0.12);
    g.bezierCurveTo(0.22, y + 0.05, 0.12, y + 0.05, 0, y + 0.06);
    g.bezierCurveTo(-0.12, y + 0.05, -0.22, y + 0.05, curl ? -0.3 : -0.22, curl ? y + 0.12 : y + 0.02);
    if (curl) g.bezierCurveTo(-0.34, y + 0.08, -0.3, y + 0.0, -0.22, y + 0.02);
    g.bezierCurveTo(-0.2, y + 0.09, -0.08, y + 0.13, 0, y + 0.1);
    g.fill();
  };
  // The jaw region (below the cheeks, around to the sideburns); the texture continues under the chin.
  const jaw = () => {
    g.beginPath();
    g.moveTo(-0.9, 0.15);
    g.lineTo(-0.82, -0.25);
    g.quadraticCurveTo(-0.5, -0.18, -0.25, y + 0.12);
    g.quadraticCurveTo(0, y + 0.17, 0.25, y + 0.12);
    g.quadraticCurveTo(0.5, -0.18, 0.82, -0.25);
    g.lineTo(0.9, 0.15);
    g.lineTo(1.0, 0.15);
    g.lineTo(1.0, -2.2);
    g.lineTo(-1.0, -2.2);
    g.lineTo(-1.0, 0.15);
    g.closePath();
  };
  const mouthHole = () => {
    g.ellipse(0, y - 0.01, 0.2 * L.mouthK, 0.085 * L.mouthK, 0, 0, Math.PI * 2);
  };
  switch (style) {
    case "stubble": {
      g.save();
      jaw();
      g.clip();
      g.fillStyle = `${col}40`;
      g.fillRect(-1, -2.2, 2, 2.4);
      const r = seeded(11);
      g.fillStyle = `${col}aa`;
      for (let i = 0; i < 700; i++) {
        g.fillRect(-1 + r() * 2, -2.2 + r() * 2.4, 0.008, 0.008);
      }
      g.restore();
      return;
    }
    case "mustache":
      mustache(false);
      return;
    case "handlebar":
      mustache(true);
      return;
    case "goatee":
      mustache(false);
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(-0.13, y - 0.07);
      g.quadraticCurveTo(0, y - 0.04, 0.13, y - 0.07);
      g.quadraticCurveTo(0.14, y - 0.32, 0, y - 0.38);
      g.quadraticCurveTo(-0.14, y - 0.32, -0.13, y - 0.07);
      g.fill();
      return;
    case "chinstrap":
      g.strokeStyle = col;
      g.lineWidth = 0.09;
      g.beginPath();
      g.moveTo(-0.86, 0.12);
      g.quadraticCurveTo(-0.82, y - 0.3, 0, y - 0.42);
      g.quadraticCurveTo(0.82, y - 0.3, 0.86, 0.12);
      g.stroke();
      return;
    case "beard":
      g.save();
      g.beginPath();
      jaw();
      mouthHole();
      g.fillStyle = col;
      g.fill("evenodd");
      g.restore();
      mustache(false);
      return;
  }
}

function glasses(g: CanvasRenderingContext2D, look: Look, c: FaceColors, L: ReturnType<typeof layout>, f: Frame, wrap: boolean) {
  const style = look.glasses;
  if (style === "none") return;
  const fx = L.eyeX;
  const y = L.eyeY;
  const r = Math.max(0.12, L.eyeR * 1.45);
  g.strokeStyle = c.gear;
  g.lineWidth = 0.028;
  const temples = () => {
    g.beginPath();
    g.moveTo(-fx - r, y + 0.02);
    g.lineTo(-1.05, y + 0.06);
    g.moveTo(fx + r, y + 0.02);
    g.lineTo(1.05, y + 0.06);
    g.stroke();
  };
  switch (style) {
    case "round":
      for (const s of [-1, 1]) {
        g.beginPath();
        g.arc(s * fx, y, r, 0, Math.PI * 2);
        g.fillStyle = "rgba(200,230,255,0.12)";
        g.fill();
        g.stroke();
      }
      g.beginPath();
      g.moveTo(-fx + r, y + 0.01);
      g.quadraticCurveTo(0, y + 0.06, fx - r, y + 0.01);
      g.stroke();
      temples();
      return;
    case "square":
      g.lineWidth = 0.034;
      for (const s of [-1, 1]) {
        g.beginPath();
        g.roundRect(s * fx - r * 1.1, y - r * 0.8, r * 2.2, r * 1.6, 0.03);
        g.fillStyle = "rgba(200,230,255,0.12)";
        g.fill();
        g.stroke();
      }
      g.beginPath();
      g.moveTo(-fx + r * 1.1, y + 0.02);
      g.lineTo(fx - r * 1.1, y + 0.02);
      g.stroke();
      temples();
      return;
    case "aviator":
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(s * fx - r * 1.05, y + r * 0.6);
        g.lineTo(s * fx + r * 1.05, y + r * 0.6);
        g.quadraticCurveTo(s * fx + r * 1.15, y - r * 1.3, s * fx, y - r * 1.05);
        g.quadraticCurveTo(s * fx - r * 1.15, y - r * 1.3, s * fx - r * 1.05, y + r * 0.6);
        g.fillStyle = "rgba(40,45,55,0.78)";
        g.fill();
        g.stroke();
      }
      g.beginPath();
      g.moveTo(-fx + r, y + r * 0.6);
      g.lineTo(fx - r, y + r * 0.6);
      g.stroke();
      temples();
      return;
    case "sport": {
      const w = fx + r * 1.3;
      g.beginPath();
      g.moveTo(-w, y + r * 0.7);
      g.quadraticCurveTo(0, y + r * 1.0, w, y + r * 0.7);
      g.quadraticCurveTo(w + 0.03, y - r * 0.8, fx, y - r * 0.85);
      g.quadraticCurveTo(0.03, y - r * 0.6, 0, y - r * 0.2);
      g.quadraticCurveTo(-0.03, y - r * 0.6, -fx, y - r * 0.85);
      g.quadraticCurveTo(-w - 0.03, y - r * 0.8, -w, y + r * 0.7);
      const grad = g.createLinearGradient(-w, y + r, w, y - r);
      grad.addColorStop(0, "rgba(60,120,200,0.85)");
      grad.addColorStop(0.5, "rgba(140,80,190,0.85)");
      grad.addColorStop(1, "rgba(230,120,60,0.85)");
      g.fillStyle = grad;
      g.fill();
      g.lineWidth = 0.03;
      g.stroke();
      temples();
      return;
    }
    case "goggles": {
      // The strap goes all the way round on the head texture; on a tile it just runs off the edges.
      g.fillStyle = c.gear;
      const span = wrap ? (f.cx * 4) / f.s : 3;
      g.fillRect(-span, y - 0.035, span * 2, 0.07);
      for (const s of [-1, 1]) {
        g.beginPath();
        g.ellipse(s * fx, y, r * 1.05, r * 0.78, 0, 0, Math.PI * 2);
        g.fillStyle = "rgba(70,140,210,0.6)";
        g.fill();
        g.lineWidth = 0.04;
        g.stroke();
      }
      g.lineWidth = 0.03;
      g.beginPath();
      g.moveTo(-fx + r, y);
      g.lineTo(fx - r, y);
      g.stroke();
      return;
    }
  }
}

// ---------------------------------------------------------------- textures and tiles

/** The head's full wrap-around texture: skin everywhere, the face on the front. */
export function drawHeadTexture(canvas: HTMLCanvasElement, look: Look, mood: FaceMood, box = false) {
  const g = canvas.getContext("2d")!;
  const c = faceColors(look);
  g.fillStyle = c.skin;
  g.fillRect(0, 0, canvas.width, canvas.height);
  if (box) {
    drawFace(g, look, mood, { cx: canvas.width / 2, cy: canvas.height * 0.5, s: canvas.width * 0.42, ky: 1 });
    return;
  }
  // A sphere's texture: the front (+z) sits a quarter of the way across; 1 face unit ~ 75 degrees.
  const s = canvas.width / 4.8;
  drawFace(g, look, mood, { cx: canvas.width * 0.25, cy: canvas.height * 0.5, s, ky: 1 / 1.3 }, true);
}

export type TilePart = "eyes" | "brows" | "nose" | "mouth" | "facialHair" | "marks" | "glasses" | "face";

/** A square picker tile, zoomed on one part of the face, drawn with the look's other choices. */
export function drawTile(canvas: HTMLCanvasElement, look: Look, part: TilePart) {
  const g = canvas.getContext("2d")!;
  const w = canvas.width;
  g.clearRect(0, 0, w, w);
  g.fillStyle = faceColors(look).skin;
  g.beginPath();
  g.roundRect(0, 0, w, w, w * 0.22);
  g.fill();
  g.save();
  g.beginPath();
  g.roundRect(0, 0, w, w, w * 0.22);
  g.clip();
  const L = layout(look);
  const focus: Record<TilePart, [number, number]> = {
    eyes: [L.eyeY, 2.8],
    brows: [L.browY - 0.04, 2.8],
    glasses: [L.eyeY, 2.2],
    nose: [L.noseY, 3.6],
    mouth: [L.mouthY, 3.0],
    facialHair: [L.mouthY + 0.05, 1.3],
    marks: [-0.12, 1.8],
    face: [-0.1, 0.9],
  };
  const [fy, zoom] = focus[part];
  drawFace(g, look, null, { cx: w / 2, cy: w / 2 + fy * w * 0.42 * zoom * 0.8, s: w * 0.42 * zoom * 0.8, ky: 1 });
  g.restore();
}
