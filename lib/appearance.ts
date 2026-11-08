// Appearance beyond the color theme: background, glow, text size, corners, spacing and motion.
// Saved on the account (profiles.appearance) and in a cookie so the server paints it before the
// page loads. Each setting becomes a data-* attribute on <html>; globals.css does the rest.

export const BACKGROUNDS = [
  { id: "tinted", label: "Matched", hint: "Tinted to your color", swatch: "" },
  { id: "midnight", label: "Midnight", hint: "Neutral dark", swatch: "#0b0d10" },
  { id: "black", label: "True black", hint: "Best on OLED", swatch: "#000000" },
  { id: "slate", label: "Slate", hint: "Cool blue-gray", swatch: "#0f1522" },
  { id: "warm", label: "Espresso", hint: "Warm brown", swatch: "#15110c" },
] as const;
export const TEXT_SIZES = [
  { id: "s", label: "Small", scale: 0.9375 },
  { id: "m", label: "Default", scale: 1 },
  { id: "l", label: "Large", scale: 1.125 },
  { id: "xl", label: "Extra large", scale: 1.25 },
] as const;
export const CORNERS = [
  { id: "round", label: "Rounded" },
  { id: "soft", label: "Soft" },
  { id: "square", label: "Square" },
] as const;
export const DENSITIES = [
  { id: "cozy", label: "Comfortable" },
  { id: "compact", label: "Compact" },
] as const;

export type Look = {
  hue: number; // the custom color's hue (0-359), used when the theme is "custom"
  bg: (typeof BACKGROUNDS)[number]["id"];
  glow: boolean;
  text: (typeof TEXT_SIZES)[number]["id"];
  corners: (typeof CORNERS)[number]["id"];
  density: (typeof DENSITIES)[number]["id"];
  motion: boolean;
};

export const DEFAULT_LOOK: Look = { hue: 165, bg: "tinted", glow: true, text: "m", corners: "round", density: "cozy", motion: true };
export const LOOK_COOKIE = "d_look";

const oneOf = <T extends string>(v: unknown, list: readonly { id: T }[], fallback: T): T => (list.some((x) => x.id === v) ? (v as T) : fallback);

/** Anything (a saved row, a cookie, a form) into a valid Look; unknown values fall back to the defaults. */
export function asLook(raw: unknown): Look {
  let r: Record<string, unknown> = {};
  if (typeof raw === "string") {
    try {
      r = JSON.parse(decodeURIComponent(raw));
    } catch {
      r = {};
    }
  } else if (raw && typeof raw === "object") r = raw as Record<string, unknown>;
  const hue = typeof r.hue === "number" && Number.isFinite(r.hue) ? ((Math.round(r.hue) % 360) + 360) % 360 : DEFAULT_LOOK.hue;
  return {
    hue,
    bg: oneOf(r.bg, BACKGROUNDS, DEFAULT_LOOK.bg),
    glow: typeof r.glow === "boolean" ? r.glow : DEFAULT_LOOK.glow,
    text: oneOf(r.text, TEXT_SIZES, DEFAULT_LOOK.text),
    corners: oneOf(r.corners, CORNERS, DEFAULT_LOOK.corners),
    density: oneOf(r.density, DENSITIES, DEFAULT_LOOK.density),
    motion: typeof r.motion === "boolean" ? r.motion : DEFAULT_LOOK.motion,
  };
}

export const lookCookie = (l: Look) => encodeURIComponent(JSON.stringify(l));

/** The <html> attributes for a look. Defaults are left off so the base styles apply untouched. */
export function lookAttrs(l: Look): Record<string, string> {
  const a: Record<string, string> = {};
  if (l.bg !== "tinted") a["data-bg"] = l.bg;
  if (!l.glow) a["data-glow"] = "off";
  if (l.text !== "m") a["data-text"] = l.text;
  if (l.corners !== "round") a["data-corners"] = l.corners;
  if (l.density !== "cozy") a["data-density"] = l.density;
  if (!l.motion) a["data-motion"] = "off";
  return a;
}

/** Paint a look (and the custom hue) on the live page. */
export function applyLook(el: HTMLElement, l: Look) {
  const attrs = lookAttrs(l);
  for (const k of ["data-bg", "data-glow", "data-text", "data-corners", "data-density", "data-motion"]) {
    if (attrs[k]) el.setAttribute(k, attrs[k]);
    else el.removeAttribute(k);
  }
  el.style.setProperty("--custom-h", String(l.hue));
}
