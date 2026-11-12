// Meal logging math (Phase 9b): daily carb/protein/fat targets from body weight and the day's
// training, portion scaling of Claude's estimates, and spotting repeat meals.
// Pure module (type imports only) so it can be tested directly with `node`.

import type { FuelDay } from "./plan.ts";

// ---------------------------------------------------------------- targets

export type Range = { low: number; high: number };
export type Macro = "carbs" | "protein" | "fat";
export type Targets = Record<Macro, Range> & { kcal: Range };

// Grams per kg of body weight per day. General sports-nutrition ranges for endurance training:
// carbs scale with the day's training; protein and fat stay about the same.
export const PER_KG: Record<FuelDay, Record<Macro, [number, number]>> = {
  low: { carbs: [3, 5], protein: [1.6, 2.0], fat: [0.8, 1.2] },
  medium: { carbs: [5, 7], protein: [1.6, 2.0], fat: [0.8, 1.2] },
  high: { carbs: [7, 10], protein: [1.6, 2.0], fat: [0.8, 1.2] },
};

const r5 = (n: number) => Math.round(n / 5) * 5;

/** A dietitian's or coach's per-athlete changes to PER_KG; anything missing uses the default. */
export type PerKg = Partial<Record<FuelDay, Partial<Record<Macro, [number, number]>>>>;

// Sane bounds per macro (g/kg/day), so a typo can't produce a nonsense target.
export const PER_KG_LIMITS: Record<Macro, [number, number]> = { carbs: [1, 14], protein: [0.8, 3.5], fat: [0.3, 2.5] };
const LEVELS_ALL: FuelDay[] = ["low", "medium", "high"];
const MACROS: Macro[] = ["carbs", "protein", "fat"];

/** Keeps only valid [low, high] pairs inside PER_KG_LIMITS, rounded to 0.1, and drops ones equal to the default. */
export function cleanPerKg(raw: unknown): PerKg {
  const out: PerKg = {};
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  for (const level of LEVELS_ALL) {
    const lv = src[level] && typeof src[level] === "object" ? (src[level] as Record<string, unknown>) : {};
    for (const m of MACROS) {
      const v = lv[m];
      if (!Array.isArray(v) || v.length !== 2) continue;
      let [a, b] = v.map((x) => Math.round(Number(x) * 10) / 10);
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      if (a > b) [a, b] = [b, a];
      const [lo, hi] = PER_KG_LIMITS[m];
      if (a < lo || b > hi) continue;
      if (a === PER_KG[level][m][0] && b === PER_KG[level][m][1]) continue;
      (out[level] ??= {})[m] = [a, b];
    }
  }
  return out;
}

/** The g/kg ranges in effect for a day: the athlete's own where set, otherwise the defaults. */
export function perKgFor(level: FuelDay, custom?: PerKg | null): Record<Macro, [number, number]> {
  return { ...PER_KG[level], ...(custom?.[level] ?? {}) };
}

/** The day's targets as ranges, or null without a body weight. */
export function dailyTargets(weightKg: number | null | undefined, level: FuelDay, custom?: PerKg | null): Targets | null {
  if (!weightKg || weightKg < 25 || weightKg > 250) return null;
  const k = perKgFor(level, custom);
  const range = ([a, b]: [number, number]): Range => ({ low: r5(a * weightKg), high: r5(b * weightKg) });
  const carbs = range(k.carbs);
  const protein = range(k.protein);
  const fat = range(k.fat);
  const kcal = (pick: "low" | "high") => Math.round((carbs[pick] * 4 + protein[pick] * 4 + fat[pick] * 9) / 50) * 50;
  return { carbs, protein, fat, kcal: { low: kcal("low"), high: kcal("high") } };
}

export type Ring = { eaten: number; fill: number; inRange: boolean; reached: boolean };

