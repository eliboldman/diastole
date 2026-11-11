// Turns a bike workout's steps into the flat list the trainer apps play (iPhone/iPad ride screen,
// Apple TV). Repeats are expanded; power targets become ERG watts; anything else (HR, pace, open)
// rides free with the target shown as a hint. Matches TrainerKit's RideStep Codable shape.
// Pure module (type imports only) so it can be tested directly with `node`.

import type { Duration, Step, Target } from "./garmin-format.ts";

export type RideLength = { time: { seconds: number } } | { distance: { meters: number } } | { open: Record<string, never> };
export type RideStep = { length: RideLength; low?: number; high?: number; label?: string; intensity: string };
export type RidePlan = { id: string; date: string; title: string; why: string | null; ftp: number | null; steps: RideStep[] };

const MAX_STEPS = 300;

function length(d: Duration): RideLength {
  if ((d.type === "time" || d.type === "sendoff") && d.seconds > 0) return { time: { seconds: Math.round(d.seconds) } };
  if (d.type === "distance" && d.meters > 0) return { distance: { meters: Math.round(d.meters * 10) / 10 } };
  return { open: {} };
}

function hint(t: Target | undefined): string | undefined {
  if (!t) return undefined;
  switch (t.type) {
    case "hr_zone":
      return `HR zone ${t.zone}`;
    case "hr_range":
      return `${t.low}–${t.high} bpm`;
    default:
      return undefined;
  }
}

type Flat = Extract<Step, { kind: "step" }>;
const flatten = (steps: Step[]): Flat[] =>
  steps.flatMap((s) => (s.kind === "step" ? [s] : Array.from({ length: Math.min(99, Math.max(1, s.times)) }, () => flatten(s.steps)).flat()));

export function toRideSteps(steps: Step[]): RideStep[] {
  return flatten(steps ?? [])
    .slice(0, MAX_STEPS)
    .map((s) => {
      const out: RideStep = { length: length(s.duration), intensity: s.intensity.toLowerCase() };
      const t = s.target;
      if (t?.type === "power_range" && t.low > 0 && t.high >= t.low) {
        out.low = Math.round(t.low);
        out.high = Math.round(t.high);
      }
      const label = s.note?.trim().slice(0, 60) || hint(t);
      if (label) out.label = label;
      return out;
    });
}

/** Total planned seconds of the timed steps (for list rows). */
export const rideSeconds = (steps: RideStep[]) => steps.reduce((n, s) => n + ("time" in s.length ? s.length.time.seconds : 0), 0);

// --- Race courses on the trainer -------------------------------------------------------------

/** A race's bike course for the trainer apps: elevation profile and climbs (no map, no video). Matches TrainerKit's RideCourse. */
export type RideCourse = {
  id: string; // race id
  name: string; // race name
  course_name: string | null;
  date: string;
  distance_m: number;
  gain_m: number;
  profile: [number, number][]; // [distance m, elevation m], ~1,000 points, smoothed
  climbs: { start_m: number; end_m: number; gain_m: number; grade: number }[];
};

type CourseRow = { id: string; name: string; race_date: string; course_name: string | null; course_leg: string | null; course: unknown };

/** Rows from races → courses the trainer can ride (bike legs with a usable profile only). */
export function toRideCourses(rows: CourseRow[]): RideCourse[] {
  const out: RideCourse[] = [];
  for (const r of rows) {
    const c = r.course as { distance_m?: unknown; gain_m?: unknown; profile?: unknown; climbs?: unknown } | null;
    if (r.course_leg !== "bike" || !c || !Array.isArray(c.profile) || c.profile.length < 2) continue;
    const profile = (c.profile as unknown[])
      .filter((p): p is [number, number] => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))
      .sort((a, b) => a[0] - b[0]);
    const distance = Number(c.distance_m);
    if (profile.length < 2 || !(distance >= 500)) continue;
    const climbs = Array.isArray(c.climbs) ? (c.climbs as RideCourse["climbs"]).filter((k) => Number.isFinite(k?.start_m) && Number.isFinite(k?.end_m)) : [];
    out.push({ id: r.id, name: r.name, course_name: r.course_name, date: r.race_date, distance_m: Math.round(distance), gain_m: Math.round(Number(c.gain_m) || 0), profile, climbs });
  }
  return out;
}

/** Rider plus bike for the course physics: body weight + 9 kg, else a typical 75 kg rider. */
export const rideMassKg = (weightKg: number | null | undefined) => Math.round(((weightKg && weightKg >= 35 && weightKg <= 160 ? weightKg : 75) + 9) * 10) / 10;
