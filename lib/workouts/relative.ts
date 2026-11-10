// Targets that scale per athlete. Each target keeps its real numbers (what the watch gets) and,
// alongside them, the same target as a percentage of the athlete's zones:
//   power_range → pct of FTP          pace_range → pct of threshold speed (100 = threshold pace)
//   hr_range    → pct of threshold HR (or of max HR when threshold isn't set)
//   swim_pace   → pct of CSS speed (swim threshold; 100 = CSS pace)
// Saving to the Library records the percentages; assigning re-works the numbers from each
// athlete's own zones. Pure module (type imports only), testable with `node`.

import type { Pool, Step, Target } from "./garmin-format.ts";

export type RelZones = { ftp_w?: number | null; threshold_speed_mps?: number | null; threshold_hr?: number | null; max_hr?: number | null; css_sec_per_100m?: number | null } | null;
export type Rel = { pct: [number, number]; of?: "thr" | "max" | "css" };
export type Missing = "FTP" | "threshold pace" | "heart rate" | "CSS";

const YARD = 0.9144;
const per100 = (pool: Pool) => (pool?.unit === "YARD" ? 100 * YARD : 100); // metres in "100" of the pool's unit

type WithRel = Target & { rel?: Rel };
const round1 = (v: number) => Math.round(v * 10) / 10;

const mapTargets = (steps: Step[], fn: (t: WithRel) => WithRel): Step[] =>
  steps.map((s) => (s.kind === "repeat" ? { ...s, steps: mapTargets(s.steps, fn) } : s.target ? { ...s, target: fn(s.target as WithRel) } : s));

/** Record each target's percentage of these zones (targets that already have one keep it). */
export function annotate(steps: Step[], z: RelZones, pool: Pool = null): Step[] {
  if (!z) return steps;
  return mapTargets(steps, (t) => {
    if (t.rel) return t;
    if (t.type === "power_range" && z.ftp_w) return { ...t, rel: { pct: [round1((t.low / z.ftp_w) * 100), round1((t.high / z.ftp_w) * 100)] } };
    if (t.type === "pace_range" && z.threshold_speed_mps) {
      const thr = Number(z.threshold_speed_mps);
      // Slow end first, like the speeds: low pct = slow pace.
      return { ...t, rel: { pct: [round1((1000 / t.slowSecPerKm / thr) * 100), round1((1000 / t.fastSecPerKm / thr) * 100)] } };
    }
    if (t.type === "hr_range") {
      const base = z.threshold_hr ? { v: Number(z.threshold_hr), of: "thr" as const } : z.max_hr ? { v: Number(z.max_hr), of: "max" as const } : null;
      if (base) return { ...t, rel: { pct: [round1((t.low / base.v) * 100), round1((t.high / base.v) * 100)], of: base.of } };
    }
    if (t.type === "swim_pace" && z.css_sec_per_100m) {
      const pct = round1(((per100(pool) / t.secPer100) / (100 / Number(z.css_sec_per_100m))) * 100);
      return { ...t, rel: { pct: [pct, pct], of: "css" } };
    }
    return t;
  });
}

/**
 * Re-work targets from their percentages for these zones. Targets without a percentage, or whose
 * zone this athlete doesn't have, keep their written numbers (and the zone is listed in `missing`).
 */
export function resolve(steps: Step[], z: RelZones, pool: Pool = null): { steps: Step[]; missing: Missing[]; changed: boolean } {
  const missing = new Set<Missing>();
  let changed = false;
  const out = mapTargets(steps, (t) => {
    if (!t.rel) return t;
    const [lo, hi] = t.rel.pct;
    let next: WithRel = t;
    if (t.type === "power_range") {
      if (!z?.ftp_w) missing.add("FTP");
      else next = { ...t, low: Math.round((z.ftp_w * lo) / 100), high: Math.round((z.ftp_w * hi) / 100) };
    } else if (t.type === "pace_range") {
      if (!z?.threshold_speed_mps) missing.add("threshold pace");
      else {
        const thr = Number(z.threshold_speed_mps);
        next = { ...t, slowSecPerKm: Math.round(1000 / ((thr * lo) / 100)), fastSecPerKm: Math.round(1000 / ((thr * hi) / 100)) };
      }
    } else if (t.type === "hr_range") {
      const base = t.rel.of === "max" ? (z?.max_hr ?? null) : (z?.threshold_hr ?? null);
      // A threshold-based target can fall back to max HR (threshold ≈ 90% of max), and vice versa.
      const alt = t.rel.of === "max" ? (z?.threshold_hr ? Number(z.threshold_hr) / 0.9 : null) : z?.max_hr ? Number(z.max_hr) * 0.9 : null;
      const v = base ? Number(base) : alt;
      if (!v) missing.add("heart rate");
      else next = { ...t, low: Math.round((v * lo) / 100), high: Math.round((v * hi) / 100) };
    } else if (t.type === "swim_pace") {
      if (!z?.css_sec_per_100m) missing.add("CSS");
      else {
        const speed = (100 / Number(z.css_sec_per_100m)) * (lo / 100);
        next = { ...t, secPer100: Math.round(per100(pool) / speed) };
      }
    }
    if (JSON.stringify(next) !== JSON.stringify(t)) changed = true;
    return next;
  });
  return { steps: out, missing: [...missing], changed };
}

/** "88–94% FTP", "97–101% threshold pace", "85–90% threshold HR"; null without a percentage. */
export function relText(t: Target | undefined): string | null {
  const r = (t as WithRel | undefined)?.rel;
  if (!t || !r) return null;
  const [lo, hi] = r.pct.map((p) => Math.round(p));
  const range = lo === hi ? `${lo}%` : `${lo}–${hi}%`;
  if (t.type === "power_range") return `${range} FTP`;
  if (t.type === "pace_range") return `${range} threshold pace`;
  if (t.type === "hr_range") return `${range} ${r.of === "max" ? "max" : "threshold"} HR`;
  if (t.type === "swim_pace") return `${range} CSS`;
  return null;
}

/** True when any target carries a percentage. */
export const hasRelative = (steps: Step[]): boolean =>
  steps.some((s) => (s.kind === "repeat" ? hasRelative(s.steps) : Boolean((s.target as WithRel | undefined)?.rel)));

/** Drop every recorded percentage (before re-deriving them from the current numbers). */
export const stripRel = (steps: Step[]): Step[] =>
  mapTargets(steps, (t) => {
    if (!t.rel) return t;
    const { rel: _drop, ...rest } = t;
    void _drop;
    return rest as WithRel;
  });

export const ZONE_COLUMNS = "ftp_w, threshold_speed_mps, threshold_hr, max_hr, css_sec_per_100m";
