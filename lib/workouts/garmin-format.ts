// Converts Diastole's simple workout format into Garmin Training API V2 JSON.
// Pure module (no imports) so it can be tested directly with `node`.
// Spec: Garmin "Training API V2", version 2.0, sections 3.1–3.2 and Appendix C (swim).

export type Intensity = "WARMUP" | "ACTIVE" | "INTERVAL" | "RECOVERY" | "REST" | "COOLDOWN" | "MAIN"; // MAIN: swim only

export type Duration =
  | { type: "time"; seconds: number }
  | { type: "distance"; meters: number }
  | { type: "open" } // until lap
  | { type: "sendoff"; seconds: number }; // swim rest steps: leave on this clock (FIXED_REPETITION)

export type Target =
  | { type: "hr_zone"; zone: 1 | 2 | 3 | 4 | 5 }
  | { type: "hr_range"; low: number; high: number } // bpm
  | { type: "pace_range"; slowSecPerKm: number; fastSecPerKm: number }
  | { type: "power_range"; low: number; high: number } // watts
  | { type: "swim_effort"; level: SwimEffort } // Garmin's text intensity for swims
  | { type: "swim_pace"; secPer100: number }; // per 100 of the pool's unit (yards or meters)

export type Stroke = "FREESTYLE" | "BACKSTROKE" | "BREASTSTROKE" | "BUTTERFLY" | "IM" | "RIMO" | "MIXED" | "CHOICE";
export type Drill = "KICK" | "PULL";
export type Equipment = "SWIM_FINS" | "SWIM_KICKBOARD" | "SWIM_PADDLES" | "SWIM_PULL_BUOY" | "SWIM_SNORKEL";
export type SwimEffort = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type Step =
  | {
      kind: "step";
      intensity: Intensity;
      duration: Duration;
      target?: Target;
      note?: string;
      // swim only
      stroke?: Stroke;
      drill?: Drill;
      equipment?: Equipment;
    }
  | { kind: "repeat"; times: number; steps: Step[] };

export type Sport = "run" | "bike" | "swim";
/** A run off the bike, carried by a bike workout (a brick). */
export type Brick = { sport: "run"; steps: Step[] } | null;
export type PoolUnit = "METER" | "YARD";
/** Null means "any pool": distances show on the watch as written, without conversion. */
export type Pool = { length: number; unit: PoolUnit } | null;

const SPORTS: Record<Sport, string> = { run: "RUNNING", bike: "CYCLING", swim: "LAP_SWIMMING" };

export const YARD = 0.9144;
export const SWIM_EFFORTS: Record<SwimEffort, string> = {
  1: "Recovery",
  2: "Very easy",
  3: "Easy",
  4: "Moderate",
  5: "Hard",
  6: "Very hard",
  7: "All out",
  8: "Fast",
  9: "Ascend",
  10: "Descend",
};
export const STROKES: Record<Stroke, string> = {
  FREESTYLE: "Free",
  BACKSTROKE: "Back",
  BREASTSTROKE: "Breast",
  BUTTERFLY: "Fly",
  IM: "IM",
  RIMO: "Reverse IM",
  MIXED: "Mixed",
  CHOICE: "Choice",
};
export const DRILLS: Record<Drill, string> = { KICK: "Kick", PULL: "Pull" };
export const EQUIPMENT: Record<Equipment, string> = {
  SWIM_FINS: "Fins",
  SWIM_KICKBOARD: "Kickboard",
  SWIM_PADDLES: "Paddles",
  SWIM_PULL_BUOY: "Pull buoy",
  SWIM_SNORKEL: "Snorkel",
};

/** Metres in one pool length, or null for "any pool". */
export const poolMeters = (pool: Pool) => (pool ? pool.length * (pool.unit === "YARD" ? YARD : 1) : null);
/** Metres in "100" of the pool's unit (100 yd or 100 m). Meters when the pool is unspecified. */
export const hundredMeters = (pool: Pool) => (pool?.unit === "YARD" ? 100 * YARD : 100);

/**
 * A swim saved without a pool whose distances are clearly yards (every one a whole number of 25 yd
 * lengths, at least one not a whole number of 25 m ones): treat it as a 25 yd pool. Without this,
 * Garmin shows a pool-less workout's numbers as written, so 100 yd (stored as 91.44 m) read "91".
 */
export function inferPool(steps: Step[], pool: Pool): Pool {
  if (pool) return pool;
  const dists: number[] = [];
  const walk = (list: Step[]) =>
    list.forEach((s) => (s.kind === "repeat" ? walk(s.steps) : s.duration.type === "distance" && s.intensity !== "REST" && dists.push(s.duration.meters)));
  walk(steps ?? []);
  if (!dists.length) return null;
  const whole = (m: number, len: number) => Math.abs(m / len - Math.round(m / len)) < 0.005;
  if (dists.every((m) => whole(m, 25 * YARD)) && dists.some((m) => !whole(m, 25))) return { length: 25, unit: "YARD" };
  return null;
}

