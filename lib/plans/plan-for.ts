// Loading a plan template and laying it onto one athlete's calendar (scaled to their zones, moved
// to their week). Shared by the coach's plan actions and training camps. Not a server action.
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Brick, Pool, PoolUnit, Step } from "@/lib/workouts/garmin-format";
import { ZONE_COLUMNS, type RelZones } from "@/lib/workouts/relative";
import type { StrengthItem } from "@/lib/strength/workout";

import { applyTo, startMonday, type PlannedItem, type TemplateWorkout } from "./template";

type Supa = SupabaseClient;
export const poolOf = (l: unknown, u: unknown): Pool => (l && u ? { length: Number(l), unit: u as PoolUnit } : null);

export const TW_COLS = "id, template_id, week, day, position, title, sport, description, why, steps, brick, pool_length, pool_unit, strength, updated_at";
export function rowToTw(r: Record<string, unknown>): TemplateWorkout {
  return {
    id: r.id as string,
    week: r.week as number,
    day: r.day as number,
    position: r.position as number,
    title: r.title as string,
    sport: r.sport as TemplateWorkout["sport"],
    description: (r.description as string | null) ?? null,
    why: (r.why as string | null) ?? null,
    steps: (r.steps ?? []) as Step[],
    brick: (r.brick ?? null) as Brick,
    pool: poolOf(r.pool_length, r.pool_unit),
    strength: (r.strength ?? null) as StrengthItem[] | null,
    updated_at: r.updated_at as string,
  };
}

export async function loadTemplate(supabase: Supa, id: string) {
  const [{ data: t }, { data: rows }] = await Promise.all([
    supabase.from("plan_templates").select("id, name, weeks, race_week, version").eq("id", id).maybeSingle(),
    supabase.from("plan_template_workouts").select(TW_COLS).eq("template_id", id).order("week").order("day").order("position"),
  ]);
  return t ? { t, workouts: (rows ?? []).map(rowToTw) } : null;
}

export async function planFor(supabase: Supa, templateId: string, athleteId: string, dates: { raceDate?: string | null; startDate?: string | null }) {
  const loaded = await loadTemplate(supabase, templateId);
  if (!loaded) return null;
  const [{ data: zones }, { data: week }, { data: prof }] = await Promise.all([
    supabase.from("athlete_zones").select(ZONE_COLUMNS).eq("athlete_id", athleteId).maybeSingle(),
    supabase.from("athlete_week").select("days").eq("athlete_id", athleteId).maybeSingle(),
    supabase.from("profiles").select("full_name, email, timezone").eq("id", athleteId).maybeSingle(),
  ]);
  if (!prof) return null;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: prof.timezone || "America/Chicago" });
  const start = startMonday({ weeks: loaded.t.weeks, raceWeek: loaded.t.race_week, raceDate: dates.raceDate, startDate: dates.startDate });
  const items = applyTo({ workouts: loaded.workouts, start, zones: (zones ?? null) as RelZones, week: week?.days, today });
  return { ...loaded, start, items, today, name: ((prof.full_name || prof.email || "Athlete") as string).split(" ")[0] };
}

export function draftRow(i: PlannedItem, athleteId: string, coachId: string, applicationId: string) {
  return {
    athlete_id: athleteId,
    coach_id: coachId,
    title: i.tw.title,
    sport: i.tw.sport,
    scheduled_date: i.date,
    description: i.tw.description,
    why: i.tw.why,
    steps: i.steps,
    brick: i.tw.sport === "bike" ? i.brick : null,
    strength: i.tw.sport === "strength" ? (i.tw.strength ?? []) : null,
    pool_length: i.tw.pool?.length ?? null,
    pool_unit: i.tw.pool?.unit ?? null,
    status: "draft",
    start_time: i.startTime,
    plan_application_id: applicationId,
    template_workout_id: i.tw.id ?? null,
  };
}
