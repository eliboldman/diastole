// Strength workouts: the shape a coach builds, plain-language lines, a time estimate, the Garmin
// strength workout, progression from what was logged, and the "no heavy legs before a key day"
// check. Pure module, testable with `node`.

import { BY_SLUG } from "./catalog.ts";

export type StrengthItem = {
  slug: string;
  sets: number;
  reps: number | null; // per side for per-side moves
  seconds: number | null; // holds and carries
  kg: number | null; // null = bodyweight or band
  tempo?: string | null; // "3-1-1" (down, pause, up)
  rest_s: number;
  note?: string | null;
};
export type LoggedSet = { reps: number | null; kg: number | null; seconds: number | null };
export type LoggedItem = { slug: string; sets: LoggedSet[] };

const KG_LB = 2.20462;
export const showKg = (kg: number, unit: "kg" | "lb") => (unit === "lb" ? `${Math.round(kg * KG_LB)} lb` : `${Math.round(kg * 10) / 10} kg`);
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

export function validateStrength(items: StrengthItem[]): string[] {
  const errors: string[] = [];
  if (!items?.length) errors.push("Add at least one exercise.");
  for (const it of items ?? []) {
    const ex = BY_SLUG.get(it.slug);
    if (!ex) {
      errors.push("Unknown exercise.");
      continue;
    }
    if (!Number.isInteger(it.sets) || it.sets < 1 || it.sets > 10) errors.push(`${ex.name}: 1–10 sets.`);
    if (ex.hold ? !(it.seconds && it.seconds >= 5 && it.seconds <= 600) : !(it.reps && it.reps >= 1 && it.reps <= 50)) errors.push(ex.hold ? `${ex.name}: hold 5–600 seconds.` : `${ex.name}: 1–50 reps.`);
    if (it.kg !== null && !(it.kg > 0 && it.kg <= 400)) errors.push(`${ex.name}: weight should be up to 400 kg.`);
    if (!(it.rest_s >= 0 && it.rest_s <= 600)) errors.push(`${ex.name}: rest 0–10 min.`);
    if (it.tempo && !/^\d-\d-\d(-\d)?$/.test(it.tempo)) errors.push(`${ex.name}: tempo like 3-1-1.`);
  }
  return errors;
}

/** "Back squat 3 × 5 @ 60 kg · rest 2:00 · tempo 3-1-1". */
export function describeStrength(items: StrengthItem[], unit: "kg" | "lb" = "kg"): string[] {
  return (items ?? []).map((it) => {
    const ex = BY_SLUG.get(it.slug);
    const name = ex?.name ?? it.slug;
    const work = it.seconds ? `${it.sets} × ${it.seconds} s` : `${it.sets} × ${it.reps}`;
    const side = ex?.perSide ? " each side" : "";
    const load = it.kg ? ` @ ${showKg(it.kg, unit)}` : ex?.load === "band" ? " with a band" : "";
    return [`${name} ${work}${side}${load}`, it.rest_s ? `rest ${clock(it.rest_s)}` : null, it.tempo ? `tempo ${it.tempo}` : null].filter(Boolean).join(" · ");
  });
}

/** Rough time: about 3 s a rep (both sides for per-side moves), the rests, and a minute between exercises. */
export function strengthSeconds(items: StrengthItem[]): number {
  let total = 0;
  for (const it of items ?? []) {
    const ex = BY_SLUG.get(it.slug);
    const sides = ex?.perSide ? 2 : 1;
    const work = (it.seconds ?? (it.reps ?? 0) * 3) * sides;
    total += it.sets * work + Math.max(0, it.sets - 1) * it.rest_s + 60;
  }
  return Math.round(total);
}

/** Garmin Training API strength workout: each exercise a repeat of work + rest, weight in kg. */
export function toGarminStrength(title: string, items: StrengthItem[], unit: "kg" | "lb" = "kg", description?: string | null) {
  const errors = validateStrength(items);
  if (errors.length) throw new Error([...new Set(errors)].join(" "));
  let order = 0;
  const step = (it: StrengthItem) => {
    const ex = BY_SLUG.get(it.slug)!;
    order += 1;
    return {
      type: "WorkoutStep",
      stepOrder: order,
      intensity: "ACTIVE",
      description: [ex.perSide ? "Each side" : null, it.tempo ? `Tempo ${it.tempo}` : null, it.note || null].filter(Boolean).join(". ").slice(0, 512) || null,
      durationType: it.seconds ? "TIME" : "REPS",
      durationValue: it.seconds ?? it.reps,
      durationValueType: null,
      targetType: "OPEN",
      targetValue: null,
      targetValueLow: null,
      targetValueHigh: null,
      targetValueType: null,
      exerciseCategory: ex.garmin.category,
      exerciseName: ex.garmin.name,
      weightValue: it.kg,
      weightDisplayUnit: it.kg ? (unit === "lb" ? "POUND" : "KILOGRAM") : null,
    };
  };
  const rest = (seconds: number) => {
    order += 1;
    return { type: "WorkoutStep", stepOrder: order, intensity: "REST", description: null, durationType: "TIME", durationValue: seconds, durationValueType: null, targetType: "OPEN", targetValue: null, targetValueLow: null, targetValueHigh: null, targetValueType: null };
  };
  const steps = items.map((it) => {
    if (it.sets <= 1) return step(it);
    order += 1;
    const repeatOrder = order;
    const inner = [step(it), ...(it.rest_s ? [rest(it.rest_s)] : [])];
    return { type: "WorkoutRepeatStep", stepOrder: repeatOrder, repeatType: "REPEAT_UNTIL_STEPS_CMPLT", repeatValue: it.sets, skipLastRestStep: true, steps: inner };
  });
  return {
    workoutName: title.slice(0, 100),
    description: description?.slice(0, 1024) ?? null,
    sport: "STRENGTH_TRAINING",
    workoutProvider: "Diastole",
    workoutSourceId: "Diastole",
    isSessionTransitionEnabled: false,
    segments: [{ segmentOrder: 1, sport: "STRENGTH_TRAINING", steps }],
  };
}

