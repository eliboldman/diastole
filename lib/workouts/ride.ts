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
