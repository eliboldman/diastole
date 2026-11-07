"use server";

import { revalidatePath } from "next/cache";

import { sweatRate, type RaceSport } from "@/lib/fuel/race";
import { createClient, requireUser } from "@/lib/supabase/server";

type Result = { ok: true; id?: string } | { ok: false; error: string };
const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SPORTS: RaceSport[] = ["run", "bike", "swim", "tri", "other"];

function refresh(athleteId?: string) {
  revalidatePath("/races");
  revalidatePath("/me");
  if (athleteId) revalidatePath(`/athlete/${athleteId}`);
}

/** "1:45:00", "45:00" or "45" (minutes) -> seconds. */
function parseGoal(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  const parts = t.split(":").map((p) => Number(p));
  if (parts.some((p) => !Number.isFinite(p) || p < 0)) return null;
  const s = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0] * 60;
  return s >= 60 && s <= 172_800 ? Math.round(s) : null;
}

/** Add or edit a race. For the athlete themself, or (row-level security) a coach's athlete. */
export async function saveRace(input: {
  id?: string;
  athleteId?: string;
  name: string;
  date: string;
  sport: string;
  distance: string;
  unit: "km" | "mi";
  goal: string;
  priority: string;
  notes: string;
}): Promise<Result> {
  const me = await requireUser();
  const athleteId = input.athleteId && UUID.test(input.athleteId) ? input.athleteId : me.id;
  const name = input.name.trim().slice(0, 80);
  if (!name) return { ok: false, error: "Give the race a name." };
  if (!DATE.test(input.date)) return { ok: false, error: "Pick the race date." };
  const sport = SPORTS.includes(input.sport as RaceSport) ? input.sport : "other";
  const dist = Number(input.distance);
  const distance_km = input.distance.trim() && Number.isFinite(dist) && dist > 0 ? Math.round(dist * (input.unit === "mi" ? 1.609344 : 1) * 100) / 100 : null;
  if (distance_km != null && distance_km > 1000) return { ok: false, error: "That distance looks too long." };
  const goal_seconds = parseGoal(input.goal);
  if (input.goal.trim() && goal_seconds == null) return { ok: false, error: "Goal time like 1:45:00 or 45:00." };
  const row = {
    athlete_id: athleteId,
    name,
    race_date: input.date,
    sport,
    distance_km,
    goal_seconds,
    priority: ["A", "B", "C"].includes(input.priority) ? input.priority : "A",
    notes: input.notes.trim().slice(0, 500) || null,
  };
  const supabase = await createClient();
  const q = input.id && UUID.test(input.id) ? supabase.from("races").update(row).eq("id", input.id) : supabase.from("races").insert(row);
  const { data, error } = await q.select("id").single();
  if (error || !data) return { ok: false, error: "Couldn't save that race." };
  refresh(athleteId);
  return { ok: true, id: data.id };
}

export async function deleteRace(id: string): Promise<Result> {
  await requireUser();
  if (!UUID.test(id)) return { ok: false, error: "Race not found." };
  const supabase = await createClient();
  const { data } = await supabase.from("races").delete().eq("id", id).select("athlete_id").maybeSingle();
  if (!data) return { ok: false, error: "Race not found." };
  refresh(data.athlete_id);
  return { ok: true };
}

/** Tick or untick a race-week checklist item. */
export async function toggleRaceCheck(id: string, key: string, done: boolean): Promise<Result> {
  await requireUser();
  if (!UUID.test(id) || !/^[a-z_]{1,24}$/.test(key)) return { ok: false, error: "Not found." };
  const supabase = await createClient();
  const { data: race } = await supabase.from("races").select("checklist, athlete_id").eq("id", id).maybeSingle();
  if (!race) return { ok: false, error: "Race not found." };
  const checklist = { ...((race.checklist as Record<string, boolean>) ?? {}) };
  if (done) checklist[key] = true;
  else delete checklist[key];
  const { error } = await supabase.from("races").update({ checklist }).eq("id", id);
  if (error) return { ok: false, error: "Couldn't save." };
  refresh(race.athlete_id);
  return { ok: true };
}

/** Sweat-rate test: works out the rate and saves ONLY that. The weights are never stored. */
export async function saveSweatTest(input: { pre: number; post: number; unit: "kg" | "lb"; drankMl: number; peedMl: number; minutes: number; tempC: number | null; sport: string; date: string }): Promise<Result & { rate?: number }> {
  await requireUser();
  const k = input.unit === "lb" ? 0.45359237 : 1;
  const rate = sweatRate({ preKg: Number(input.pre) * k, postKg: Number(input.post) * k, drankMl: Number(input.drankMl) || 0, peedMl: Number(input.peedMl) || 0, minutes: Number(input.minutes) });
  if (rate == null || rate < 100) return { ok: false, error: "Those numbers don't add up. Weigh before and after, without clothes, and train at least 20 minutes." };
  const supabase = await createClient();
  const temp = input.tempC == null || !Number.isFinite(Number(input.tempC)) ? null : Math.max(-20, Math.min(50, Number(input.tempC)));
  const { error } = await supabase.from("sweat_tests").insert({
    tested_on: DATE.test(input.date) ? input.date : new Date().toISOString().slice(0, 10),
    sweat_rate_ml_h: rate,
    minutes: Math.round(Number(input.minutes)),
    temp_c: temp,
    sport: SPORTS.includes(input.sport as RaceSport) ? input.sport : null,
  });
  if (error) return { ok: false, error: "Couldn't save the result." };
  refresh();
  return { ok: true, rate };
}

export async function deleteSweatTest(id: string): Promise<Result> {
  await requireUser();
  if (!UUID.test(id)) return { ok: false, error: "Not found." };
  const supabase = await createClient();
  await supabase.from("sweat_tests").delete().eq("id", id);
  refresh();
  return { ok: true };
}

/** Gut training: carbs per hour practiced in a session and how the stomach handled it. */
export async function saveGutSession(input: { date: string; carbs: number; minutes: number | null; comfort: number; products: string; note: string }): Promise<Result> {
  await requireUser();
  const carbs = Math.round(Number(input.carbs));
  const comfort = Math.round(Number(input.comfort));
  if (!(carbs >= 0 && carbs <= 150)) return { ok: false, error: "Carbs per hour between 0 and 150." };
  if (!(comfort >= 1 && comfort <= 5)) return { ok: false, error: "Pick how your stomach felt." };
  const minutes = input.minutes == null || !Number(input.minutes) ? null : Math.max(10, Math.min(900, Math.round(Number(input.minutes))));
  const supabase = await createClient();
  const { error } = await supabase.from("gut_sessions").insert({
    on_date: DATE.test(input.date) ? input.date : new Date().toISOString().slice(0, 10),
    carbs_g_per_h: carbs,
    minutes,
    comfort,
    products: input.products.trim().slice(0, 120) || null,
    note: input.note.trim().slice(0, 300) || null,
  });
  if (error) return { ok: false, error: "Couldn't save." };
  refresh();
  return { ok: true };
}

export async function deleteGutSession(id: string): Promise<Result> {
  await requireUser();
  if (!UUID.test(id)) return { ok: false, error: "Not found." };
  const supabase = await createClient();
  await supabase.from("gut_sessions").delete().eq("id", id);
  refresh();
  return { ok: true };
}
