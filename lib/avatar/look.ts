// An avatar "look": the athlete's own choices. Only ids from parts.json and two clamped numbers are
// stored; the renderer looks everything up, so a saved look can never inject markup.
import parts from "./parts.json";

export type Look = {
  body: string;
  build: number; // 0.88..1.12, width; self-chosen only
  height: number; // 0.92..1.08; self-chosen only
  skin: string;
  face: string;
  eyes: string;
  brows: string;
  hair: string;
  hairColor: string;
  facialHair: string;
  outfit: string;
  outfitColor: string;
  accent: string;
  shoes: string;
  accessories: string[];
};

export const BUILD = { min: 0.88, max: 1.12 } as const;
export const HEIGHT = { min: 0.92, max: 1.08 } as const;

export type Part = { id: string; label: string; unlock?: string; slot?: string; sport?: string };
export const PARTS = parts;

export const DEFAULT_LOOK: Look = parts.presets[0].look as Look;

const ids = (list: { id: string }[]) => new Set(list.map((x) => x.id));
const pick = <T extends string>(v: unknown, allowed: Set<string>, fallback: T): T => (typeof v === "string" && allowed.has(v) ? (v as T) : fallback);
const clamp = (v: unknown, r: { min: number; max: number }, d = 1) => (typeof v === "number" && Number.isFinite(v) ? Math.min(r.max, Math.max(r.min, v)) : d);

/** Any stored JSON -> a valid look (unknown ids fall back to the default; one accessory per slot). */
export function normalizeLook(raw: unknown): Look {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_LOOK;
  const accAll = new Map(parts.accessories.map((a) => [a.id, a]));
  const slots = new Set<string>();
  const accessories = (Array.isArray(r.accessories) ? r.accessories : d.accessories).filter((a): a is string => {
    const p = typeof a === "string" ? accAll.get(a) : undefined;
    if (!p || slots.has(p.slot)) return false;
    slots.add(p.slot);
    return true;
  });
  return {
    body: pick(r.body, ids(parts.bodies), d.body),
    build: Math.round(clamp(r.build, BUILD) * 100) / 100,
    height: Math.round(clamp(r.height, HEIGHT) * 100) / 100,
    skin: pick(r.skin, ids(parts.colors.skin), d.skin),
    face: pick(r.face, ids(parts.faces), d.face),
    eyes: pick(r.eyes, ids(parts.eyes), d.eyes),
    brows: pick(r.brows, ids(parts.brows), d.brows),
    hair: pick(r.hair, ids(parts.hair), d.hair),
    hairColor: pick(r.hairColor, ids(parts.colors.hair), d.hairColor),
    facialHair: pick(r.facialHair, ids(parts.facialHair), d.facialHair),
    outfit: pick(r.outfit, ids(parts.outfits), d.outfit),
    outfitColor: pick(r.outfitColor, ids(parts.colors.outfit), d.outfitColor),
    accent: pick(r.accent, ids(parts.colors.accent), d.accent),
    shoes: pick(r.shoes, ids(parts.shoes), d.shoes),
    accessories,
  };
}

/** Swap in an accessory, replacing whatever was in its slot; picking the same one again removes it. */
export function toggleAccessory(look: Look, id: string): Look {
  const p = parts.accessories.find((a) => a.id === id);
  if (!p) return look;
  if (look.accessories.includes(id)) return { ...look, accessories: look.accessories.filter((a) => a !== id) };
  const bySlot = new Map(parts.accessories.map((a) => [a.id, a.slot]));
  return { ...look, accessories: [...look.accessories.filter((a) => bySlot.get(a) !== p.slot), id] };
}

/** A random look from what this athlete has unlocked. Sliders stay near the middle. */
export function randomLook(unlocked: Set<string>, rnd = Math.random): Look {
  const any = (list: { id: string; unlock?: string }[]) => {
    const open = list.filter((x) => !x.unlock || unlocked.has(x.unlock));
    return open[Math.floor(rnd() * open.length)].id;
  };
  const accs = parts.accessories.filter((a) => (!a.unlock || unlocked.has(a.unlock)) && rnd() < 0.35).map((a) => a.id);
  return normalizeLook({
    body: any(parts.bodies),
    build: 0.94 + rnd() * 0.12,
    height: 0.95 + rnd() * 0.1,
    skin: any(parts.colors.skin),
    face: any(parts.faces),
    eyes: any(parts.eyes),
    brows: any(parts.brows),
    hair: any(parts.hair),
    hairColor: any(parts.colors.hair),
    facialHair: rnd() < 0.6 ? "none" : any(parts.facialHair),
    outfit: any(parts.outfits),
    outfitColor: any(parts.colors.outfit),
    accent: any(parts.colors.accent),
    shoes: any(parts.shoes),
    accessories: accs,
  });
}

/** Locked parts the look uses get swapped for defaults (e.g. after a milestone is lost to deletion). */
export function withoutLocked(look: Look, unlocked: Set<string>): Look {
  const ok = (list: Part[], id: string) => {
    const p = list.find((x) => x.id === id);
    return !p?.unlock || unlocked.has(p.unlock);
  };
  return {
    ...look,
    outfit: ok(parts.outfits, look.outfit) ? look.outfit : "run",
    shoes: ok(parts.shoes, look.shoes) ? look.shoes : "runners",
    accessories: look.accessories.filter((a) => ok(parts.accessories, a)),
  };
}
