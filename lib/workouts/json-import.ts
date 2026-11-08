// Workouts from JSON, for the athlete's "Import" (often written by an AI chat from the prompt in
// WORKOUT_JSON_PROMPT). A friendly step format, plus Garmin Connect exports. Pure, for tests.
import { leafToStep, type AiLeaf } from "./ai-steps.ts";
import { fromConnectWorkout } from "./connect-import.ts";
import { validateSteps, type Pool, type Sport, type Step } from "./garmin-format.ts";

export type ImportedWorkout = { title: string; sport: Sport; date: string | null; description: string | null; pool: Pool; steps: Step[] };
export type JsonImport = { workouts: ImportedWorkout[]; errors: string[] };

type J = Record<string, unknown>;
const obj = (v: unknown): J => (v && typeof v === "object" && !Array.isArray(v) ? (v as J) : {});
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const INTENSITY: Record<string, string> = {
  warmup: "WARMUP", "warm-up": "WARMUP", warm_up: "WARMUP",
  run: "ACTIVE", ride: "ACTIVE", active: "ACTIVE", work: "ACTIVE", steady: "ACTIVE",
  interval: "INTERVAL", rep: "INTERVAL", hard: "INTERVAL",
  recovery: "RECOVERY", recover: "RECOVERY", easy: "RECOVERY", jog: "RECOVERY",
  rest: "REST",
  cooldown: "COOLDOWN", "cool-down": "COOLDOWN", cool_down: "COOLDOWN",
  main: "MAIN", swim: "MAIN",
};

/** "10:00", "1:05:00", 600 → seconds. */
function seconds(v: unknown): number | null {
  if (typeof v === "number" && v > 0) return Math.round(v);
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(str(v));
  if (m) return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  const min = /^(\d+(?:\.\d+)?)\s*min/i.exec(str(v));
  return min ? Math.round(Number(min[1]) * 60) : null;
}
/** "400m", "1.5 mi", "500yd", "5 km" → [number, unit]. */
function distance(v: unknown): [number, "m" | "km" | "yd" | "mi"] | null {
  if (typeof v === "number" && v > 0) return [v, "m"];
  const m = /^(\d+(?:\.\d+)?)\s*(m|meters?|km|k|yd|yards?|mi|miles?)$/i.exec(str(v));
  if (!m) return null;
  const u = m[2].toLowerCase();
  return [Number(m[1]), u.startsWith("km") || u === "k" ? "km" : u.startsWith("y") ? "yd" : u.startsWith("mi") ? "mi" : "m"];
}
/** "7:00-7:15" → [fast, slow]; "200-220" → numbers. */
const range = (v: unknown) => str(v).split(/\s*(?:-|–|to)\s*/).filter(Boolean);

function leaf(raw: J, sport: Sport): AiLeaf {
  // Already in the builder's full format.
  if (typeof raw.duration_type === "string") return { ...EMPTY, ...(raw as Partial<AiLeaf>), kind: "step" } as AiLeaf;
  const out: AiLeaf = { ...EMPTY, intensity: INTENSITY[str(raw.type).toLowerCase()] ?? (sport === "swim" ? "MAIN" : "ACTIVE") };
  const t = seconds(raw.time ?? raw.duration);
  const d = distance(raw.distance);
  if (t) Object.assign(out, { duration_type: str(raw.type).toLowerCase() === "sendoff" ? "sendoff" : "time", seconds: t });
  else if (d) Object.assign(out, { duration_type: "distance", distance: d[0], distance_unit: d[1] });
  if (raw.pace) {
    const [a, b] = range(raw.pace);
    Object.assign(out, sport === "swim" ? { target_type: "swim_pace", swim_pace_per_100: a } : { target_type: "pace_range", pace_fast: a, pace_slow: b ?? a });
  } else if (raw.hr_zone) Object.assign(out, { target_type: "hr_zone", hr_zone: Number(raw.hr_zone) });
  else if (raw.heart_rate) {
    const [a, b] = range(raw.heart_rate).map(Number);
    Object.assign(out, { target_type: "hr_range", low: a, high: b ?? a });
  } else if (raw.power) {
    const pct = str(raw.power).includes("%");
    const [a, b] = range(String(raw.power).replace(/%|w/gi, "")).map(Number);
    Object.assign(out, { target_type: pct ? "power_pct_ftp" : "power_watts", low: a, high: b ?? a });
  } else if (raw.effort) Object.assign(out, { target_type: "swim_effort", swim_effort: Number(raw.effort) });
  if (raw.stroke) out.stroke = str(raw.stroke).toUpperCase();
  if (raw.drill) out.drill = str(raw.drill).toUpperCase();
  if (raw.equipment) out.equipment = str(raw.equipment).toUpperCase();
  if (raw.note) out.note = str(raw.note).slice(0, 60);
  return out;
}
const EMPTY: AiLeaf = {
  kind: "step", intensity: "ACTIVE", duration_type: "open", seconds: null, distance: null, distance_unit: null, target_type: "none",
  hr_zone: null, low: null, high: null, pace_fast: null, pace_slow: null, swim_effort: null, swim_pace_per_100: null, stroke: null, drill: null, equipment: null, note: null,
};

