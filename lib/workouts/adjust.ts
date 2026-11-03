// Quick "harder / easier" adjustments for structured workouts.
// Pure module (no imports besides types) so it can be tested directly with `node`.
// Only the main work steps (ACTIVE, INTERVAL) change; warm-up, recovery, rest and cool-down stay as written.

import type { Duration, Step, Target } from "./garmin-format.ts";

export type AdjustDirection = "harder" | "easier";
export type AdjustScope = "intensity" | "duration" | "both";
export type Adjustment = { direction: AdjustDirection; percent: 5 | 10; scope: AdjustScope };

const WORK = new Set(["ACTIVE", "INTERVAL"]);
const round = (v: number, to: number) => Math.round(v / to) * to;

function adjustTarget(t: Target | undefined, f: number): Target | undefined {
  if (!t) return t;
  switch (t.type) {
    case "pace_range":
      // Harder = faster = fewer seconds per km. f > 1 means harder.
      return { type: "pace_range", slowSecPerKm: Math.round(t.slowSecPerKm / f), fastSecPerKm: Math.round(t.fastSecPerKm / f) };
    case "power_range":
      return { type: "power_range", low: Math.round(t.low * f), high: Math.round(t.high * f) };
    case "hr_range":
      return { type: "hr_range", low: Math.min(220, Math.round(t.low * f)), high: Math.min(225, Math.round(t.high * f)) };
    case "hr_zone":
      return t; // Zones are coarse; a 5–10% change doesn't map to a whole zone.
  }
}

function adjustDuration(d: Duration, f: number): Duration {
  if (d.type === "time") return { type: "time", seconds: Math.max(5, round(d.seconds * f, 5)) };
  if (d.type === "distance") return { type: "distance", meters: Math.max(10, round(d.meters * f, 10)) };
  return d;
}

export function adjustSteps(steps: Step[], a: Adjustment): Step[] {
  const f = a.direction === "harder" ? 1 + a.percent / 100 : 1 - a.percent / 100;
  const doIntensity = a.scope !== "duration";
  const doDuration = a.scope !== "intensity";
  return steps.map((s) => {
    if (s.kind === "repeat") return { ...s, steps: adjustSteps(s.steps, a) };
    if (!WORK.has(s.intensity)) return s;
    return {
      ...s,
      ...(doIntensity && s.target ? { target: adjustTarget(s.target, f) } : {}),
      ...(doDuration ? { duration: adjustDuration(s.duration, f) } : {}),
    };
  });
}

export function describeAdjustment(a: Adjustment) {
  const what = a.scope === "both" ? "intensity + duration" : a.scope;
  return `${a.direction} ${a.percent}% (${what})`;
}

/** Notes for the preview: things the adjustment deliberately left alone. */
export function adjustmentNotes(steps: Step[], a: Adjustment): string[] {
  const flat = steps.flatMap((s) => (s.kind === "repeat" ? s.steps : [s])).filter((s) => s.kind === "step" && WORK.has(s.intensity));
  const notes: string[] = [];
  if (!flat.length) notes.push("This workout has no Active or Interval steps, so nothing changes.");
  if (a.scope !== "duration") {
    if (flat.some((s) => s.kind === "step" && s.target?.type === "hr_zone")) notes.push("Heart-rate zones stay the same (too coarse for a 5–10% change).");
    if (flat.every((s) => s.kind === "step" && !s.target)) notes.push("Work steps have no targets, so only duration can change.");
  }
  if (a.scope !== "intensity" && flat.some((s) => s.kind === "step" && s.duration.type === "open"))
    notes.push("“Until lap” steps have no set length, so their duration stays open.");
  return notes;
}