// ---------------------------------------------------------------- progression

export type Rules = { upper_kg: number; lower_kg: number; easy_rpe: number; drop_pct: number };
export const DEFAULT_RULES: Rules = { upper_kg: 2.5, lower_kg: 5, easy_rpe: 7, drop_pct: 10 };
const roundKg = (kg: number) => Math.max(1.25, Math.round(kg / 1.25) * 1.25);

export type Change = { slug: string; from: { kg: number | null; reps: number | null; seconds: number | null }; to: { kg: number | null; reps: number | null; seconds: number | null }; why: string };

/**
 * Next targets for each exercise from what was logged and the session RPE, within the coach's rules.
 * `legsHold`: the next session is the day before a key bike/run, so leg loads don't go up.
 */
export function progress(plan: StrengthItem[], logged: LoggedItem[], rpe: number | null, rules: Rules = DEFAULT_RULES, legsHold = false): Change[] {
  const out: Change[] = [];
  for (const it of plan) {
    const ex = BY_SLUG.get(it.slug);
    const log = logged.find((l) => l.slug === it.slug);
    if (!ex || !log?.sets.length) continue;
    const target = it.seconds ?? it.reps ?? 0;
    const hit = log.sets.length >= it.sets && log.sets.every((s) => (it.seconds ? (s.seconds ?? 0) : (s.reps ?? 0)) >= target);
    const from = { kg: it.kg, reps: it.reps, seconds: it.seconds };
    const to = { ...from };
    let why = "";
    if (!hit || (rpe !== null && rpe >= 10)) {
      if (it.kg) {
        to.kg = roundKg(it.kg * (1 - rules.drop_pct / 100));
        why = !hit ? "Missed reps, so a little lighter" : "That was maximal, so a little lighter";
      } else continue; // bodyweight: just repeat it
    } else if (rpe !== null && rpe <= rules.easy_rpe) {
      if (ex.legs && legsHold) {
        why = "Held: key session the next day";
      } else if (it.kg) {
        to.kg = roundKg(it.kg + (ex.legs ? rules.lower_kg : rules.upper_kg));
        why = `All reps at RPE ${rpe}`;
      } else if (it.seconds) {
        to.seconds = Math.min(600, it.seconds + 5);
        why = `Solid holds at RPE ${rpe}`;
      } else if (it.reps) {
        to.reps = Math.min(50, it.reps + (ex.legs ? 2 : 1));
        why = `All reps at RPE ${rpe}`;
      }
    } else continue; // hit at RPE 8–9: hold
    if (JSON.stringify(to) !== JSON.stringify(from)) out.push({ slug: it.slug, from, to, why });
  }
  return out;
}

/** Apply changes to a session's items (exercise by exercise). */
export function applyChanges(items: StrengthItem[], changes: Change[]): StrengthItem[] {
  return items.map((it) => {
    const c = changes.find((x) => x.slug === it.slug);
    return c ? { ...it, kg: c.to.kg, reps: c.to.reps, seconds: c.to.seconds } : it;
  });
}

/** Heavy lower-body lifts in a session (worth flagging the day before a key bike/run). */
export const heavyLegs = (items: StrengthItem[]) => (items ?? []).filter((it) => BY_SLUG.get(it.slug)?.heavy && it.kg).map((it) => BY_SLUG.get(it.slug)!.name);

/** The same session with heavy leg loads lightened by 20% (for the day before a key session). */
export const lightenLegs = (items: StrengthItem[]) => items.map((it) => (BY_SLUG.get(it.slug)?.heavy && it.kg ? { ...it, kg: roundKg(it.kg * 0.8) } : it));

/** Session load from minutes and RPE (one hour at RPE 10 ≈ 100, like an hour at threshold). */
export const strengthLoad = (seconds: number, rpe: number | null) => Math.round((seconds / 3600) * (rpe ?? 6) * 10);
