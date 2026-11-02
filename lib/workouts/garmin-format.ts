// Converts Diastole's simple workout format into Garmin Training API V2 JSON.
// Pure module (no imports) so it can be tested directly with `node`.
// Spec: Garmin "Training API V2", version 2.0, sections 3.1–3.2.

export type Intensity = "WARMUP" | "ACTIVE" | "INTERVAL" | "RECOVERY" | "REST" | "COOLDOWN";

export type Duration =
  | { type: "time"; seconds: number }
  | { type: "distance"; meters: number }
  | { type: "open" }; // until lap button

export type Target =
  | { type: "hr_zone"; zone: 1 | 2 | 3 | 4 | 5 }
  | { type: "hr_range"; low: number; high: number } // bpm
  | { type: "pace_range"; slowSecPerKm: number; fastSecPerKm: number }
  | { type: "power_range"; low: number; high: number }; // watts

export type Step =
  | { kind: "step"; intensity: Intensity; duration: Duration; target?: Target; note?: string }
  | { kind: "repeat"; times: number; steps: Step[] };

export type Sport = "run" | "bike";

const SPORTS: Record<Sport, string> = { run: "RUNNING", bike: "CYCLING" };

const EMPTY_TARGET = {
  targetType: "OPEN",
  targetValue: null,
  targetValueLow: null,
  targetValueHigh: null,
  targetValueType: null,
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
  }
}

function duration(d: Duration) {
  switch (d.type) {
    case "time":
      return { durationType: "TIME", durationValue: d.seconds, durationValueType: null };
    case "distance":
      return { durationType: "DISTANCE", durationValue: d.meters, durationValueType: "METER" };
    case "open":
      return { durationType: "OPEN", durationValue: null, durationValueType: null };
  }
}

export function validateSteps(steps: Step[], depth = 0): string[] {
  const errors: string[] = [];
  if (!steps.length) errors.push("A workout needs at least one step.");
  for (const s of steps) {
    if (s.kind === "repeat") {
      if (depth > 0) errors.push("Repeats can't be nested.");
      if (!Number.isInteger(s.times) || s.times < 2 || s.times > 99) errors.push("Repeat count must be 2–99.");
      errors.push(...validateSteps(s.steps, depth + 1));
    } else {
      if (s.duration.type === "time" && !(s.duration.seconds > 0)) errors.push("Step time must be positive.");
      if (s.duration.type === "distance" && !(s.duration.meters > 0)) errors.push("Step distance must be positive.");
      if (s.target?.type === "hr_range" && !(s.target.low < s.target.high)) errors.push("HR range low must be below high.");
      if (s.target?.type === "pace_range" && !(s.target.fastSecPerKm < s.target.slowSecPerKm))
        errors.push("Fast pace must be quicker than slow pace.");
    }
  }
  return errors;
}

export function countSteps(steps: Step[]): number {
  return steps.reduce((n, s) => n + 1 + (s.kind === "repeat" ? countSteps(s.steps) : 0), 0);
}

export function toGarminWorkout(w: { title: string; description?: string | null; sport: Sport; steps: Step[] }) {
  const errors = validateSteps(w.steps);
  if (!SPORTS[w.sport]) errors.push(`Unsupported sport for Garmin: ${w.sport}`);
  if (countSteps(w.steps) > 100) errors.push("Garmin allows at most 100 steps in a single-sport workout.");
  if (errors.length) throw new Error(errors.join(" "));

  let order = 0; // stepOrder is global across nesting (see spec example JSON)
  const convert = (s: Step): Record<string, unknown> => {
    order += 1;
    if (s.kind === "repeat") {
      return {
        type: "WorkoutRepeatStep",
        stepOrder: order,
        repeatType: "REPEAT_UNTIL_STEPS_CMPLT",
        repeatValue: s.times,
        steps: s.steps.map(convert),
      };
    }
    return {
      type: "WorkoutStep",
      stepOrder: order,
      intensity: s.intensity,
      description: s.note?.slice(0, 512) ?? null,
      ...duration(s.duration),
      ...target(s.target),
    };
  };

  const sport = SPORTS[w.sport];
  return {
    workoutName: w.title.slice(0, 100),
    description: w.description?.slice(0, 1024) ?? null,
    sport,
    workoutProvider: "Diastole",
    workoutSourceId: "Diastole",
    isSessionTransitionEnabled: false,
    poolLength: null,
    poolLengthUnit: null,
    segments: [{ segmentOrder: 1, sport, poolLength: null, poolLengthUnit: null, steps: w.steps.map(convert) }],
  };
}
