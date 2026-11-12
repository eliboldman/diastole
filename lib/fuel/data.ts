import "server-only";

import { cleanPerKg, dailyTargets, hitSummary, signature, slotFor, usualMeals, type HitSummary, type LoggedItem, type PerKg, type Slot, type Targets } from "@/lib/fuel/meals";
import { asFuelMode, estimateSession, fuelDay, type FuelDay, type FuelMode, type Session } from "@/lib/fuel/plan";
import { createClient } from "@/lib/supabase/server";
import type { Pool, PoolUnit, Step } from "@/lib/workouts/garmin-format";

export type FuelWorkout = { id: string; title: string; sport: string; session: Session };
export type FuelDayView = { date: string; level: FuelDay; race: boolean; workouts: FuelWorkout[] };

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** The athlete's fueling mode (set by their coach; full numbers when unset). Row-level security applies. */
export async function getFuelMode(athleteId: string): Promise<FuelMode> {
  const supabase = await createClient();
  const { data } = await supabase.from("fuel_settings").select("mode").eq("athlete_id", athleteId).maybeSingle();
  return asFuelMode(data?.mode);
}

/** Planned sessions and fuel levels for `days` days from `from` (the athlete's local date). */
export async function getFuelDays(athleteId: string, from: string, days = 7): Promise<FuelDayView[]> {
  const supabase = await createClient();
  const to = addDays(from, days - 1);
  const [{ data: plans }, { data: zones }, { data: goal }] = await Promise.all([
    supabase
      .from("planned_workouts")
      .select("id, scheduled_date, title, sport, steps, pool_length, pool_unit, created_at")
      .eq("athlete_id", athleteId)
      .is("deleted_at", null)
      .neq("status", "draft")
      .gte("scheduled_date", from)
      .lte("scheduled_date", to)
      .order("scheduled_date")
      .order("created_at"),
    supabase.from("athlete_zones").select("threshold_speed_mps, ftp_w").eq("athlete_id", athleteId).maybeSingle(),
    supabase.from("athlete_goals").select("race_date").eq("athlete_id", athleteId).maybeSingle(),
  ]);

  return Array.from({ length: days }, (_, i) => {
    const date = addDays(from, i);
    const workouts = (plans ?? [])
      .filter((p) => p.scheduled_date === date)
      .map((p) => {
        const pool: Pool = p.pool_length && p.pool_unit ? { length: Number(p.pool_length), unit: p.pool_unit as PoolUnit } : null;
        return { id: p.id, title: p.title, sport: p.sport, session: estimateSession((p.steps ?? []) as Step[], p.sport, zones, pool) };
      });
    const race = goal?.race_date === date;
    return { date, level: fuelDay(workouts.map((w) => w.session), race), race, workouts };
  });
}

// ---------------------------------------------------------------- meals and targets (Phase 9b)

export type MealRow = { id: string; label: string | null; items: LoggedItem[]; carbs_g: number; protein_g: number; fat_g: number; kcal: number; source: string; created_at: string };
export type MealDay = {
  weightKg: number | null;
  level: FuelDay; // planned training, raised by what was actually done today
  targets: Targets | null;
  eaten: { carbs: number; protein: number; fat: number; kcal: number };
  meals: MealRow[];
  usual: { meal: MealRow; times: number; slot: Slot }[];
  recent: MealRow[];
};

const LEVELS: FuelDay[] = ["low", "medium", "high"];

