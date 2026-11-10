// Planned vs completed, per interval. Pure module (testable with `node`).
import { hundredMeters, type Duration, type Intensity, type Pool, type Step, type Target } from "../workouts/garmin-format.ts";
import type { Lap } from "./fit.ts";
import { hrZones, type Zone } from "./zones.ts";

export type PlannedStep = { label: string; intensity: Intensity; duration: Duration; target?: Target; rep?: string };
export type Verdict = "on" | "over" | "under" | null;
export type ComparedStep = {
  planned: PlannedStep;
  actual: { duration_s: number | null; distance_m: number | null; avg_hr: number | null; avg_speed: number | null; avg_power: number | null };
  verdict: Verdict;
  measured: number | null; // the value judged against the target (bpm, m/s or W)
  range: [number, number] | null; // the target as a low-high range in the same unit
};

/** Slack around a target before calling it over or under. */
const SLACK = 0.03;

const INTENSITY_LABEL: Record<Intensity, string> = {
  WARMUP: "Warm up",
  ACTIVE: "Run",
  INTERVAL: "Interval",
  RECOVERY: "Recover",
  REST: "Rest",
  COOLDOWN: "Cool down",
  MAIN: "Main set",
};

/** Repeats unrolled into the steps as an athlete runs them. */
export function expandSteps(steps: Step[]): PlannedStep[] {
  const out: PlannedStep[] = [];
  for (const s of steps) {
    if (s.kind === "repeat") {
      for (let i = 1; i <= s.times; i++) {
        for (const inner of expandSteps(s.steps)) out.push({ ...inner, rep: `${i} of ${s.times}` });
      }
    } else {
      out.push({ label: INTENSITY_LABEL[s.intensity] ?? s.intensity, intensity: s.intensity, duration: s.duration, target: s.target });
    }
  }
  return out;
}

/** Combines several laps into one (weighted by time). */
function merge(laps: Lap[]): ComparedStep["actual"] {
  const time = laps.reduce((a, l) => a + (l.duration_s ?? 0), 0);
  const weighted = (key: "avg_hr" | "avg_speed" | "avg_power") => {
    const parts = laps.filter((l) => l[key] !== null && l.duration_s);
    const t = parts.reduce((a, l) => a + l.duration_s!, 0);
    return t ? Number((parts.reduce((a, l) => a + l[key]! * l.duration_s!, 0) / t).toFixed(3)) : null;
  };
  const dist = laps.reduce((a, l) => a + (l.distance_m ?? 0), 0);
  return { duration_s: time || null, distance_m: dist || null, avg_hr: weighted("avg_hr"), avg_speed: weighted("avg_speed"), avg_power: weighted("avg_power") };
}

/**
 * Lines laps up with the planned steps: one lap per step, or consecutive laps sharing a
 * workout step index merged. Null when they can't be matched with confidence.
 */
export function alignLaps(planned: PlannedStep[], laps: Lap[]): ComparedStep["actual"][] | null {
  if (!planned.length || !laps.length) return null;
  if (laps.length === planned.length) return laps.map((l) => merge([l]));
  if (laps.every((l) => l.step_index !== null)) {
    const groups: Lap[][] = [];
    for (const l of laps) {
      const last = groups[groups.length - 1];
      if (last && last[0].step_index === l.step_index) last.push(l);
      else groups.push([l]);
    }
    if (groups.length === planned.length) return groups.map(merge);
  }
  return null;
}

/** The target as a range in a measurable unit (bpm, m/s, W). */
export function targetRange(
  t: Target | undefined,
  maxHr: number | null,
  pool: Pool = null,
): { kind: "hr" | "pace" | "power"; range: [number, number] } | null {
  if (!t) return null;
  switch (t.type) {
    case "hr_range":
      return { kind: "hr", range: [t.low, t.high] };
    case "hr_zone": {
      if (!maxHr) return null;
      const z: Zone = hrZones(maxHr)[t.zone - 1];
      return { kind: "hr", range: [z.low ?? Math.round(maxHr * 0.5), z.high ?? maxHr] };
    }
    case "pace_range":
      return { kind: "pace", range: [1000 / t.slowSecPerKm, 1000 / t.fastSecPerKm] };
    case "power_range":
      return { kind: "power", range: [t.low, t.high] };
    case "swim_pace": {
      const speed = hundredMeters(pool) / t.secPer100;
      return { kind: "pace", range: [speed, speed] };
    }
    case "swim_effort":
      return null; // an effort word can't be measured
  }
}

/** "over" means harder than planned (higher HR or power, faster pace). */
export function judge(value: number | null, range: [number, number] | null): Verdict {
  if (value === null || !range) return null;
  const [low, high] = range;
  if (value > high * (1 + SLACK)) return "over";
  if (value < low * (1 - SLACK)) return "under";
  return "on";
}

export function compareWorkout(steps: Step[], laps: Lap[], maxHr: number | null, pool: Pool = null): ComparedStep[] | null {
  const planned = expandSteps(steps);
  const actual = alignLaps(planned, laps);
  if (!actual) return null;
  return planned.map((p, i) => {
    const t = targetRange(p.target, maxHr, pool);
    const a = actual[i];
    const measured = !t ? null : t.kind === "hr" ? a.avg_hr : t.kind === "pace" ? a.avg_speed : a.avg_power;
    return { planned: p, actual: a, measured, range: t?.range ?? null, verdict: judge(measured, t?.range ?? null) };
  });
}

// ---------------------------------------------------------------- how well the plan was followed

export type Compliance = { judged: number; on: number; over: number; under: number; steps: number };

/** Counts across the steps that had a measurable target (warm-ups without one aren't judged). */
export function complianceOf(c: ComparedStep[] | null): Compliance | null {
  if (!c) return null;
  const judged = c.filter((s) => s.verdict);
  return {
    steps: c.length,
    judged: judged.length,
    on: judged.filter((s) => s.verdict === "on").length,
    over: judged.filter((s) => s.verdict === "over").length,
    under: judged.filter((s) => s.verdict === "under").length,
  };
}

/** "4 of 5 on target" (null when nothing had a target). */
export function complianceText(k: Compliance | null): string | null {
  if (!k || !k.judged) return null;
  return k.on === k.judged ? `All ${k.judged} on target` : `${k.on} of ${k.judged} on target`;
}

const MILE = 1609.344;

/**
 * How far off a step was, from the nearest edge of the target: "8 s/mi slow", "12 W high",
 * "6 bpm high", "3 s/100yd fast". Null when on target or not measurable.
 */
export function missText(c: ComparedStep, units: "mi" | "km", pool: Pool = null, swim = false): string | null {
  if (!c.verdict || c.verdict === "on" || c.measured === null || !c.range) return null;
  const [low, high] = c.range;
  const edge = c.verdict === "over" ? high : low;
  const t = c.planned.target;
  if (t?.type === "power_range") return `${Math.round(Math.abs(c.measured - edge))} W ${c.verdict === "over" ? "high" : "low"}`;
  if (t?.type === "hr_range" || t?.type === "hr_zone") return `${Math.round(Math.abs(c.measured - edge))} bpm ${c.verdict === "over" ? "high" : "low"}`;
  // Pace: compare seconds per unit distance (faster = over).
  const per = swim ? hundredMeters(pool) : units === "mi" ? MILE : 1000;
  const diff = Math.round(Math.abs(per / c.measured - per / edge));
  if (!diff) return null;
  const unit = swim ? `/100${pool?.unit === "YARD" ? "yd" : "m"}` : `/${units}`;
  return `${diff} s${unit} ${c.verdict === "over" ? "fast" : "slow"}`;
}
