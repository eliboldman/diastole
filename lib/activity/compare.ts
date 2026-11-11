// Planned vs completed, per interval. Pure module (testable with `node`).
import { hundredMeters, type Duration, type Intensity, type Pool, type Step, type Target } from "../workouts/garmin-format.ts";
import type { Lap, Streams } from "./fit.ts";
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

/** A step's planned length in seconds or meters, when it has one. */
function plannedSize(p: PlannedStep): { s?: number; m?: number } {
  const d = p.duration;
  if (d.type === "time" || d.type === "sendoff") return { s: d.seconds };
  if (d.type === "distance") return { m: d.meters };
  return {};
}

/** Groups consecutive laps that share a workout step index (auto-laps inside one step). */
function byStepIndex(laps: Lap[]): Lap[][] | null {
  if (!laps.every((l) => l.step_index !== null)) return null;
  const groups: Lap[][] = [];
  for (const l of laps) {
    const last = groups[groups.length - 1];
    if (last && last[0].step_index === l.step_index) last.push(l);
    else groups.push([l]);
  }
  return groups;
}

/**
 * Laps outside the workout: a sliver at the very start, and anything recorded after the last step
 * finished (the watch keeps a new lap running until the athlete saves). Only trims laps that are
 * short next to the planned steps, so a real step is never dropped.
 */
function trimExtras(planned: PlannedStep[], laps: Lap[]): Lap[] {
  const out = [...laps];
  const lastPlan = plannedSize(planned[planned.length - 1]).s ?? 600;
  while (out.length > 1 && (out[0].duration_s ?? 0) < 15) out.shift();
  while (out.length > planned.length && (out[out.length - 1].duration_s ?? 0) <= Math.max(120, lastPlan * 0.25)) out.pop();
  // Laps whose step index points past the workout (or is missing after indexed laps) come after it.
  if (out.some((l) => l.step_index !== null)) {
    while (out.length > planned.length && out[out.length - 1].step_index === null) out.pop();
  }
  return out;
}

/**
 * Assigns laps to steps by when they happened: each lap goes to the step its middle falls in,
 * measured on the plan's own clock (time steps) or distance (distance steps). Accepted only when
 * every step gets laps and the lap edges land close to the planned edges.
 */
function byPlannedClock(planned: PlannedStep[], laps: Lap[]): Lap[][] | null {
  const sizes = planned.map(plannedSize);
  const useTime = sizes.every((z) => z.s);
  const useDist = !useTime && sizes.every((z) => z.m) && laps.every((l) => l.distance_m);
  if (!useTime && !useDist) return null;
  const size = (i: number) => (useTime ? sizes[i].s! : sizes[i].m!);
  const len = (l: Lap) => (useTime ? (l.duration_s ?? 0) : (l.distance_m ?? 0));
  const edges: number[] = [];
  let acc = 0;
  for (let i = 0; i < planned.length; i++) edges.push((acc += size(i)));
  const groups: Lap[][] = planned.map(() => []);
  let pos = 0;
  for (const l of laps) {
    const mid = pos + len(l) / 2;
    pos += len(l);
    const i = edges.findIndex((e) => mid < e);
    if (i === -1) {
      // Past the end of the plan: part of the last step if it ran a little long, otherwise unmatched.
      if (mid - acc > Math.max(60, size(planned.length - 1) * 0.3)) return null;
      groups[planned.length - 1].push(l);
    } else groups[i].push(l);
  }
  if (groups.some((g) => !g.length)) return null;
  // Each step's laps should add up to about what was planned.
  const ok = groups.every((g, i) => {
    const got = g.reduce((a, l) => a + len(l), 0);
    return Math.abs(got - size(i)) <= Math.max(useTime ? 30 : 100, size(i) * 0.2);
  });
  return ok ? groups : null;
}

/**
 * Lines laps up with the planned steps: one lap per step, consecutive laps sharing a workout step
 * index merged, or laps placed by the plan's clock. Null when they can't be matched with confidence.
 */
export function alignLaps(planned: PlannedStep[], laps: Lap[]): ComparedStep["actual"][] | null {
  if (!planned.length || !laps.length) return null;
  if (laps.length === planned.length) return laps.map((l) => merge([l]));
  const trimmed = trimExtras(planned, laps);
  if (trimmed.length === planned.length) return trimmed.map((l) => merge([l]));
  for (const set of [laps, trimmed]) {
    const groups = byStepIndex(set);
    if (groups?.length === planned.length) return groups.map(merge);
  }
  const clocked = byPlannedClock(planned, trimmed);
  return clocked ? clocked.map(merge) : null;
}

