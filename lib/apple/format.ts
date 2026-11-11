// Converts Diastole's workout steps into a simple shape the iPhone app turns into an Apple
// WorkoutKit custom workout (which then shows up in the Workout app on the athlete's Apple Watch).
// Pure module (type imports only) so it can be tested directly with `node`.
//
// WorkoutKit's shape is: optional warmup, blocks (each a list of work/recovery steps repeated N
// times), optional cooldown. Repeats inside repeats don't exist there, so inner repeats are expanded.

import { inferPool, type Duration, type Pool, type Step, type Target } from "../workouts/garmin-format.ts";

const YARD = 0.9144; // garmin-format's YARD (kept local: this module only imports types)

// yards: set for swims in a yard pool, so the watch shows "100 yd" rather than "91.4 m" (meters
// stays for app builds that don't read it).
export type AppleGoal = { type: "time"; seconds: number } | { type: "distance"; meters: number; yards?: number } | { type: "open" };
export type AppleAlert =
  | { type: "hrZone"; zone: number }
  | { type: "hr"; low: number; high: number }
  | { type: "speed"; low: number; high: number } // metres per second
  | { type: "power"; low: number; high: number };
export type AppleStep = { goal: AppleGoal; alert?: AppleAlert; name?: string };
export type AppleInterval = AppleStep & { purpose: "work" | "recovery" };
export type AppleBlock = { iterations: number; steps: AppleInterval[] };
export type AppleWorkout = {
  id: string;
  date: string; // YYYY-MM-DD, the athlete's day
  time?: string; // HH:MM local, when the coach planned it (else the app picks 6 am)
  title: string;
  activity: "running" | "cycling" | "swimming";
  location: "outdoor" | "indoor";
  pool?: { length: number; unit: "m" | "yd" };
  warmup?: AppleStep;
  blocks: AppleBlock[];
  cooldown?: AppleStep;
};

const ACTIVITY: Record<string, AppleWorkout["activity"]> = { run: "running", bike: "cycling", swim: "swimming" };
const MAX_STEPS = 60; // keep one workout a sensible size on the watch

function goal(d: Duration): AppleGoal {
  if (d.type === "time" || d.type === "sendoff") return d.seconds > 0 ? { type: "time", seconds: Math.round(d.seconds) } : { type: "open" };
  if (d.type === "distance") return d.meters > 0 ? { type: "distance", meters: Math.round(d.meters * 10) / 10 } : { type: "open" };
  return { type: "open" };
}

function alert(t: Target | undefined): AppleAlert | undefined {
  if (!t) return undefined;
  switch (t.type) {
    case "hr_zone":
      return { type: "hrZone", zone: t.zone };
    case "hr_range":
      return t.low > 0 && t.high >= t.low ? { type: "hr", low: Math.round(t.low), high: Math.round(t.high) } : undefined;
    case "pace_range": {
      if (!(t.slowSecPerKm > 0 && t.fastSecPerKm > 0)) return undefined;
      const low = 1000 / Math.max(t.slowSecPerKm, t.fastSecPerKm);
      const high = 1000 / Math.min(t.slowSecPerKm, t.fastSecPerKm);
      return { type: "speed", low: Math.round(low * 1000) / 1000, high: Math.round(high * 1000) / 1000 };
    }
    case "power_range":
      return t.low > 0 && t.high >= t.low ? { type: "power", low: Math.round(t.low), high: Math.round(t.high) } : undefined;
    default:
      return undefined; // swim effort / swim pace: no matching Apple alert; the step still runs
  }
}

function name(s: Extract<Step, { kind: "step" }>): string | undefined {
  const n = s.note?.trim();
  return n ? n.slice(0, 60) : undefined;
}

type Flat = Extract<Step, { kind: "step" }>;
const flatten = (steps: Step[]): Flat[] => steps.flatMap((s) => (s.kind === "step" ? [s] : Array.from({ length: Math.max(1, s.times) }, () => flatten(s.steps)).flat()));
const interval = (s: Flat): AppleInterval => ({
  purpose: s.intensity === "RECOVERY" || s.intensity === "REST" ? "recovery" : "work",
  goal: goal(s.duration),
  ...(alert(s.target) ? { alert: alert(s.target) } : {}),
  ...(name(s) ? { name: name(s) } : {}),
});
const single = (s: Flat): AppleStep => ({ goal: goal(s.duration), ...(alert(s.target) ? { alert: alert(s.target) } : {}), ...(name(s) ? { name: name(s) } : {}) });

/** Null when the sport isn't one Apple's Workout app can run as a custom workout. */
export function toAppleWorkout(w: { id: string; date: string; title: string; sport: string; steps: Step[]; pool?: Pool; time?: string | null }): AppleWorkout | null {
  const activity = ACTIVITY[w.sport];
  if (!activity) return null;
  if (activity === "swimming") w = { ...w, pool: inferPool(w.steps ?? [], w.pool ?? null) };
  const steps = [...(w.steps ?? [])];

  const first = steps[0];
  const warmup = first?.kind === "step" && first.intensity === "WARMUP" ? single(first) : undefined;
  if (warmup) steps.shift();
  const last = steps[steps.length - 1];
  const cooldown = last?.kind === "step" && last.intensity === "COOLDOWN" ? single(last) : undefined;
  if (cooldown) steps.pop();

  // Each repeat becomes a block; runs of plain steps between repeats become one block done once.
  const blocks: AppleBlock[] = [];
  let run: AppleInterval[] = [];
  const flush = () => {
    if (run.length) blocks.push({ iterations: 1, steps: run });
    run = [];
  };
  for (const s of steps) {
    if (s.kind === "step") run.push(interval(s));
    else {
      flush();
      const inner = flatten(s.steps).map(interval);
      if (inner.length) blocks.push({ iterations: Math.min(99, Math.max(1, s.times)), steps: inner });
    }
  }
  flush();

  // Trim very long workouts rather than fail to schedule them.
  let budget = MAX_STEPS;
  const kept: AppleBlock[] = [];
  for (const b of blocks) {
    if (budget <= 0) break;
    const take = b.steps.slice(0, budget);
    budget -= take.length;
    kept.push({ ...b, steps: take });
  }
  if (!warmup && !cooldown && !kept.length) return null;

  if (activity === "swimming" && w.pool?.unit === "YARD") {
    const yd = (st: AppleStep) => {
      if (st.goal.type === "distance") st.goal = { ...st.goal, yards: Math.round(st.goal.meters / YARD) };
    };
    [warmup, cooldown].forEach((st) => st && yd(st));
    kept.forEach((b) => b.steps.forEach(yd));
  }

  return {
    id: w.id,
    date: w.date,
    ...(w.time && /^\d{2}:\d{2}/.test(w.time) ? { time: w.time.slice(0, 5) } : {}),
    title: w.title.slice(0, 60) || "Workout",
    activity,
    location: "outdoor",
    ...(activity === "swimming" && w.pool ? { pool: { length: w.pool.length, unit: w.pool.unit === "YARD" ? ("yd" as const) : ("m" as const) } } : {}),
    ...(warmup ? { warmup } : {}),
    blocks: kept,
    ...(cooldown ? { cooldown } : {}),
  };
}

