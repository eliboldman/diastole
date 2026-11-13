import "server-only";

import { generateScenario, addDaysIso as addDays, easyRun, longRun, threshold } from "@/lib/ai/scenarios";
import type { Step } from "@/lib/workouts/garmin-format";
import { localDate, refreshReadiness } from "@/lib/readiness/run";
import { createAdminClient } from "@/lib/supabase/server";

// A sample athlete ("Jordan Demo") for a new coach: 4 weeks of sleep/HRV/resting HR, a week of
// run/bike/swim/strength with completed plans, upcoming workouts, meals, check-ins and a race.
// Pre-confirmed account at a domain that never receives mail; the coach opens it from the roster.

const DOMAIN = "test.diastole.app";
const NAME = "Jordan Demo";
const YD = 0.9144;

const bikeTempo: Step[] = [
  { kind: "step", intensity: "WARMUP", duration: { type: "time", seconds: 600 }, target: { type: "power_range", low: 120, high: 150 } },
  { kind: "repeat", times: 3, steps: [
    { kind: "step", intensity: "INTERVAL", duration: { type: "time", seconds: 600 }, target: { type: "power_range", low: 200, high: 215 } },
    { kind: "step", intensity: "RECOVERY", duration: { type: "time", seconds: 300 }, target: { type: "power_range", low: 110, high: 140 } },
  ] },
  { kind: "step", intensity: "COOLDOWN", duration: { type: "time", seconds: 600 }, target: { type: "power_range", low: 100, high: 130 } },
];
const bikeEndurance: Step[] = [
  { kind: "step", intensity: "WARMUP", duration: { type: "time", seconds: 600 }, target: { type: "power_range", low: 110, high: 140 } },
  { kind: "step", intensity: "ACTIVE", duration: { type: "time", seconds: 5400 }, target: { type: "power_range", low: 150, high: 175 } },
  { kind: "step", intensity: "COOLDOWN", duration: { type: "time", seconds: 600 }, target: { type: "power_range", low: 100, high: 130 } },
];
const swimAerobic: Step[] = [
  { kind: "step", intensity: "WARMUP", duration: { type: "distance", meters: 300 * YD }, stroke: "FREESTYLE", target: { type: "swim_effort", level: 3 } },
  { kind: "repeat", times: 8, steps: [
    { kind: "step", intensity: "INTERVAL", duration: { type: "distance", meters: 100 * YD }, stroke: "FREESTYLE", target: { type: "swim_effort", level: 6 } },
    { kind: "step", intensity: "REST", duration: { type: "time", seconds: 15 } },
  ] },
  { kind: "step", intensity: "COOLDOWN", duration: { type: "distance", meters: 200 * YD }, stroke: "CHOICE" },
];
const strength = [
  { slug: "goblet-squat", sets: 3, reps: 8, seconds: null, kg: 16, tempo: null, rest_s: 90, note: null },
  { slug: "single-leg-rdl", sets: 3, reps: 8, seconds: null, kg: 12, tempo: null, rest_s: 60, note: null },
  { slug: "calf-raise", sets: 3, reps: 12, seconds: null, kg: null, tempo: null, rest_s: 45, note: null },
  { slug: "side-plank", sets: 2, reps: null, seconds: 30, kg: null, tempo: null, rest_s: 30, note: null },
];