/**
 * Last resort when laps don't help (one lap for the whole session, or the watch's laps ignore the
 * steps): cut the recording itself at the planned step lengths, counting only moving time.
 * Needs every step to have a length (an open-ended step only at the end) and the session to have
 * covered most of the plan.
 */
export function sliceStreams(planned: PlannedStep[], streams: Streams | null): ComparedStep["actual"][] | null {
  if (!streams?.t?.length || !planned.length) return null;
  const sizes = planned.map(plannedSize);
  const open = sizes.findIndex((z) => z.s === undefined && z.m === undefined);
  if (open !== -1 && open !== planned.length - 1) return null;
  if (sizes.some((z) => z.m !== undefined) && !streams.dist) return null;
  const n = streams.t.length;
  const step = streams.interval_s || 1;
  // Moving clock and distance at each sample (pauses leave gaps in t; they don't count).
  const clock: number[] = [];
  let c = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) c += Math.min(streams.t[i] - streams.t[i - 1], step);
    clock.push(c);
  }
  const dist = streams.dist ?? null;
  let distBase = 0;
  const cuts: [number, number][] = [];
  let from = 0;
  for (let k = 0; k < planned.length; k++) {
    const z = sizes[k];
    let to = n;
    if (z.s !== undefined) {
      const target = clock[from] + z.s;
      to = from;
      while (to < n && clock[to] < target) to++;
    } else if (z.m !== undefined && dist) {
      const startD = from > 0 ? (dist[from - 1] ?? distBase) : 0;
      distBase = startD;
      to = from;
      while (to < n && ((dist[to] ?? startD) - startD) < z.m) to++;
    }
    if (to <= from) return null;
    cuts.push([from, to]);
    from = to;
    if (from >= n && k < planned.length - 1) return null; // ran out before the plan did
  }
  const lastCut = cuts[cuts.length - 1];
  const covered = clock[Math.min(lastCut[1], n) - 1] - clock[cuts[0][0]];
  const plannedTotal = sizes.reduce((a, z) => a + (z.s ?? 0), 0);
  if (plannedTotal && covered < plannedTotal * 0.8) return null;
  const avg = (key: "hr" | "speed" | "power", a: number, b: number) => {
    const xs = streams[key]?.slice(a, b).filter((v): v is number => v !== null && (key === "speed" || v > 0));
    return xs?.length ? Number((xs.reduce((x, y) => x + y, 0) / xs.length).toFixed(3)) : null;
  };
  return cuts.map(([a, b]) => {
    const d = dist ? (dist[b - 1] ?? 0) - (a > 0 ? (dist[a - 1] ?? 0) : 0) : null;
    return {
      duration_s: Math.round(clock[b - 1] - clock[a] + step) || null,
      distance_m: d && d > 0 ? Math.round(d) : null,
      avg_hr: avg("hr", a, b),
      avg_speed: avg("speed", a, b),
      avg_power: avg("power", a, b),
    };
  });
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

export type MatchMethod = "laps" | "time";

/** Planned vs done per step, and whether laps matched or the recording was cut at the planned times. */
export function compareWorkoutWith(
  steps: Step[],
  laps: Lap[],
  maxHr: number | null,
  pool: Pool = null,
  streams: Streams | null = null,
): { steps: ComparedStep[]; method: MatchMethod } | null {
  const planned = expandSteps(steps);
  let method: MatchMethod = "laps";
  let actual = laps.length ? alignLaps(planned, laps) : null;
  if (!actual) {
    actual = sliceStreams(planned, streams);
    method = "time";
  }
  if (!actual) return null;
  const done = actual;
  return {
    method,
    steps: planned.map((p, i) => {
      const t = targetRange(p.target, maxHr, pool);
      const a = done[i];
      const measured = !t ? null : t.kind === "hr" ? a.avg_hr : t.kind === "pace" ? a.avg_speed : a.avg_power;
      return { planned: p, actual: a, measured, range: t?.range ?? null, verdict: judge(measured, t?.range ?? null) };
    }),
  };
}

export function compareWorkout(steps: Step[], laps: Lap[], maxHr: number | null, pool: Pool = null, streams: Streams | null = null): ComparedStep[] | null {
  return compareWorkoutWith(steps, laps, maxHr, pool, streams)?.steps ?? null;
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
