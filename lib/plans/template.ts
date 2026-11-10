// Plan templates: turning dated workouts into week/day slots, and slots back into dated workouts for
// one athlete (scaled to their zones, moved onto days their week allows). Pure module, testable
// with `node`.

import type { Brick, Pool, Step } from "../workouts/garmin-format.ts";
import { resolve, stripRel, type Missing, type RelZones } from "../workouts/relative.ts";
import { cleanWeek, WEEKDAYS, type WeekPrefs } from "../week-prefs.ts";

const DAY = 86_400_000;
export const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
export const mondayOf = (d: string) => addDays(d, -((new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7));
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY);

export type Sport = "run" | "bike" | "swim";
export type TemplateWorkout = {
  id?: string;
  week: number; // 1-based
  day: number; // 0 = Monday
  position: number;
  title: string;
  sport: Sport;
  description: string | null;
  why: string | null;
  steps: Step[];
  brick: Brick;
  pool: Pool;
  updated_at?: string;
};

export type DatedWorkout = { scheduled_date: string; title: string; sport: string; description: string | null; why?: string | null; steps: Step[]; brick?: Brick; pool: Pool };

/** Dated workouts (an athlete's block) as template slots, counting weeks from the Monday of `from`. */
export function toTemplate(workouts: DatedWorkout[], from: string): { weeks: number; workouts: TemplateWorkout[] } {
  const start = mondayOf(from);
  const out: TemplateWorkout[] = [];
  const perDay = new Map<string, number>();
  for (const w of [...workouts].sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))) {
    if (!["run", "bike", "swim"].includes(w.sport)) continue;
    const diff = daysBetween(start, w.scheduled_date);
    if (diff < 0) continue;
    const slot = `${Math.floor(diff / 7)}:${diff % 7}`;
    const position = perDay.get(slot) ?? 0;
    perDay.set(slot, position + 1);
    out.push({
      week: Math.floor(diff / 7) + 1,
      day: diff % 7,
      position,
      title: w.title,
      sport: w.sport as Sport,
      description: w.description,
      why: w.why ?? null,
      steps: w.steps,
      brick: w.brick ?? null,
      pool: w.pool,
    });
  }
  const weeks = Math.max(1, ...out.map((w) => w.week));
  return { weeks, workouts: out };
}

/** Monday of week 1: from the race (the last week holds it, or ends just before it) or a start date. */
export function startMonday(opts: { weeks: number; raceWeek: boolean; raceDate?: string | null; startDate?: string | null }): string {
  if (opts.raceDate) return addDays(mondayOf(opts.raceDate), -7 * (opts.raceWeek ? opts.weeks - 1 : opts.weeks));
  return mondayOf(opts.startDate ?? new Date().toISOString().slice(0, 10));
}

export type PlannedItem = {
  tw: TemplateWorkout;
  date: string;
  movedFrom: string | null; // the template's day, when moved to fit the athlete's week
  steps: Step[];
  brick: Brick;
  missing: Missing[]; // zones this athlete doesn't have (targets kept as written)
  past: boolean; // before today: not created
};

/** Can this sport go on this day of the athlete's week? Days with no preference take anything. */
function allowed(prefs: WeekPrefs, day: number, sport: Sport) {
  const p = prefs[WEEKDAYS[day][0]];
  if (p.sports.includes("rest")) return false;
  if (!p.sports.length) return true;
  return p.sports.includes(sport);
}

/** The template laid onto one athlete's calendar from `start` (a Monday). */
export function applyTo(opts: { workouts: TemplateWorkout[]; start: string; zones: RelZones; week?: unknown; today: string }): PlannedItem[] {
  const prefs = cleanWeek(opts.week);
  const taken = new Map<string, Set<Sport>>(); // date -> sports already placed
  const items: PlannedItem[] = [];
  const ordered = [...opts.workouts].sort((a, b) => a.week - b.week || a.day - b.day || a.position - b.position);
  for (const tw of ordered) {
    let day = tw.day;
    if (!allowed(prefs, day, tw.sport)) {
      // Nearest day in the same week that allows the sport and doesn't already have it.
      for (const off of [1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6]) {
        const d = tw.day + off;
        if (d < 0 || d > 6) continue;
        const date = addDays(opts.start, (tw.week - 1) * 7 + d);
        if (allowed(prefs, d, tw.sport) && !taken.get(date)?.has(tw.sport)) {
          day = d;
          break;
        }
      }
    }
    const date = addDays(opts.start, (tw.week - 1) * 7 + day);
    if (!taken.has(date)) taken.set(date, new Set());
    taken.get(date)!.add(tw.sport);
    const main = resolve(tw.steps, opts.zones, tw.pool);
    const run = tw.brick?.steps?.length ? resolve(tw.brick.steps, opts.zones, null) : null;
    items.push({
      tw,
      date,
      movedFrom: day !== tw.day ? addDays(opts.start, (tw.week - 1) * 7 + tw.day) : null,
      steps: main.steps,
      brick: run ? { sport: "run", steps: run.steps } : null,
      missing: [...new Set([...main.missing, ...(run?.missing ?? [])])],
      past: date < opts.today,
    });
  }
  return items;
}

// ---------------------------------------------------------------- template updates

export type AppliedRow = {
  id: string;
  template_workout_id: string | null;
  scheduled_date: string;
  title: string;
  description: string | null;
  steps: Step[];
  brick: Brick;
  status: string;
  done: boolean; // an activity is linked to it
};
export type Change =
  | { kind: "update"; row: AppliedRow; item: PlannedItem; what: string[] }
  | { kind: "add"; item: PlannedItem }
  | { kind: "remove"; row: AppliedRow };

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const bare = (s: Step[] | undefined) => stripRel(s ?? []);

/**
 * What changing the template would change for one athlete, upcoming sessions only (today on, not
 * already done). Their dates stay where they are; only content changes, additions and removals.
 */
export function updatesFor(opts: { rows: AppliedRow[]; items: PlannedItem[]; today: string }): Change[] {
  const changes: Change[] = [];
  const byTw = new Map(opts.rows.filter((r) => r.template_workout_id).map((r) => [r.template_workout_id!, r]));
  const seen = new Set<string>();
  for (const item of opts.items) {
    const twId = item.tw.id;
    if (!twId) continue;
    seen.add(twId);
    const row = byTw.get(twId);
    if (!row) {
      if (!item.past) changes.push({ kind: "add", item });
      continue;
    }
    if (row.done || row.scheduled_date < opts.today) continue;
    const what: string[] = [];
    if (row.title !== item.tw.title) what.push("title");
    if ((row.description ?? null) !== (item.tw.description ?? null)) what.push("description");
    if (!same(bare(row.steps), bare(item.steps))) what.push("steps");
    if (!same(row.brick ? bare(row.brick.steps) : null, item.brick ? bare(item.brick.steps) : null)) what.push("run off the bike");
    if (what.length) changes.push({ kind: "update", row, item, what });
  }
  for (const row of opts.rows) {
    if (row.template_workout_id && !seen.has(row.template_workout_id) && !row.done && row.scheduled_date >= opts.today) changes.push({ kind: "remove", row });
  }
  return changes;
}
