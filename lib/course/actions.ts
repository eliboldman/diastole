"use server";

import { revalidatePath } from "next/cache";

import { createClient, requireCoach, requireUser } from "@/lib/supabase/server";

import { cleanCourse, cleanPacing, type Course, type Leg } from "./course";
import { getCourseView } from "./data";

const UUID = /^[0-9a-f-]{36}$/i;
type Result = { ok: true; message?: string; id?: string } | { ok: false; error: string };

/** Save a course (processed from GPX in the browser, checked here) for a race: the athlete or their coach. */
export async function saveCourse(raceId: string, raw: unknown, leg: Leg, name: string | null): Promise<Result> {
  await requireUser();
  if (!UUID.test(raceId)) return { ok: false, error: "Unknown race." };
  const course = cleanCourse(raw);
  if (!course) return { ok: false, error: "Couldn't read that course." };
  const supabase = await createClient(); // row-level security: the athlete or their coach
  const { data, error } = await supabase
    .from("races")
    .update({ course, course_leg: leg === "bike" ? "bike" : "run", course_name: name?.trim().slice(0, 120) || null, pacing: null })
    .eq("id", raceId)
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "Couldn't save the course." };
  revalidatePath(`/races/${raceId}`);
  return { ok: true, message: `${Math.round(course.distance_m / 100) / 10} km, ${course.gain_m} m of climbing.` };
}

export async function removeCourse(raceId: string): Promise<Result> {
  await requireUser();
  if (!UUID.test(raceId)) return { ok: false, error: "Unknown race." };
  const supabase = await createClient();
  const { error } = await supabase.from("races").update({ course: null, course_leg: null, course_name: null, pacing: null }).eq("id", raceId);
  revalidatePath(`/races/${raceId}`);
  return error ? { ok: false, error: "Couldn't remove it." } : { ok: true };
}

/** Save the edited pacing plan (null resets to the suggested one). */
export async function savePacing(raceId: string, rows: unknown): Promise<Result> {
  await requireUser();
  if (!UUID.test(raceId)) return { ok: false, error: "Unknown race." };
  const supabase = await createClient();
  const { data: race } = await supabase.from("races").select("course, course_leg").eq("id", raceId).maybeSingle();
  if (!race?.course) return { ok: false, error: "Add a course first." };
  const clean = rows === null ? null : cleanPacing(rows, race.course_leg === "bike" ? "bike" : "run", (race.course as Course).distance_m);
  if (rows !== null && !clean) return { ok: false, error: "Some targets look off. Check the numbers." };
  const { error } = await supabase.from("races").update({ pacing: clean }).eq("id", raceId);
  revalidatePath(`/races/${raceId}`);
  return error ? { ok: false, error: "Couldn't save." } : { ok: true, message: clean ? "Pacing plan saved." : "Back to the suggested plan." };
}

/** Coach: put a course session on the athlete's calendar as a draft (review and send as usual). */
export async function addCourseSession(raceId: string, key: string, date: string): Promise<Result> {
  const coach = await requireCoach();
  if (!UUID.test(raceId) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Pick a date." };
  const supabase = await createClient();
  const { data: race } = await supabase.from("races").select("id, athlete_id, race_date").eq("id", raceId).maybeSingle();
  if (!race) return { ok: false, error: "Unknown race." };
  if (date > race.race_date) return { ok: false, error: "Pick a date before the race." };
  const { data: prof } = await supabase.from("profiles").select("timezone").eq("id", race.athlete_id).maybeSingle();
  const view = await getCourseView(supabase, raceId, prof?.timezone ?? "America/Chicago");
  const s = view?.sessions.find((x) => x.key === key);
  if (!view || !s) return { ok: false, error: "That session isn't available." };
  const { data, error } = await supabase
    .from("planned_workouts")
    .insert({ athlete_id: race.athlete_id, coach_id: coach.id, title: s.title, sport: view.leg, scheduled_date: date, description: s.description, steps: s.steps, status: "draft", race_id: race.id })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "Couldn't add it." };
  revalidatePath(`/races/${raceId}`);
  revalidatePath(`/athlete/${race.athlete_id}`);
  return { ok: true, id: data.id, message: "Added as a draft. Review and send it like any workout." };
}
