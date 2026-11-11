// Fueling reminders for the Garmin data field, from the same rules as the Fuel page's "during"
// advice (lib/fuel/plan.ts sessionFueling). Pure, for tests. Times are seconds of timer time.

export type WatchFuel = {
  first: number; // first carb reminder
  every: number; // then every…
  carbs: number; // grams per reminder
  drink: number; // drink reminder every… (0 = none)
  n: string; // what to take, short enough for a watch alert
};

/**
 * Null when no fuel is needed (under an hour). Mirrors the Fuel page: 60–75 min a drink is
 * optional, 75–150 min 30–60 g/h from 30–45 min in, longer 60–90 g/h every 20–30 min.
 */
export function watchFuel(minutes: number | null | undefined, opts: { hard?: boolean; swim?: boolean } = {}): WatchFuel | null {
  const m = minutes ?? 0;
  if (m < 60 || opts.swim) return null; // swims: a bottle at the wall, nothing to buzz about
  if (m < 75) return opts.hard ? { first: 30 * 60, every: 20 * 60, carbs: 10, drink: 0, n: "Sip sports drink" } : null;
  if (m < 150) return { first: 35 * 60, every: 35 * 60, carbs: 25, drink: 15 * 60, n: "Gel or chews (~25 g)" };
  return { first: 25 * 60, every: 25 * 60, carbs: 30, drink: 15 * 60, n: "Gel, chews or drink (~30 g)" };
}

/** How many carb reminders a session gets, for "took all / some / none" afterwards. */
export function reminders(f: WatchFuel | null, minutes: number): number {
  if (!f) return 0;
  const sec = minutes * 60;
  return sec < f.first ? 0 : Math.floor((sec - f.first) / f.every) + 1;
}