function poolOf(v: unknown): Pool {
  const o = obj(v);
  if (o.length && o.unit) return { length: Number(o.length), unit: /y/i.test(str(o.unit)) ? "YARD" : "METER" };
  const m = /^(\d+)\s*(m|yd|y|meters?|yards?)$/i.exec(str(v));
  return m ? { length: Number(m[1]), unit: m[2].toLowerCase().startsWith("y") ? "YARD" : "METER" } : null;
}

/** Parse pasted or uploaded JSON. `ftp` turns "% of FTP" into watts. At most 60 workouts. */
export function parseWorkoutJson(text: string, ctx: { paceUnit: "mi" | "km"; ftp: number | null }): JsonImport {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { workouts: [], errors: ["That isn't valid JSON. Check for a missing comma or bracket."] };
  }
  const list = Array.isArray(data) ? data : Array.isArray(obj(data).workouts) ? (obj(data).workouts as unknown[]) : [data];
  const workouts: ImportedWorkout[] = [];
  const errors: string[] = [];
  list.slice(0, 60).forEach((raw, i) => {
    const w = obj(raw);
    const label = str(w.title) || str(w.workoutName) || `Workout ${i + 1}`;
    try {
      if (Array.isArray(w.workoutSegments)) {
        const c = fromConnectWorkout(w);
        workouts.push({ title: c.title, sport: c.sport, date: null, description: c.description, pool: c.pool, steps: c.steps });
        return;
      }
      const sportText = str(w.sport).toLowerCase();
      const sport: Sport | null = /swim/.test(sportText) ? "swim" : /bik|cycl|ride/.test(sportText) ? "bike" : /run/.test(sportText) ? "run" : null;
      if (!sport) throw new Error("sport must be run, bike or swim");
      const pool = sport === "swim" ? (poolOf(w.pool) ?? { length: 25, unit: "YARD" }) : null;
      const sctx = { paceUnit: /km/i.test(str(w.pace_unit)) ? ("km" as const) : str(w.pace_unit) ? ("mi" as const) : ctx.paceUnit, ftp: ctx.ftp, pool };
      if (!Array.isArray(w.steps) || !w.steps.length) throw new Error("it has no steps");
      const steps: Step[] = (w.steps as unknown[]).map((x) => {
        const s = obj(x);
        const times = Number(s.repeat ?? s.times);
        if (Array.isArray(s.steps) && times) return { kind: "repeat", times: Math.round(times), steps: (s.steps as unknown[]).map((c) => leafToStep(leaf(obj(c), sport), sctx)) };
        return leafToStep(leaf(s, sport), sctx);
      });
      const problems = validateSteps(steps, 0, sport, pool);
      if (problems.length) throw new Error([...new Set(problems)].slice(0, 2).join(" "));
      const date = /^\d{4}-\d{2}-\d{2}$/.test(str(w.date)) ? str(w.date) : null;
      workouts.push({ title: label.slice(0, 100), sport, date, description: str(w.description).slice(0, 1024) || null, pool, steps });
    } catch (e) {
      errors.push(`${label}: ${(e as Error).message}`);
    }
  });
  if (list.length > 60) errors.push("Only the first 60 workouts were read.");
  return { workouts, errors };
}

/** What athletes paste into an AI chat so it writes JSON this importer reads. */
export const WORKOUT_JSON_PROMPT = `Write my workouts as JSON for the Diastole app. Reply with only the JSON, in this exact format:

{
  "workouts": [
    {
      "title": "6 x 800 m at 5K pace",
      "sport": "run",
      "date": "2026-12-01",
      "description": "Optional note to myself",
      "steps": [
        { "type": "warmup", "time": "15:00", "hr_zone": 2 },
        { "repeat": 6, "steps": [
          { "type": "interval", "distance": "800m", "pace": "6:10-6:20" },
          { "type": "recovery", "time": "2:00" }
        ] },
        { "type": "cooldown", "time": "10:00" }
      ]
    }
  ]
}

Rules:
- sport: "run", "bike" or "swim". date (optional): YYYY-MM-DD.
- Step type: warmup, active, interval, recovery, rest, cooldown (swims: main).
- Each step has a "time" ("10:00" or "1:05:00") or a "distance" ("400m", "1 mi", "5 km", "100yd"). Leave both out for "until I press lap".
- One optional target per step: "pace" ("7:00-7:15" per mile, or per km if you add "pace_unit": "km" to the workout), "hr_zone" (1-5), "heart_rate" ("140-150"), "power" ("200-220" watts or "88-94%" of FTP), or "effort" (1-10, swims).
- Repeats: { "repeat": N, "steps": [...] }, not nested inside other repeats.
- Swims: add "pool": "25yd" (or "25m", "50m") to the workout; distances are whole pool lengths; optional "stroke" (freestyle, backstroke, breaststroke, butterfly, im), "drill" (kick, pull).
- Optional "note" on a step: a short cue for the watch.`;