/** Today's meals, targets and repeat-meal shortcuts. Row-level security: the athlete or their coach. */
export async function getMealDay(athleteId: string, today: string, timeZone: string, plannedLevel: FuelDay): Promise<MealDay> {
  const supabase = await createClient();
  const since = new Date(Date.now() - 36 * 3_600_000).toISOString();
  const [{ data: body }, { data: todays }, { data: past }, { data: acts }, goals] = await Promise.all([
    supabase.from("athlete_body").select("weight_kg").eq("athlete_id", athleteId).maybeSingle(),
    supabase.from("meal_logs").select("id, label, items, carbs_g, protein_g, fat_g, kcal, source, created_at").eq("athlete_id", athleteId).eq("local_date", today).order("created_at"),
    supabase.from("meal_logs").select("id, label, items, carbs_g, protein_g, fat_g, kcal, source, created_at").eq("athlete_id", athleteId).lt("local_date", today).order("created_at", { ascending: false }).limit(120),
    supabase.from("activities").select("start_time, duration_s").eq("athlete_id", athleteId).gte("start_time", since),
    getNutritionGoals(athleteId),
  ]);

  // What was actually done today can only raise the fuel level, never lower it.
  const done: Session[] = (acts ?? [])
    .filter((a) => a.start_time && new Date(a.start_time).toLocaleDateString("en-CA", { timeZone }) === today && (a.duration_s ?? 0) >= 300)
    .map((a) => ({ sport: "", minutes: Math.round((a.duration_s ?? 0) / 60), hardMinutes: 0, hard: false }));
  const actual = done.length ? fuelDay(done) : "low";
  const level = LEVELS[Math.max(LEVELS.indexOf(plannedLevel), LEVELS.indexOf(actual))];

  const num = (m: Record<string, unknown>): MealRow => ({ ...(m as MealRow), carbs_g: Number(m.carbs_g), protein_g: Number(m.protein_g), fat_g: Number(m.fat_g), kcal: Number(m.kcal) });
  const meals = (todays ?? []).map(num);
  const history = (past ?? []).map(num);
  const weightKg = body?.weight_kg ? Number(body.weight_kg) : null;
  const sum = (k: "carbs_g" | "protein_g" | "fat_g" | "kcal") => meals.reduce((t, m) => t + m[k], 0);
  const hour = (iso: string) => {
    const [h, mi] = new Date(iso).toLocaleTimeString("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).split(":").map(Number);
    return h + mi / 60;
  };
  const nowSlot = slotFor(hour(new Date().toISOString()));
  const usual = usualMeals(history, (m) => slotFor(hour(m.created_at)), nowSlot).slice(0, 3);
  const usualSigs = new Set(usual.map((u) => signature(u.meal.items)));
  const seen = new Set<string>();
  const recent = history.filter((m) => {
    const sig = signature(m.items);
    if (!sig || seen.has(sig) || usualSigs.has(sig)) return false;
    seen.add(sig);
    return true;
  }).slice(0, 6);

  return {
    weightKg,
    level,
    targets: dailyTargets(weightKg, level, goals.perKg),
    eaten: { carbs: sum("carbs_g"), protein: sum("protein_g"), fat: sum("fat_g"), kcal: sum("kcal") },
    meals,
    usual,
    recent,
  };
}

/** Daily totals for the last `days` days (oldest first), for the coach's check-ins. */
export async function getMealWeek(athleteId: string, today: string, days = 7) {
  const supabase = await createClient();
  const from = addDays(today, -(days - 1));
  const { data } = await supabase.from("meal_logs").select("local_date, carbs_g, protein_g, fat_g, kcal").eq("athlete_id", athleteId).gte("local_date", from).lte("local_date", today);
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(from, i);
    const rows = (data ?? []).filter((r) => r.local_date === date);
    const s = (k: "carbs_g" | "protein_g" | "fat_g" | "kcal") => Math.round(rows.reduce((t, r) => t + Number(r[k]), 0));
    return { date, meals: rows.length, carbs: s("carbs_g"), protein: s("protein_g"), fat: s("fat_g"), kcal: s("kcal") };
  });
}

// ---------------------------------------------------------------- nutrition goals (dietitian view)

export type NutritionGoals = { perKg: PerKg; note: string | null; updatedAt: string | null; updatedBy: string | null };

