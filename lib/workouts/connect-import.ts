// Converts a workout exported from Garmin Connect (its own JSON, not the Training API format)
// into Diastole's workout format, so existing workouts can be added to the library.
// Pure module (no imports besides types) so it can be tested directly with `node`.
import { validateSteps, YARD, type Drill, type Duration, type Equipment, type Intensity, type Pool, type Sport, type Step, type Stroke, type SwimEffort, type Target } from "./garmin-format.ts";

type J = Record<string, unknown>;
const obj = (v: unknown): J => (v && typeof v === "object" ? (v as J) : {});
const key = (v: unknown, k: string) => {
  const x = obj(v)[k];
  return typeof x === "string" ? x : null;
};
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

const SPORT: Record<string, Sport> = { running: "run", trail_running: "run", treadmill_running: "run", cycling: "bike", swimming: "swim", lap_swimming: "swim" };
const STEP: Record<string, Intensity> = { warmup: "WARMUP", cooldown: "COOLDOWN", interval: "INTERVAL", recovery: "RECOVERY", rest: "REST", active: "ACTIVE", main: "MAIN", other: "ACTIVE" };
const STROKE: Record<string, Stroke> = {
  free: "FREESTYLE",
  freestyle: "FREESTYLE",
  backstroke: "BACKSTROKE",
  breaststroke: "BREASTSTROKE",
  fly: "BUTTERFLY",
  butterfly: "BUTTERFLY",
  im: "IM",
  rimo: "RIMO",
  mixed: "MIXED",
  any_stroke: "CHOICE",
  choice: "CHOICE",
};
const EQUIP: Record<string, Equipment> = { fins: "SWIM_FINS", kickboard: "SWIM_KICKBOARD", paddles: "SWIM_PADDLES", pull_buoy: "SWIM_PULL_BUOY", snorkel: "SWIM_SNORKEL" };
const DRILL: Record<string, Drill> = { kick: "KICK", pull: "PULL" };
const UNIT_M: Record<string, number> = { meter: 1, kilometer: 1000, yard: YARD, mile: 1609.344 };
// Training-API-style names, used by some hand-written workout files.
const API_STROKE: Record<string, Stroke> = {
  FREE: "FREESTYLE",
  FREESTYLE: "FREESTYLE",
  BACK: "BACKSTROKE",
  BACKSTROKE: "BACKSTROKE",
  BREAST: "BREASTSTROKE",
  BREASTSTROKE: "BREASTSTROKE",
  FLY: "BUTTERFLY",
  BUTTERFLY: "BUTTERFLY",
  IM: "IM",
  RIMO: "RIMO",
  MIXED: "MIXED",
  CHOICE: "CHOICE",
  ANY: "CHOICE",
};
const API_EQUIP = new Set(["SWIM_FINS", "SWIM_KICKBOARD", "SWIM_PADDLES", "SWIM_PULL_BUOY", "SWIM_SNORKEL"]);
const API_INTENSITY = new Set(["WARMUP", "COOLDOWN", "INTERVAL", "RECOVERY", "REST", "ACTIVE", "MAIN"]);

export type ConnectImport = { title: string; description: string | null; sport: Sport; pool: Pool; steps: Step[]; skipped: string[] };