/** How full a ring is: it fills toward the bottom of the range and stays full past it. Never "over". */
export function ring(eaten: number, range: Range | null): Ring {
  const e = Math.max(0, Math.round(eaten));
  if (!range) return { eaten: e, fill: 0, inRange: false, reached: false };
  return { eaten: e, fill: Math.min(1, e / Math.max(1, range.low)), inRange: e >= range.low && e <= range.high, reached: e >= range.low };
}

// ---------------------------------------------------------------- estimates and portions

/** One food as Claude estimated it, every amount a [low, high] range in grams. */
export type EstimateItem = { name: string; portion: string; carbs: [number, number]; protein: [number, number]; fat: [number, number] };
/** One food as the athlete confirmed it. */
export type LoggedItem = { name: string; portion: string; scale: number; carbs_g: number; protein_g: number; fat_g: number };

export const SCALES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
export const scaleLabel = (s: number) => (s === 1 ? "As shown" : s < 1 ? `${s === 0.5 ? "Half" : "Smaller"}` : s === 2 ? "Double" : "Bigger");

/** One step smaller (-1) or bigger (+1) on the portion scale. */
export function stepScale(s: number, dir: -1 | 1): number {
  const i = SCALES.indexOf(s as (typeof SCALES)[number]);
  const at = i < 0 ? 2 : i;
  return SCALES[Math.min(SCALES.length - 1, Math.max(0, at + dir))];
}

const mid = ([a, b]: [number, number]) => (Math.max(0, a) + Math.max(0, b)) / 2;
const r1 = (n: number) => Math.round(n * 10) / 10;
const clampRange = (v: unknown): [number, number] => {
  const a = Array.isArray(v) ? v.map(Number) : [0, 0];
  const lo = Number.isFinite(a[0]) ? Math.min(Math.max(0, a[0]), 1000) : 0;
  const hi = Number.isFinite(a[1]) ? Math.min(Math.max(0, a[1]), 1000) : lo;
  return lo <= hi ? [lo, hi] : [hi, lo];
};

/** Cleans what came back from Claude (or a client): names trimmed, ranges sane, at most 20 foods. */
export function cleanEstimate(items: unknown): EstimateItem[] {
  if (!Array.isArray(items)) return [];
  return items
    .slice(0, 20)
    .map((x) => {
      const o = (x ?? {}) as Record<string, unknown>;
      return {
        name: String(o.name ?? "").replace(/\s+/g, " ").trim().slice(0, 60),
        portion: String(o.portion ?? "").replace(/\s+/g, " ").trim().slice(0, 60),
        carbs: clampRange(o.carbs),
        protein: clampRange(o.protein),
        fat: clampRange(o.fat),
      };
    })
    .filter((i) => i.name);
}

/** What gets saved for one food: the middle of each range, times the portion scale. */
export function confirmItem(item: EstimateItem, scale = 1): LoggedItem {
  const s = SCALES.includes(scale as (typeof SCALES)[number]) ? scale : 1;
  return { name: item.name, portion: item.portion, scale: s, carbs_g: r1(mid(item.carbs) * s), protein_g: r1(mid(item.protein) * s), fat_g: r1(mid(item.fat) * s) };
}

/** A range shown on the confirm card, scaled: "40–55 g", or "about 5 g" when it's tight. */
export function rangeText([a, b]: [number, number], scale = 1): string {
  const lo = Math.round(a * scale);
  const hi = Math.round(b * scale);
  if (hi === 0) return "0 g";
  return hi - lo <= 2 ? `about ${Math.max(1, Math.round((lo + hi) / 2))} g` : `${lo}–${hi} g`;
}

export function totals(items: Pick<LoggedItem, "carbs_g" | "protein_g" | "fat_g">[]) {
  const t = items.reduce((s, i) => ({ carbs: s.carbs + i.carbs_g, protein: s.protein + i.protein_g, fat: s.fat + i.fat_g }), { carbs: 0, protein: 0, fat: 0 });
  return { carbs_g: r1(t.carbs), protein_g: r1(t.protein), fat_g: r1(t.fat), kcal: Math.round(t.carbs * 4 + t.protein * 4 + t.fat * 9) };
}