type Kind = "easy" | "threshold" | "long" | "bike" | "ride" | "swim" | "strength" | "rest";
// By weekday (0 = Sunday).
const WEEK: Kind[] = ["ride", "rest", "threshold", "swim", "bike", "strength", "long"];
const PLAN: Record<Exclude<Kind, "rest">, { sport: string; title: string; steps: Step[]; act: { sport: string; min: number; m: number; hr: number } }> = {
  easy: { sport: "run", title: "Easy 55 min", steps: easyRun, act: { sport: "running", min: 55, m: 9800, hr: 142 } },
  threshold: { sport: "run", title: "Threshold 4 × 8 min", steps: threshold, act: { sport: "running", min: 62, m: 12400, hr: 156 } },
  long: { sport: "run", title: "Long run", steps: longRun, act: { sport: "running", min: 108, m: 21000, hr: 146 } },
  bike: { sport: "bike", title: "Tempo 3 × 10 min", steps: bikeTempo, act: { sport: "cycling", min: 65, m: 34000, hr: 145 } },
  ride: { sport: "bike", title: "Endurance ride 2 h", steps: bikeEndurance, act: { sport: "cycling", min: 120, m: 60000, hr: 138 } },
  swim: { sport: "swim", title: "Aerobic 100s", steps: swimAerobic, act: { sport: "lap_swimming", min: 40, m: 1300 * YD, hr: 132 } },
  strength: { sport: "strength", title: "Strength: legs and core", steps: [], act: { sport: "strength_training", min: 40, m: 0, hr: 112 } },
};

const MEALS = [
  { label: "Breakfast", h: 7, items: [{ name: "Oatmeal with banana and peanut butter", portion: "1 bowl", carbs_g: 70, protein_g: 14, fat_g: 14 }], carbs: 70, protein: 14, fat: 14 },
  { label: "Recovery", h: 10, items: [{ name: "Greek yogurt with berries", portion: "1 cup", carbs_g: 30, protein_g: 22, fat_g: 4 }], carbs: 30, protein: 22, fat: 4 },
  { label: "Lunch", h: 13, items: [{ name: "Chicken rice bowl", portion: "1 bowl", carbs_g: 85, protein_g: 38, fat_g: 16 }], carbs: 85, protein: 38, fat: 16 },
  { label: "Dinner", h: 19, items: [{ name: "Salmon, potatoes and greens", portion: "1 plate", carbs_g: 75, protein_g: 40, fat_g: 22 }], carbs: 75, protein: 40, fat: 22 },
];

