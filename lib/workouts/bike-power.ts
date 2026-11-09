// Bike workouts are always power-based (coach's rule): trainers in ERG, Zwift and Rouvy can only
// follow watts. Any heart-rate target on a bike step becomes the matching power band from FTP.
// Pure, for tests.
import type { Step, Target } from "./garmin-format.ts";

/** Heart-rate zone → the power band (% of FTP) a rider usually holds there. */
export const HR_ZONE_POWER_PCT: Record<number, [number, number]> = { 1: [45, 55], 2: [60, 72], 3: [76, 88], 4: [91, 100], 5: [105, 115] };

/** % of max HR → zone, on the common five-zone split (60/70/80/90). */
export const zoneFromMaxHrPct = (pct: number) => (pct < 60 ? 1 : pct < 70 ? 2 : pct < 80 ? 3 : pct < 90 ? 4 : 5);

/** The power band (% of FTP) for an HR target, or null if it isn't an HR target we can place. */
export function hrTargetPowerPct(t: Target | undefined, maxHr: number | null | undefined): [number, number] | null {
  if (!t) return null;
  if (t.type === "hr_zone") return HR_ZONE_POWER_PCT[Math.min(5, Math.max(1, Math.round(t.zone)))];
  if (t.type === "hr_range" && maxHr && maxHr > 0 && t.low > 0 && t.high >= t.low) {
    return HR_ZONE_POWER_PCT[zoneFromMaxHrPct(((t.low + t.high) / 2 / maxHr) * 100)];
  }
  return null;
}

const to5 = (w: number) => Math.round(w / 5) * 5;

/** Bike steps with every HR target turned into watts. Unchanged without an FTP. */
export function bikeStepsToPower(steps: Step[], ftp: number | null | undefined, maxHr: number | null | undefined): Step[] {
  if (!ftp || ftp <= 0) return steps;
  return steps.map((s): Step => {
    if (s.kind === "repeat") return { ...s, steps: bikeStepsToPower(s.steps, ftp, maxHr) };
    const pct = hrTargetPowerPct(s.target, maxHr);
    return pct ? { ...s, target: { type: "power_range", low: to5((ftp * pct[0]) / 100), high: to5((ftp * pct[1]) / 100) } } : s;
  });
}
