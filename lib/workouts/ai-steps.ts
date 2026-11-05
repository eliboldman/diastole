// Turns Claude's plain-unit workout steps (m:ss paces in the coach's unit, % of FTP, yd/m/mi)
// into Diastole steps with exact numbers. Pure, for tests.
import { YARD, type Drill, type Duration, type Equipment, type Intensity, type Pool, type Step, type Stroke, type SwimEffort, type Target } from "./garmin-format.ts";

const MILE = 1609.344;

export type AiLeaf = {
  kind: "step";
  intensity: string;
  duration_type: "time" | "distance" | "open" | "sendoff";
  seconds: number | null;
  distance: number | null;
  distance_unit: "m" | "km" | "yd" | "mi" | null;
  target_type: "none" | "hr_zone" | "hr_range" | "pace_range" | "power_pct_ftp" | "power_watts" | "swim_effort" | "swim_pace";
  hr_zone: number | null;
  low: number | null;
  high: number | null;
  pace_fast: string | null;
  pace_slow: string | null;
  swim_effort: number | null;
  swim_pace_per_100: string | null;
  stroke: string | null;
  drill: string | null;
  equipment: string | null;
  note: string | null;
};


export const clockToSec = (v: string | null | undefined) => {
  const m = v ? /^(\d{1,2}):([0-5]\d)$/.exec(v.trim()) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
export const toMeters = (d: number, unit: string | null, pool: Pool) => {
  const u = unit ?? (pool?.unit === "YARD" ? "yd" : "m");
  return Math.round((u === "km" ? d * 1000 : u === "mi" ? d * MILE : u === "yd" ? d * YARD : d) * 100) / 100;
};

export function leafToStep(s: AiLeaf, ctx: { paceUnit: "mi" | "km"; ftp: number | null; pool: Pool }): Step {
  let duration: Duration = { type: "open" };
  if ((s.duration_type === "time" || s.duration_type === "sendoff") && s.seconds && s.seconds > 0) duration = { type: s.duration_type, seconds: Math.round(s.seconds) };
  else if (s.duration_type === "distance" && s.distance && s.distance > 0) duration = { type: "distance", meters: toMeters(s.distance, s.distance_unit, ctx.pool) };

  let target: Target | undefined;
  const perKm = (sec: number) => (ctx.paceUnit === "mi" ? (sec * 1000) / MILE : sec);
  if (s.target_type === "hr_zone" && s.hr_zone && s.hr_zone >= 1 && s.hr_zone <= 5) target = { type: "hr_zone", zone: s.hr_zone as 1 };
  else if (s.target_type === "hr_range" && s.low && s.high) target = { type: "hr_range", low: Math.round(s.low), high: Math.round(s.high) };
  else if (s.target_type === "power_watts" && s.low && s.high) target = { type: "power_range", low: Math.round(s.low), high: Math.round(s.high) };
  else if (s.target_type === "power_pct_ftp" && s.low && s.high && ctx.ftp)
    target = { type: "power_range", low: Math.round((ctx.ftp * s.low) / 100), high: Math.round((ctx.ftp * s.high) / 100) };
  else if (s.target_type === "pace_range") {
    const f = clockToSec(s.pace_fast);
    const sl = clockToSec(s.pace_slow);
    if (f && sl) target = { type: "pace_range", fastSecPerKm: Math.round(perKm(Math.min(f, sl))), slowSecPerKm: Math.round(perKm(Math.max(f, sl))) };
  } else if (s.target_type === "swim_effort" && s.swim_effort && s.swim_effort >= 1 && s.swim_effort <= 10) target = { type: "swim_effort", level: s.swim_effort as SwimEffort };
  else if (s.target_type === "swim_pace") {
    const p = clockToSec(s.swim_pace_per_100);
    if (p) target = { type: "swim_pace", secPer100: p };
  }
  return {
    kind: "step",
    intensity: s.intensity as Intensity,
    duration,
    ...(target ? { target } : {}),
    ...(s.note?.trim() ? { note: s.note.trim().slice(0, 100) } : {}),
    ...(s.stroke ? { stroke: s.stroke as Stroke } : {}),
    ...(s.drill ? { drill: s.drill as Drill } : {}),
    ...(s.equipment ? { equipment: s.equipment as Equipment } : {}),
  };
}