const EMPTY_TARGET = {
  targetType: "OPEN",
  targetValue: null,
  targetValueLow: null,
  targetValueHigh: null,
  targetValueType: null,
};

const NO_SECONDARY = {
  secondaryTargetType: null,
  secondaryTargetValue: null,
  secondaryTargetValueLow: null,
  secondaryTargetValueHigh: null,
  secondaryTargetValueType: null,
};

function target(t?: Target) {
  if (!t) return EMPTY_TARGET;
  switch (t.type) {
    case "hr_zone":
      return { ...EMPTY_TARGET, targetType: "HEART_RATE", targetValue: t.zone };
    case "hr_range":
      return { ...EMPTY_TARGET, targetType: "HEART_RATE", targetValueLow: t.low, targetValueHigh: t.high };
    case "pace_range":
      // Garmin takes pace as speed in m/s; the slower pace is the lower speed.
      return {
        ...EMPTY_TARGET,
        targetType: "PACE",
        targetValueLow: 1000 / t.slowSecPerKm,
        targetValueHigh: 1000 / t.fastSecPerKm,
      };
    case "power_range":
      return { ...EMPTY_TARGET, targetType: "POWER", targetValueLow: t.low, targetValueHigh: t.high };
    default:
      return EMPTY_TARGET;
  }
}

/** Swims carry no primary target; intensity goes in the secondary target (Appendix C). */
function swimTarget(t: Target | undefined, pool: Pool) {
  const base = { ...EMPTY_TARGET, targetType: null };
  if (t?.type === "swim_effort") return { ...base, ...NO_SECONDARY, secondaryTargetType: "SWIM_INSTRUCTION", secondaryTargetValueLow: t.level };
  if (t?.type === "swim_pace")
    return { ...base, ...NO_SECONDARY, secondaryTargetType: "PACE_ZONE", secondaryTargetValueLow: hundredMeters(pool) / t.secPer100 };
  return { ...base, ...NO_SECONDARY };
}

// In a yard pool Garmin reads a step's distance as yards (it stores durationValueType "YARD" and keeps
// the number), so 274.32 m arrived as "274 yd" instead of 300. Send yards there; meters everywhere else.
function duration(d: Duration, swimRest: boolean, yards = false) {
  switch (d.type) {
    case "time":
      return { durationType: swimRest ? "FIXED_REST" : "TIME", durationValue: d.seconds, durationValueType: null };
    case "distance":
      return yards
        ? { durationType: "DISTANCE", durationValue: Math.round(d.meters / YARD), durationValueType: "YARD" }
        : { durationType: "DISTANCE", durationValue: Number(d.meters.toFixed(2)), durationValueType: "METER" };
    case "open":
      return { durationType: "OPEN", durationValue: null, durationValueType: null };
    case "sendoff":
      return { durationType: "FIXED_REPETITION", durationValue: d.seconds, durationValueType: null };
  }
}

const SWIM_ONLY_TARGETS = new Set(["swim_effort", "swim_pace"]);

export function validateSteps(steps: Step[], depth = 0, sport: Sport = "run", pool: Pool = null): string[] {
  const errors: string[] = [];
  if (!steps.length && depth === 0) errors.push("A workout needs at least one step.");
  const swim = sport === "swim";
  const lengthM = poolMeters(pool);
  for (const s of steps) {
    if (s.kind === "repeat") {
      if (depth > 0) errors.push("Repeats can't be nested.");
      if (!Number.isInteger(s.times) || s.times < 2 || s.times > 99) errors.push("Repeat count must be 2–99.");
      if (!s.steps.length) errors.push("A repeat needs at least one step.");
      errors.push(...validateSteps(s.steps, depth + 1, sport, pool));
      continue;
    }
    const d = s.duration;
    if (d.type === "time" && !(d.seconds > 0)) errors.push("Step time must be positive.");
    if (d.type === "distance" && !(d.meters > 0)) errors.push("Step distance must be positive.");
    if (s.target?.type === "hr_range" && !(s.target.low < s.target.high)) errors.push("HR range low must be below high.");
    if (s.target?.type === "pace_range" && !(s.target.fastSecPerKm < s.target.slowSecPerKm)) errors.push("Fast pace must be quicker than slow pace.");

    if (!swim) {
      if (s.intensity === "MAIN") errors.push("“Main” steps are for swims.");
      if (d.type === "sendoff") errors.push("Send-off times are for swims.");
      if (s.target && SWIM_ONLY_TARGETS.has(s.target.type)) errors.push("Swim targets are for swims.");
      if (s.stroke || s.drill || s.equipment) errors.push("Stroke, drill and equipment are for swims.");
      continue;
    }

    // Swim rules (Training API Appendix C)
    if (s.target && !SWIM_ONLY_TARGETS.has(s.target.type)) errors.push("Swim steps take an effort or pace target.");
    if (s.target?.type === "swim_pace" && !pool) errors.push("Pick a pool length to use pace targets.");
    if (s.target?.type === "swim_pace" && !(s.target.secPer100 >= 30 && s.target.secPer100 <= 600)) errors.push("Swim pace should be between 0:30 and 10:00 per 100.");
    if (s.intensity === "REST") {
      if (d.type !== "time" && d.type !== "sendoff" && d.type !== "open") errors.push("Rest steps are a time at the wall, a send-off, or until lap.");
      if (d.type === "sendoff" && !pool) errors.push("Pick a pool length to use send-off times.");
    } else {
      if (d.type === "sendoff") errors.push("Send-off times go on rest steps.");
      if (d.type === "time" && (d.seconds < 60 || d.seconds > 3540)) errors.push("Timed swim steps must be 1–59 minutes.");
      if (d.type === "distance" && lengthM) {
        const lengths = d.meters / lengthM;
        if (Math.abs(lengths - Math.round(lengths)) > 0.01 || Math.round(lengths) < 1)
          errors.push(`Swim distances must be whole lengths of the pool (${pool!.length} ${pool!.unit === "YARD" ? "yd" : "m"}).`);
      }
    }
  }
  return errors;
}

