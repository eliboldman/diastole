import type { Peek } from "@/components/calendar/WorkoutPeek";
import { sportLabel } from "@/lib/activity/format";
import { estimateSession } from "@/lib/fuel/plan";
import { describeStrength, type StrengthItem } from "@/lib/strength/workout";
import { clock12 } from "@/lib/week-prefs";
import { describe } from "@/lib/workouts/describe";
import { inferPool, type Brick, type Pool, type PoolUnit, type Step } from "@/lib/workouts/garmin-format";
import { sealed, titleFor } from "@/lib/workouts/mystery";

/** Columns a planned workout needs for its preview bubble. */
export const PEEK_COLUMNS = "id, athlete_id, scheduled_date, title, sport, status, description, why, steps, brick, strength, start_time, pool_length, pool_unit, mystery, revealed_at, plan_meta";

export type PeekRow = {
  id: string; athlete_id: string; scheduled_date: string; title: string; sport: string; status: string; description: string | null; why?: string | null;
  steps: Step[] | null; brick: Brick; strength: StrengthItem[] | null; start_time: string | null; pool_length: number | null; pool_unit: string | null;
  mystery: boolean | null; revealed_at: string | null; plan_meta: { planned_duration_min?: number } | null;
};

const PEEK_LINES = 8;

/**
 * What the preview bubble shows for one planned session. A sealed mystery stays sealed for the athlete
 * (coaches wrote it, so they see it). `who` labels the athlete on a coach's all-athletes view.
 */
export function toPeek(w: PeekRow, o: { coach: boolean; done: boolean; units: "mi" | "km"; who?: string }): Peek {
  const hidden = !o.coach && sealed(w, o.done);
  const saved: Pool = w.pool_length && w.pool_unit ? { length: Number(w.pool_length), unit: w.pool_unit as PoolUnit } : null;
  const steps = (w.steps ?? []) as Step[];
  const pool: Pool = w.sport === "swim" ? inferPool(steps, saved) : saved;
  const brick = w.sport === "bike" && w.brick?.steps?.length ? w.brick : null;
  const session = estimateSession(steps, w.sport, null, pool);
  const planned = Number(w.plan_meta?.planned_duration_min);
  const all =
    w.sport === "strength"
      ? describeStrength(w.strength ?? [], o.units === "km" ? "kg" : "lb")
      : [...describe(steps, o.units, pool, w.sport === "swim"), ...(brick ? ["Then run:", ...describe(brick.steps, o.units)] : [])];
  return {
    id: w.id,
    href: o.coach ? `/athlete/${w.athlete_id}/workouts/${w.id}` : `/training/workouts/${w.id}`,
    title: o.coach ? w.title : titleFor(w, o.done),
    who: o.who,
    badge: { label: w.status === "draft" ? "Draft" : o.done ? "Done" : "Planned", done: o.done },
    sport: sportLabel(w.sport),
    time: w.start_time ? clock12(String(w.start_time).slice(0, 5)) : null,
    minutes: Number.isFinite(planned) && planned > 0 ? Math.round(planned) : session.minutes,
    hardMinutes: session.hardMinutes,
    // The coach's "why" is the most useful line for an athlete getting ready, so it leads when there's no description.
    description: hidden ? null : (w.description ?? w.why ?? null),
    lines: hidden ? [] : all.slice(0, PEEK_LINES),
    more: hidden ? 0 : Math.max(0, all.length - PEEK_LINES),
    sealed: hidden,
  };
}
