// "Life happened": turn what the athlete says (short on time, feeling off, missed yesterday,
// can't train today) into a change to their plan. Small changes apply on their own; bigger ones go
// to the coach as a proposal. Rules only. Pure, for tests.
import { adjustSteps } from "./adjust.ts";
import type { Sport, Step } from "./garmin-format.ts";

export type LifeReason = "minutes" | "feeling_off" | "missed" | "cant_today";
export type Proposal =
  | { action: "steps"; steps: Step[] } // shortened or easier
  | { action: "move"; date: string }
  | { action: "skip" }; // take it off the plan
export type LifePlan = { auto: boolean; proposal: Proposal | null; summary: string; why: string };
type W = { title: string; sport: Sport; steps: Step[]; scheduled_date: string };

const AUTO_SHORTEN = 0.7; // keeping 70% or more of the session is a small change

/** Total time of the time-based steps, or null when any step is a distance or "until lap". */
export function totalSeconds(steps: Step[]): number | null {
  let t = 0;
  for (const s of steps) {
    if (s.kind === "repeat") {
      const inner = totalSeconds(s.steps);
      if (inner === null) return null;
      t += inner * s.times;
    } else if (s.duration.type === "time" || s.duration.type === "sendoff") t += s.duration.seconds;
    else return null;
  }
  return t;
}

/** Fit a time-based workout into `target` seconds: fewer reps first, then every step scaled down. */
export function shortenTo(steps: Step[], target: number): Step[] {
  const total = totalSeconds(steps);
  if (total === null || total <= target) return steps;
  const f = target / total;
  const scale = (s: Step): Step => {
    if (s.kind === "repeat") return { ...s, times: Math.max(1, Math.round(s.times * f)), steps: s.steps };
    if (s.duration.type !== "time") return s;
    return { ...s, duration: { type: "time", seconds: Math.max(60, Math.round((s.duration.seconds * f) / 30) * 30) } };
  };
  let out = steps.map(scale);
  // If fewer reps already did enough, put the warm-up and cool-down back.
  const afterReps = totalSeconds(out)!;
  if (afterReps < target * 0.9) {
    const repsOnly = steps.map((s) => (s.kind === "repeat" ? scale(s) : s));
    if (totalSeconds(repsOnly)! <= target) out = repsOnly;
  }
  return out;
}

/** A "key" session worth making up: intervals, tempo, threshold, races or long ones. */
export function isKey(w: W) {
  const t = totalSeconds(w.steps);
  return /interval|tempo|threshold|vo2|race|long|\d\s*[x×]\s*\d/i.test(w.title) || w.steps.some((s) => s.kind === "repeat") || (t !== null && t >= 75 * 60);
}

const mins = (s: number) => `${Math.round(s / 60)} min`;
const dayName = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });

/**
 * What to do. `freeDays` are the next days with nothing planned (YYYY-MM-DD, soonest first);
 * `readiness` is today's flag.
 */
export function planLife(o: { reason: LifeReason; workout: W; minutes?: number; readiness?: string | null; freeDays?: string[] }): LifePlan {
  const w = o.workout;
  const total = totalSeconds(w.steps);

  if (o.reason === "minutes") {
    const target = Math.max(10, Math.min(240, o.minutes ?? 30)) * 60;
    if (total !== null && total <= target) return { auto: true, proposal: null, summary: "It already fits", why: `${w.title} takes about ${mins(total)}, so no change needed.` };
    if (total === null) return { auto: false, proposal: null, summary: `Ask your coach to fit it into ${mins(target)}`, why: "This one is set by distance, so your coach will trim it." };
    const steps = shortenTo(w.steps, target);
    const kept = (totalSeconds(steps) ?? total) / total;
    return {
      auto: kept >= AUTO_SHORTEN,
      proposal: { action: "steps", steps },
      summary: `Shortened to about ${mins(totalSeconds(steps) ?? target)}`,
      why: kept >= AUTO_SHORTEN ? "A small trim: same session, a bit less of it." : `That's less than ${Math.round(AUTO_SHORTEN * 100)}% of the session, so your coach gets a quick look first.`,
    };
  }

  if (o.reason === "feeling_off") {
    if (o.readiness === "red") return { auto: false, proposal: { action: "skip" }, summary: "Rest today", why: "You're feeling off and readiness is low, so your coach will confirm a rest day." };
    const steps = adjustSteps(w.steps, { direction: "easier", percent: 10, scope: "both" }, { swim: w.sport === "swim", pool: null });
    const same = JSON.stringify(steps) === JSON.stringify(w.steps);
    return same
      ? { auto: true, proposal: null, summary: "Keep it easy", why: "This one is already easy. Go by feel and stop if you need to." }
      : { auto: true, proposal: { action: "steps", steps }, summary: "Made about 10% easier", why: "Slightly shorter and gentler targets. Go by feel." };
  }

  // Missed yesterday or can't train today.
  const when = o.reason === "missed" ? "yesterday's" : "today's";
  if (!isKey(w)) return { auto: true, proposal: { action: "skip" }, summary: `Let ${when} session go`, why: "It was an easy one, so there's no need to make it up." };
  const day = o.freeDays?.[0];
  return day
    ? { auto: false, proposal: { action: "move", date: day }, summary: `Move ${w.title} to ${dayName(day)}`, why: "It's a key session, so your coach will confirm the new day." }
    : { auto: false, proposal: { action: "skip" }, summary: `Skip ${w.title}`, why: "It's a key session and the next few days are full, so your coach will decide." };
}

// ---------------------------------------------------------------- back from sick or injured

export type RampWorkout = { date: string; title: string; sport: Sport; steps: Step[] };

/**
 * A gentle way back: easy heart-rate-zone-2 sessions with rest days between, longer the longer
 * the time off. The coach approves it before anything is sent.
 */
export function buildRamp(o: { daysOff: number; sport: Sport; start: string }): RampWorkout[] {
  const plan = o.daysOff <= 3 ? [20, 0, 30, 40] : o.daysOff <= 10 ? [15, 0, 20, 0, 30, 30, 0, 40] : [15, 0, 15, 0, 20, 0, 25, 30, 0, 35, 40];
  const word = o.sport === "bike" ? "ride" : o.sport === "swim" ? "swim" : "run";
  const out: RampWorkout[] = [];
  plan.forEach((m, i) => {
    if (!m) return;
    const date = new Date(Date.parse(`${o.start}T12:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10);
    const minutes = o.sport === "swim" ? Math.min(m, 30) : m;
    out.push({
      date,
      title: `Easy ${minutes} min ${word} (easing back)`,
      sport: o.sport,
      steps: [
        o.sport === "swim"
          ? { kind: "step", intensity: "MAIN", duration: { type: "time", seconds: minutes * 60 }, target: { type: "swim_effort", level: 3 } }
          : { kind: "step", intensity: "ACTIVE", duration: { type: "time", seconds: minutes * 60 }, target: { type: "hr_zone", zone: 2 } },
      ],
    });
  });
  return out;
}