// ---------------------------------------------------------------- meal times and repeat meals

export type Slot = "breakfast" | "lunch" | "dinner" | "snack";

/** Meal name from the local hour it was eaten. */
export function slotFor(hour: number): Slot {
  if (hour >= 5 && hour < 10.5) return "breakfast";
  if (hour >= 11 && hour < 15) return "lunch";
  if (hour >= 17 && hour < 21.5) return "dinner";
  return "snack";
}

export const SLOT_LABEL: Record<Slot, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack" };

type PastMeal = { id: string; label: string | null; items: LoggedItem[]; created_at: string };

/** Same foods regardless of order or case. */
export const signature = (items: { name: string }[]) =>
  items
    .map((i) => i.name.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim())
    .filter(Boolean)
    .sort()
    .join("|");

/**
 * Meals logged at least `min` times (same foods), most frequent first, each represented by its
 * latest log. `slot`: put the usual for this time of day first ("Your usual lunch?").
 */
export function usualMeals<T extends PastMeal>(meals: T[], slotOf: (m: T) => Slot, slot?: Slot, min = 3): { meal: T; times: number; slot: Slot }[] {
  const groups = new Map<string, { meal: T; times: number; slots: Map<Slot, number> }>();
  for (const m of meals) {
    const sig = signature(m.items);
    if (!sig) continue;
    const g = groups.get(sig);
    const sl = slotOf(m);
    if (!g) groups.set(sig, { meal: m, times: 1, slots: new Map([[sl, 1]]) });
    else {
      g.times += 1;
      g.slots.set(sl, (g.slots.get(sl) ?? 0) + 1);
      if (m.created_at > g.meal.created_at) g.meal = m;
    }
  }
  const out = [...groups.values()]
    .filter((g) => g.times >= min)
    .map((g) => ({ meal: g.meal, times: g.times, slot: [...g.slots.entries()].sort((a, b) => b[1] - a[1])[0][0] }));
  return out.sort((a, b) => Number(b.slot === slot) - Number(a.slot === slot) || b.times - a.times);
}

// ---------------------------------------------------------------- reviewing past days (dietitian view)

export type HitDay = { meals: number; eaten: Record<Macro, number> & { kcal: number }; targets: Targets | null };
export type HitSummary = {
  days: number; // days in the window
  logged: number; // days with at least one meal
  scored: number; // logged days that had targets (a body weight)
  reached: Record<Macro | "kcal", number>; // scored days at or above the low end
  inRange: Record<Macro | "kcal", number>; // scored days inside the range
  avg: Record<Macro, number> & { kcal: number }; // average over logged days
};

/** How often logged days met their targets. Days with no meals don't count against anyone. */
export function hitSummary(days: HitDay[]): HitSummary {
  const keys = ["carbs", "protein", "fat", "kcal"] as const;
  const zero = () => ({ carbs: 0, protein: 0, fat: 0, kcal: 0 });
  const reached = zero();
  const inRange = zero();
  const sum = zero();
  let logged = 0;
  let scored = 0;
  for (const d of days) {
    if (d.meals <= 0) continue;
    logged += 1;
    for (const k of keys) sum[k] += d.eaten[k];
    if (!d.targets) continue;
    scored += 1;
    for (const k of keys) {
      const r = d.targets[k];
      if (d.eaten[k] >= r.low) reached[k] += 1;
      if (d.eaten[k] >= r.low && d.eaten[k] <= r.high) inRange[k] += 1;
    }
  }
  const avg = zero();
  if (logged) for (const k of keys) avg[k] = Math.round(sum[k] / logged);
  return { days: days.length, logged, scored, reached, inRange, avg };
}
