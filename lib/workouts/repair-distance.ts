// One-off repair (2026-11-10): Garmin Connect imports multiplied run/ride distances that were
// already in metres by the display unit (mile 1609.344 or km 1000). Finds impossible distances and
// divides the factor back out, choosing the unit whose result is a round number of that unit.
// Pure; remove with the repair route once used.

import type { Step } from "./garmin-format.ts";

const LIMIT: Record<string, number> = { run: 100_000, bike: 500_000 }; // one step, metres
const UNITS = [
  { f: 1609.344, label: "mi" },
  { f: 1000, label: "km" },
];
const round = (amount: number) => Math.abs(amount * 20 - Math.round(amount * 20)) < 0.02; // a multiple of 0.05

export type Fix = { from: number; to: number; unit: string; sure: boolean };

export function repairSteps(steps: Step[], sport: string): { steps: Step[]; fixes: Fix[] } {
  const limit = LIMIT[sport];
  const fixes: Fix[] = [];
  if (!limit) return { steps, fixes };
  const walk = (list: Step[]): Step[] =>
    list.map((s) => {
      if (s.kind === "repeat") return { ...s, steps: walk(s.steps) };
      if (s.duration.type !== "distance" || s.duration.meters <= limit) return s;
      const d = s.duration.meters;
      const pick = UNITS.find((u) => d / u.f <= limit && round(d / u.f / u.f)) ?? null;
      const u = pick ?? UNITS[0];
      const to = Number((d / u.f).toFixed(2));
      fixes.push({ from: d, to, unit: u.label, sure: Boolean(pick) });
      return { ...s, duration: { type: "distance", meters: to } };
    });
  return { steps: walk(steps ?? []), fixes };
}