export function countSteps(steps: Step[]): number {
  return steps.reduce((n, s) => n + 1 + (s.kind === "repeat" ? countSteps(s.steps) : 0), 0);
}

export function toGarminWorkout(w: { title: string; description?: string | null; sport: Sport; steps: Step[]; pool?: Pool; brick?: Brick }) {
  const pool = w.sport === "swim" ? inferPool(w.steps, w.pool ?? null) : null;
  const brick = w.sport === "bike" && w.brick?.steps?.length ? w.brick : null;
  const errors = validateSteps(w.steps, 0, w.sport, pool);
  if (brick) errors.push(...validateSteps(brick.steps, 0, "run", null).map((e) => `Run off the bike: ${e}`));
  if (!SPORTS[w.sport]) errors.push(`Unsupported sport for Garmin: ${w.sport}`);
  if (brick) {
    if (countSteps(w.steps) + countSteps(brick.steps) > 250) errors.push("Garmin allows at most 250 steps in a multisport workout.");
  } else if (countSteps(w.steps) > 100) errors.push("Garmin allows at most 100 steps in a single-sport workout.");
  if (errors.length) throw new Error([...new Set(errors)].join(" "));

  const swim = w.sport === "swim";
  let order = 0; // stepOrder is global across nesting (see spec example JSON)
  const convert = (s: Step): Record<string, unknown> => {
    order += 1;
    if (s.kind === "repeat") {
      return {
        type: "WorkoutRepeatStep",
        stepOrder: order,
        repeatType: "REPEAT_UNTIL_STEPS_CMPLT",
        repeatValue: s.times,
        // Garmin sets this for every swim; the watch then skips the rest after the final rep.
        ...(swim ? { skipLastRestStep: true } : {}),
        steps: s.steps.map(convert),
      };
    }
    const rest = swim && s.intensity === "REST";
    return {
      type: "WorkoutStep",
      stepOrder: order,
      intensity: s.intensity,
      description: s.note?.slice(0, 512) ?? null,
      ...duration(s.duration, rest, swim && pool?.unit === "YARD"),
      ...(swim ? swimTarget(rest ? undefined : s.target, pool) : target(s.target)),
      ...(swim
        ? {
            strokeType: rest ? null : (s.stroke ?? "CHOICE"),
            drillType: rest ? null : (s.drill ?? null),
            equipmentType: rest ? null : (s.equipment ?? "NONE"),
          }
        : {}),
    };
  };

  if (brick) {
    // Multisport: one segment per sport, step numbers running on across segments, transitions on.
    const bikeSteps = w.steps.map(convert);
    const runSteps = brick.steps.map(convert);
    return {
      workoutName: w.title.slice(0, 100),
      description: w.description?.slice(0, 1024) ?? null,
      sport: "MULTI_SPORT",
      workoutProvider: "Diastole",
      workoutSourceId: "Diastole",
      isSessionTransitionEnabled: true,
      poolLength: null,
      poolLengthUnit: null,
      segments: [
        { segmentOrder: 1, sport: SPORTS.bike, poolLength: null, poolLengthUnit: null, steps: bikeSteps },
        { segmentOrder: 2, sport: SPORTS.run, poolLength: null, poolLengthUnit: null, steps: runSteps },
      ],
    };
  }

  const sport = SPORTS[w.sport];
  return {
    workoutName: w.title.slice(0, 100),
    description: w.description?.slice(0, 1024) ?? null,
    sport,
    workoutProvider: "Diastole",
    workoutSourceId: "Diastole",
    isSessionTransitionEnabled: false,
    poolLength: pool?.length ?? null,
    poolLengthUnit: pool?.unit ?? null,
    segments: [{ segmentOrder: 1, sport, poolLength: pool?.length ?? null, poolLengthUnit: pool?.unit ?? null, steps: w.steps.map(convert) }],
  };
}
