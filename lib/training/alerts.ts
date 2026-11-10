// Missed-session alerts for the coach: yesterday's key sessions that were skipped, cut short, or
// mostly off target. Rules only. Pure module, testable with `node`.

import type { Compliance } from "../activity/compare.ts";
import type { Step } from "../workouts/garmin-format.ts";
import { workoutTotals } from "../workouts/totals.ts";
import type { WeekSession } from "./week.ts";

const KEY_WORDS = /interval|tempo|threshold|long|race|vo2|brick|over.?under|repeats?|fartlek|hills?|\d\s*[x×]\s*\(?\d|sweet ?spot|targeting/i;

/** A session worth an alert when it doesn't happen as planned. */
export function isKeySession(title: string, steps: Step[], sport: string): boolean {
  if (KEY_WORDS.test(title)) return true;
  if ((steps ?? []).some((s) => s.kind === "repeat" && s.steps.some((c) => c.kind === "step" && c.intensity === "INTERVAL"))) return true;
  const t = workoutTotals(steps ?? [], sport);
  return t.hardSeconds >= 600 || t.seconds >= 90 * 60;
}

export type SessionAlert = { kind: "missed" | "short" | "off"; text: string };

export function sessionAlert(s: WeekSession, compliance: Compliance | null): SessionAlert | null {
  if (s.status === "missed") return { kind: "missed", text: "Missed" };
  if (s.status === "short") return { kind: "short", text: `Cut short: ${s.ratio !== null ? Math.round(s.ratio * 100) : "?"}% of the planned time` };
  if (s.status === "done" && compliance && compliance.judged >= 3 && compliance.on / compliance.judged < 0.5)
    return { kind: "off", text: `Mostly off target: ${compliance.on} of ${compliance.judged} steps on target` };
  return null;
}
