// The "readiness red" version of a session, as the plan prescribes it: the same time (or distance),
// all at Z1–Z2. Bike targets are power (never heart rate), runs pace, swims effort.
// Pure module (types only), testable with `node`.

import type { Brick, Step, Target } from "../workouts/garmin-format.ts";
import { workoutTotals } from "../workouts/totals.ts";

export type EasyZones = { ftp_w?: number | null; threshold_speed_mps?: number | null };

const min = (s: number) => ({ type: "time" as const, seconds: Math.max(60, Math.round(s / 60) * 60) });

function power(z: EasyZones, lo: number, hi: number) {
  return z.ftp_w ? { type: "power_range" as const, low: Math.round((z.ftp_w * lo) / 100), high: Math.round((z.ftp_w * hi) / 100), rel: { pct: [lo, hi] as [number, number] } } as Target : undefined;
}
function pace(z: EasyZones, lo: number, hi: number) {
  if (!z.threshold_speed_mps) return undefined;
  const v = Number(z.threshold_speed_mps);
  return { type: "pace_range" as const, slowSecPerKm: Math.round(1000 / ((v * lo) / 100)), fastSecPerKm: Math.round(1000 / ((v * hi) / 100)), rel: { pct: [lo, hi] as [number, number] } } as Target;
}

/** Easy run or ride for a total time: 10 min warm-up, the rest steady Z2, 5 min cool-down. */
function easyTimed(sport: "run" | "bike", seconds: number, z: EasyZones): Step[] {
  const total = Math.max(20 * 60, seconds);
  const wu = 10 * 60;
  const cd = 5 * 60;
  const main = total - wu - cd;
  if (sport === "bike")
    return [
      { kind: "step", intensity: "WARMUP", duration: min(wu), target: power(z, 50, 60), note: "Easy spin" },
      { kind: "step", intensity: "ACTIVE", duration: min(main), target: power(z, 55, 68), note: "Z1–Z2 only (readiness red)" },
      { kind: "step", intensity: "COOLDOWN", duration: min(cd), target: power(z, 45, 55), note: "Spin out" },
    ];
  return [
    { kind: "step", intensity: "WARMUP", duration: min(wu), target: pace(z, 68, 76), note: "Easy jog" },
    { kind: "step", intensity: "ACTIVE", duration: min(main), target: pace(z, 74, 82), note: "Conversational only (readiness red)" },
    { kind: "step", intensity: "COOLDOWN", duration: min(cd), target: pace(z, 68, 76), note: "Easy" },
  ];
}

/** Easy swim for a total distance: easy warm-up, steady aerobic pull, easy cool-down. Effort targets. */
function easySwim(meters: number, unitM: number): Step[] {
  const lengths = (m: number) => Math.max(1, Math.round(m / unitM)) * unitM;
  const total = Math.max(800, meters);
  const wu = lengths(300 * 0.9144);
  const cd = lengths(200 * 0.9144);
  const main = lengths(total - wu - cd);
  return [
    { kind: "step", intensity: "WARMUP", duration: { type: "distance", meters: +wu.toFixed(2) }, target: { type: "swim_effort", level: 2 }, note: "Very easy, long strokes", stroke: "FREESTYLE" },
    { kind: "step", intensity: "MAIN", duration: { type: "distance", meters: +main.toFixed(2) }, target: { type: "swim_effort", level: 3 }, note: "Easy aerobic, no hard efforts (readiness red)", stroke: "FREESTYLE" },
    { kind: "step", intensity: "COOLDOWN", duration: { type: "distance", meters: +cd.toFixed(2) }, target: { type: "swim_effort", level: 2 }, note: "Easy, mix strokes", stroke: "CHOICE" },
  ];
}

export type EasyVersion = { title: string; steps: Step[]; brick: Brick; summary: string };

export function easyVersion(
  w: { sport: string; title: string; steps: Step[]; brick?: Brick | null; pool_length?: number | null; pool_unit?: string | null },
  z: EasyZones,
): EasyVersion | null {
  const pool = w.pool_length && w.pool_unit ? { length: Number(w.pool_length), unit: w.pool_unit as "YARD" | "METER" } : null;
  const t = workoutTotals(w.steps ?? [], w.sport, pool, z);
  const title = `Easy: ${w.title}`.slice(0, 100);
  const mins = (s: number) => `${Math.round(s / 60)} min`;
  if (w.sport === "swim") {
    const unitM = pool ? (pool.unit === "YARD" ? pool.length * 0.9144 : pool.length) : 25 * 0.9144;
    if (!t.meters) return null;
    const steps = easySwim(t.meters, unitM);
    const yd = Math.round(steps.reduce((a, s) => a + (s.kind === "step" && s.duration.type === "distance" ? s.duration.meters : 0), 0) / 0.9144);
    return { title, steps, brick: null, summary: `${yd} yd easy, effort targets only` };
  }
  if (w.sport !== "run" && w.sport !== "bike") return null;
  if (!t.seconds) return null;
  const steps = easyTimed(w.sport, t.seconds, z);
  let brick: Brick = null;
  let brickText = "";
  if (w.brick?.steps?.length) {
    const bt = workoutTotals(w.brick.steps, "run", null, z).seconds;
    if (bt) {
      brick = { sport: "run", steps: [{ kind: "step", intensity: "ACTIVE", duration: min(bt), target: pace(z, 72, 80), note: "Easy off the bike" }] };
      brickText = ` + ${mins(bt)} easy run off the bike`;
    }
  }
  const zone = w.sport === "bike" ? "Z1–Z2 power" : "conversational pace";
  return { title, steps, brick, summary: `${mins(t.seconds)} at ${zone}${brickText}` };
}
