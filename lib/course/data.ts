import type { SupabaseClient } from "@supabase/supabase-js";

import { predictInput } from "@/lib/predict/data";
import { predictRun, soloIF, triFor } from "@/lib/predict/predict";

import { cleanPacing, courseSessions, courseTime, defaultPacing, readiness, segments, type Course, type CourseSession, type Leg, type PaceRow, type Readiness } from "./course";

const DAY = 86_400_000;

export type CourseView = {
  leg: Leg;
  name: string | null;
  course: Course;
  estimate: { course: number; flat: number } | null; // seconds
  basis: string | null; // what the estimate assumes
  pacing: PaceRow[];
  pacingEdited: boolean;
  readiness: Readiness | null;
  sessions: CourseSession[];
  added: { key: string; id: string; date: string; status: string }[];
};

/** Everything the race page shows about the course. Caller's client; row-level security applies. */
export async function getCourseView(supabase: SupabaseClient, raceId: string, tz: string): Promise<CourseView | null> {
  const { data: race } = await supabase.from("races").select("id, athlete_id, sport, distance_km, course, course_leg, course_name, pacing").eq("id", raceId).maybeSingle();
  if (!race?.course) return null;
  const course = race.course as Course;
  const leg = (race.course_leg === "bike" ? "bike" : "run") as Leg;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: tz || "America/Chicago" });
  const [input, { data: recent }, { data: added }] = await Promise.all([
    predictInput(supabase, race.athlete_id, today),
    supabase.from("activities").select("sport, duration_s, distance_m, elevation_gain_m").eq("athlete_id", race.athlete_id).gte("start_time", new Date(Date.now() - 42 * DAY).toISOString()).limit(500),
    supabase.from("planned_workouts").select("id, title, scheduled_date, status").eq("race_id", race.id).is("deleted_at", null).order("scheduled_date"),
  ]);
  const tri = race.sport === "tri" ? triFor(race.distance_km ? Number(race.distance_km) : null) : null;
  const segs = segments(course);
  let flatPace: number | null = null;
  let power: number | null = null;
  let basis: string | null = null;
  if (leg === "run") {
    const p = predictRun(course.distance_m, input);
    if (p) {
      flatPace = (p.range.mid / (course.distance_m / 1000)) * (tri ? tri.runFade : 1);
      basis = tri ? "Your open-run estimate, slowed for running off the bike, adjusted for each grade." : "Your run estimate for this distance, adjusted for each grade.";
    }
  } else if (input.ftp) {
    // Standalone: the solo-effort fraction of FTP for about this long; a triathlon: a steadier share.
    let f = 0.85;
    if (tri) f = tri.bikeIF;
    else for (let i = 0; i < 3; i++) f = soloIF(courseTime("bike", segs, { power: input.ftp * f, massKg: (input.weightKg ?? 70) + 10 }));
    power = Math.round(input.ftp * f);
    basis = `${power} W average (${Math.round(f * 100)}% of FTP), ${input.weightKg ? "your weight" : "70 kg rider"} + 10 kg bike, a reasonably aero position, no wind.`;
  }
  const mass = (input.weightKg ?? 70) + 10;
  const opts = { flatPace: flatPace ?? undefined, power: power ?? undefined, massKg: mass };
  const estimate =
    flatPace || power
      ? {
          course: courseTime(leg, segs, opts),
          flat: courseTime(leg, [{ start_m: 0, end_m: course.distance_m, grade: 0, gain_m: 0, kind: "rolling" }], opts),
        }
      : null;
  const saved = cleanPacing(race.pacing, leg, course.distance_m);
  const pacing = saved ?? (estimate ? defaultPacing(leg, segs, opts) : []);
  const done = (added ?? []).filter((w) => w.status === "completed").length;
  const sessions = courseSessions(leg, course, { flatPace, ftp: input.ftp, massKg: mass });
  return {
    leg,
    name: race.course_name ?? null,
    course,
    estimate,
    basis,
    pacing,
    pacingEdited: Boolean(saved),
    readiness: estimate ? readiness(leg, course, estimate.course, recent ?? [], done) : null,
    sessions,
    added: (added ?? []).map((w) => ({ key: sessions.find((s) => s.title === w.title)?.key ?? "", id: w.id, date: w.scheduled_date, status: w.status })),
  };
}