/** Create the coach's demo athlete (or return the existing one). Returns its id. */
export async function seedDemoAthlete(coachId: string): Promise<string> {
  const admin = createAdminClient();
  const { data: coach } = await admin.from("profiles").select("timezone, units").eq("id", coachId).single();
  const tz = coach?.timezone ?? "America/Los_Angeles";
  const today = localDate(new Date(), tz);
  const email = `demo-${coachId.slice(0, 8)}@${DOMAIN}`;

  let id: string;
  const { data: existing } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  if (existing) id = existing.id;
  else {
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: NAME } });
    if (error || !data.user) throw new Error(`Couldn't create the demo athlete: ${error?.message}`);
    id = data.user.id;
  }
  const check = (step: string, r: { error: { message: string } | null }) => {
    if (r.error) throw new Error(`Demo athlete: ${step} failed: ${r.error.message}`);
  };
  check("profile", await admin.from("profiles").update({ coach_id: coachId, is_demo: true, is_test: false, full_name: NAME, timezone: tz, units: coach?.units ?? "mi", welcomed_at: new Date().toISOString() }).eq("id", id));

  // Start clean so reseeding is safe.
  for (const t of ["daily_wellness", "activities", "readiness_scores", "planned_workouts", "meal_logs", "races"]) await admin.from(t).delete().eq("athlete_id", id);

  check("zones", await admin.from("athlete_zones").upsert({ athlete_id: id, max_hr: 188, threshold_speed_mps: 4.1, ftp_w: 240 }));
  check("body", await admin.from("athlete_body").upsert({ athlete_id: id, weight_kg: 68 }));

  const gen = generateScenario("normal", today, 9);
  check("wellness", await admin.from("daily_wellness").insert(gen.wellness.map((w) => ({ athlete_id: id, source: "garmin", ...w }))));

  // Four weeks of training on the weekly pattern; the last 7 days also have their (completed) plans.
  const acts: Record<string, unknown>[] = [];
  const plans: Record<string, unknown>[] = [];
  const now = new Date().toISOString();
  const dowOf = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();
  for (let d = 28; d >= 1; d--) {
    const date = addDays(today, -d);
    const kind = WEEK[dowOf(date)];
    if (kind === "rest") continue;
    const p = PLAN[kind];
    const jitter = 1 + (((d * 37) % 11) - 5) / 100;
    acts.push({
      athlete_id: id, source: "garmin", external_id: `demo-${id.slice(0, 8)}-${date}`, sport: p.act.sport,
      start_time: new Date(`${date}T14:00:00Z`).toISOString(), duration_s: Math.round(p.act.min * 60 * jitter),
      distance_m: Math.round(p.act.m * jitter), avg_hr: Math.round(p.act.hr * jitter), max_hr: Math.round((p.act.hr + 22) * jitter),
    });
    if (d <= 7) plans.push({ date, kind, status: "completed" });
  }
  for (let d = 0; d <= 13; d++) {
    const date = addDays(today, d);
    const kind = WEEK[dowOf(date)];
    if (kind !== "rest") plans.push({ date, kind, status: "approved" });
  }
  check("activities", await admin.from("activities").insert(acts));
  check("plans", await admin.from("planned_workouts").insert(plans.map((x) => {
    const p = PLAN[x.kind as Exclude<Kind, "rest">];
    return {
      athlete_id: id, coach_id: coachId, scheduled_date: x.date, sport: p.sport, title: p.title,
      description: "Sample workout for the demo athlete. Edit, move or delete it.", steps: p.steps,
      strength: p.sport === "strength" ? strength : null, pool_length: p.sport === "swim" ? 25 : null, pool_unit: p.sport === "swim" ? "YARD" : null,
      status: x.status, approved_at: now,
    };
  })));

  // Meals for the last three days and this morning.
  const meals: Record<string, unknown>[] = [];
  for (let d = 3; d >= 0; d--) {
    const date = addDays(today, -d);
    for (const m of d === 0 ? MEALS.slice(0, 1) : MEALS) {
      meals.push({ athlete_id: id, local_date: date, eaten_at: new Date(`${date}T${String(m.h + 8).padStart(2, "0")}:00:00Z`).toISOString(), label: m.label, items: m.items, carbs_g: m.carbs, protein_g: m.protein, fat_g: m.fat, source: "text" });
    }
  }
  check("meals", await admin.from("meal_logs").insert(meals));

  // A few check-ins on recent sessions.
  const { data: recent } = await admin.from("activities").select("id").eq("athlete_id", id).order("start_time", { ascending: false }).limit(3);
  const notes = ["Legs felt fresh, held pace easily.", "Windy but steady.", "Last rep was tough."];
  if (recent?.length) check("check-ins", await admin.from("workout_checkins").upsert(recent.map((a, i) => ({ activity_id: a.id, athlete_id: id, feel: 4 - (i % 2), rpe: 5 + i, note: notes[i] }))));

  check("race", await admin.from("races").insert({ athlete_id: id, created_by: coachId, name: "Spring Half Marathon", race_date: addDays(today, 45), sport: "run", distance_km: 21.1, goal_seconds: 5400, priority: "A" }));

  await refreshReadiness(id).catch((e) => console.error("demo readiness", id, e));
  await admin.from("profiles").update({ demo_seeded_at: now }).eq("id", coachId);
  return id;
}

/**
 * A newly invited coach with an empty roster gets a demo athlete once (first visit to their
 * dashboard or roster). Coaches who already have athletes, or got one before, are left alone.
 */
export async function ensureDemoForNewCoach(coachId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("role, demo_seeded_at").eq("id", coachId).maybeSingle();
  if (!me || me.role !== "coach" || me.demo_seeded_at) return;
  const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("coach_id", coachId).neq("id", coachId);
  if (count) {
    await admin.from("profiles").update({ demo_seeded_at: new Date().toISOString() }).eq("id", coachId);
    return;
  }
  await seedDemoAthlete(coachId).catch((e) => console.error("demo seed", coachId, e));
}