export function fromConnectWorkout(raw: unknown): ConnectImport {
  const w = obj(raw);
  const sportKey = key(w.sportType, "sportTypeKey") ?? "";
  const sport = SPORT[sportKey];
  if (!sport) throw new Error(`Diastole can import run, bike and swim workouts; this one is "${sportKey || "unknown"}".`);
  const title = typeof w.workoutName === "string" && w.workoutName.trim() ? w.workoutName.trim().slice(0, 100) : "Imported workout";
  const description = typeof w.description === "string" && w.description.trim() ? w.description.trim().slice(0, 1024) : null;

  const poolUnit = key(w.poolLengthUnit, "unitKey");
  const poolLength = num(w.poolLength);
  const pool: Pool =
    sport === "swim" && poolLength && (poolUnit === "yard" || poolUnit === "meter") ? { length: poolLength, unit: poolUnit === "yard" ? "YARD" : "METER" } : null;

  const skipped: string[] = [];
  const note = (msg: string) => {
    if (!skipped.includes(msg)) skipped.push(msg);
  };

  const distance = (s: J): number | null => {
    const v = num(s.endConditionValue);
    if (v === null) return null;
    // Swims are stored in the step's unit (or the pool's); runs and rides in metres.
    const unit = key(s.preferredEndConditionUnit, "unitKey") ?? (sport === "swim" ? (poolUnit ?? "meter") : "meter");
    return Number((v * (UNIT_M[unit] ?? 1)).toFixed(2));
  };

  const target = (s: J): Target | undefined => {
    const type = key(s.targetType, "workoutTargetTypeKey");
    const one = num(s.targetValueOne);
    const two = num(s.targetValueTwo);
    const zone = num(s.zoneNumber);
    if (sport === "swim") {
      const sec = key(s.secondaryTargetType, "workoutTargetTypeKey");
      const lo = num(s.secondaryTargetValueOne);
      if (sec === "swim.instruction" && lo !== null && lo >= 1 && lo <= 10) return { type: "swim_effort", level: Math.round(lo) as SwimEffort };
      if ((sec === "pace.zone" || type === "pace.zone") && pool) {
        const speed = sec === "pace.zone" ? lo : one;
        if (speed) return { type: "swim_pace", secPer100: Math.round((pool.unit === "YARD" ? 100 * YARD : 100) / speed) };
      }
      if (sec && sec !== "no.target") note("Some swim targets couldn't be carried over.");
      return undefined;
    }
    switch (type) {
      case "heart.rate":
      case "heart.rate.zone":
        if (zone && zone >= 1 && zone <= 5) return { type: "hr_zone", zone: zone as 1 };
        if (one && two) return { type: "hr_range", low: Math.round(Math.min(one, two)), high: Math.round(Math.max(one, two)) };
        break;
      case "power":
      case "power.zone":
        if (one && two) return { type: "power_range", low: Math.round(Math.min(one, two)), high: Math.round(Math.max(one, two)) };
        if (zone) note("Power zone numbers were dropped (Diastole uses watt ranges).");
        return undefined;
      case "pace":
      case "speed":
      case "pace.zone":
      case "speed.zone":
        if (one && two) {
          // m/s; the slower speed is the slower pace.
          const slow = Math.min(one, two);
          const fast = Math.max(one, two);
          return { type: "pace_range", slowSecPerKm: Math.round(1000 / slow), fastSecPerKm: Math.round(1000 / fast) };
        }
        break;
      case null:
      case "no.target":
        return undefined;
    }
    if (type) note(`Targets of type "${type}" were dropped.`);
    return undefined;
  };

  /** Training-API-style step (intensity / durationType / durationValue as plain fields). */
  const apiStep = (s: J): Step => {
    const raw = String(s.intensity ?? "").toUpperCase();
    const intensity = (API_INTENSITY.has(raw) ? raw : "ACTIVE") as Intensity;
    const dt = String(s.durationType).toUpperCase();
    const value = num(s.durationValue) ?? 0;
    let duration: Duration = { type: "open" };
    if (dt === "DISTANCE" && value > 0) duration = { type: "distance", meters: Number((value * (UNIT_M[String(s.durationValueType ?? "").toLowerCase()] ?? 1)).toFixed(2)) };
    else if ((dt === "TIME" || dt === "FIXED_REST" || dt === "REST") && value > 0) duration = { type: "time", seconds: Math.round(value) };
    else if (dt === "FIXED_REPETITION" && value > 0) duration = { type: "sendoff", seconds: Math.round(value) };
    else if (dt !== "OPEN" && dt !== "LAP_BUTTON") note(`Steps ending on "${dt}" were turned into "until lap".`);
    const out: Extract<Step, { kind: "step" }> = { kind: "step", intensity: sport !== "swim" && intensity === "MAIN" ? "ACTIVE" : intensity, duration };
    if (typeof s.description === "string" && s.description.trim()) out.note = s.description.trim().slice(0, 512);
    if (sport === "swim" && intensity !== "REST") {
      const strokeRaw = String(s.strokeType ?? "").toUpperCase();
      if (strokeRaw === "DRILL") {
        out.stroke = "CHOICE";
        note("“Drill” strokes became “Choice” (the drill stays in the step note).");
      } else if (API_STROKE[strokeRaw]) out.stroke = API_STROKE[strokeRaw];
      const equip = String(s.equipmentType ?? "").toUpperCase();
      if (API_EQUIP.has(equip)) out.equipment = equip as Equipment;
      const drill = String(s.drillType ?? "").toUpperCase();
      if (drill === "KICK" || drill === "PULL") out.drill = drill;
    }
    return out;
  };

  const step = (s: J): Step | null => {
    if (typeof s.durationType === "string") return apiStep(s);
    const intensity = STEP[key(s.stepType, "stepTypeKey") ?? ""] ?? "ACTIVE";
    const cond = key(s.endCondition, "conditionTypeKey");
    let duration: Duration | null = null;
    if (cond === "distance") {
      const m = distance(s);
      if (m) duration = { type: "distance", meters: m };
    } else if (cond === "time") duration = { type: "time", seconds: Math.round(num(s.endConditionValue) ?? 0) };
    else if (cond === "fixed.rest") duration = { type: "time", seconds: Math.round(num(s.endConditionValue) ?? 0) };
    else if (cond === "fixed.repetition") duration = { type: "sendoff", seconds: Math.round(num(s.endConditionValue) ?? 0) };
    else if (cond === "lap.button") duration = { type: "open" };
    if (!duration || ("seconds" in duration && duration.seconds <= 0)) {
      note(`Steps ending on "${cond}" were turned into "until lap".`);
      duration = { type: "open" };
    }

    const out: Extract<Step, { kind: "step" }> = { kind: "step", intensity: sport !== "swim" && intensity === "MAIN" ? "ACTIVE" : intensity, duration };
    const t = target(s);
    if (t) out.target = t;
    if (typeof s.description === "string" && s.description.trim()) out.note = s.description.trim().slice(0, 512);
    if (sport === "swim" && intensity !== "REST") {
      const stroke = STROKE[key(s.strokeType, "strokeTypeKey") ?? ""];
      if (stroke) out.stroke = stroke;
      const equip = EQUIP[key(s.equipmentType, "equipmentTypeKey") ?? ""];
      if (equip) out.equipment = equip;
      const drill = DRILL[key(s.drillType, "drillTypeKey") ?? ""];
      if (drill) out.drill = drill;
    }
    // A timed rest in a swim stays a rest at the wall.
    if (sport === "swim" && intensity !== "REST" && cond === "fixed.rest") out.intensity = "REST";
    return out;
  };

  const convert = (list: unknown, depth: number): Step[] => {
    const out: Step[] = [];
    for (const raw of Array.isArray(list) ? list : []) {
      const s = obj(raw);
      if (s.type === "RepeatGroupDTO") {
        const times = Math.round(num(s.numberOfIterations) ?? 1);
        const inner = convert(s.workoutSteps, depth + 1);
        if (depth > 0) {
          // Diastole repeats can't nest: unroll the inner one.
          for (let i = 0; i < times; i++) out.push(...inner);
          note("Nested repeats were unrolled.");
        } else if (times < 2) out.push(...inner); // "1x" groups are just steps
        else out.push({ kind: "repeat", times: Math.min(99, times), steps: inner });
      } else {
        const one = step(s);
        if (one) out.push(one);
      }
    }
    return out;
  };

  const segments = Array.isArray(w.workoutSegments) ? w.workoutSegments : [];
  const steps = convert(segments.length ? obj(segments[0]).workoutSteps : w.workoutSteps, 0);
  if (segments.length > 1) note("Only the first segment of a multi-sport workout was imported.");
  if (!steps.length) throw new Error("That workout has no steps.");

  const problems = validateSteps(steps, 0, sport, pool);
  if (problems.length) note(`Check before sending: ${[...new Set(problems)].join(" ")}`);
  return { title, description, sport, pool, steps, skipped };
}