/** The athlete's own goals (set by their dietitian or coach). Row-level security: the athlete and their staff. */
export async function getNutritionGoals(athleteId: string): Promise<NutritionGoals> {
  const supabase = await createClient();
  const { data } = await supabase.from("nutrition_goals").select("per_kg, note, updated_at, updated_by").eq("athlete_id", athleteId).maybeSingle();
  if (!data) return { perKg: {}, note: null, updatedAt: null, updatedBy: null };
  let by: string | null = null;
  if (data.updated_by) {
    const { data: who } = await supabase.from("profiles").select("full_name, email").eq("id", data.updated_by).maybeSingle();
    by = who?.full_name || who?.email || null;
  }
  return { perKg: cleanPerKg(data.per_kg), note: data.note, updatedAt: data.updated_at, updatedBy: by };
}

export type ReviewDay = {
  date: string;
  level: FuelDay;
  workouts: string[]; // planned session titles
  trained: number; // minutes actually recorded
  meals: number;
  eaten: { carbs: number; protein: number; fat: number; kcal: number };
  targets: Targets | null;
};
export type NutritionReview = { weightKg: number | null; weightUpdated: string | null; days: ReviewDay[]; summary: HitSummary };

const localDay = (iso: string, timeZone: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone });

/**
 * The last `days` days ending today (newest first): each day's training level, its targets (with the
 * athlete's own goals), and what was logged. A day's level is the planned one, raised by what was done.
 */
export async function getNutritionReview(athleteId: string, today: string, timeZone: string, days = 14, perKg: PerKg = {}): Promise<NutritionReview> {
  const supabase = await createClient();
  const from = addDays(today, -(days - 1));
  const [planned, { data: body }, { data: meals }, { data: acts }] = await Promise.all([
    getFuelDays(athleteId, from, days),
    supabase.from("athlete_body").select("weight_kg, updated_at").eq("athlete_id", athleteId).maybeSingle(),
    supabase.from("meal_logs").select("local_date, carbs_g, protein_g, fat_g, kcal").eq("athlete_id", athleteId).gte("local_date", from).lte("local_date", today),
    supabase
      .from("activities")
      .select("start_time, duration_s")
      .eq("athlete_id", athleteId)
      .gte("start_time", `${addDays(from, -1)}T00:00:00Z`), // a day early: local dates can trail UTC
  ]);
  const weightKg = body?.weight_kg ? Number(body.weight_kg) : null;

  const out: ReviewDay[] = planned.map((p) => {
    const rows = (meals ?? []).filter((m) => m.local_date === p.date);
    const sum = (k: "carbs_g" | "protein_g" | "fat_g" | "kcal") => Math.round(rows.reduce((t, r) => t + Number(r[k]), 0));
    const doneActs = (acts ?? []).filter((a) => a.start_time && localDay(a.start_time, timeZone) === p.date && (a.duration_s ?? 0) >= 300);
    const done: Session[] = doneActs.map((a) => ({ sport: "", minutes: Math.round((a.duration_s ?? 0) / 60), hardMinutes: 0, hard: false }));
    const actual = done.length ? fuelDay(done) : "low";
    const level = LEVELS[Math.max(LEVELS.indexOf(p.level), LEVELS.indexOf(actual))];
    return {
      date: p.date,
      level,
      workouts: p.workouts.map((w) => w.title),
      trained: done.reduce((t, d) => t + (d.minutes ?? 0), 0),
      meals: rows.length,
      eaten: { carbs: sum("carbs_g"), protein: sum("protein_g"), fat: sum("fat_g"), kcal: sum("kcal") },
      targets: dailyTargets(weightKg, level, perKg),
    };
  });
  // Today is still in progress: it's shown, but not scored.
  const finished = out.filter((d) => d.date !== today);
  return { weightKg, weightUpdated: body?.updated_at ?? null, days: out.reverse(), summary: hitSummary(finished) };
}
