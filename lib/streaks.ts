// Streaks, rules only. Endurance training has rest days, so nothing here is a daily streak:
//  - weeks: weeks in a row with 3+ workouts (same rule as the profile badge);
//  - plan: the coach's planned workouts done in a row, with no misses;
//  - check-ins: workouts in a row with a check-in (feel / RPE / pain).

const DAY = 86_400_000;
const localDay = (iso: string, tz: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: tz });
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const monday = (d: string) => addDays(d, -((new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7));
const family = (s: string | null) => (/swim/i.test(s ?? "") ? "swim" : /run|treadmill|track|trail/i.test(s ?? "") ? "run" : /cycl|bik|ride|spin/i.test(s ?? "") ? "bike" : "other");

/** Weeks in a row with 3+ workouts, through last week, plus this week once it reaches 3. */
export function weekStreak(starts: string[], tz: string, now = new Date()) {
  const perWeek = new Map<string, number>();
  for (const s of starts) {
    const w = monday(localDay(s, tz));
    perWeek.set(w, (perWeek.get(w) ?? 0) + 1);
  }
  const thisWeek = monday(now.toLocaleDateString("en-CA", { timeZone: tz }));
  let n = 0;
  for (let w = (perWeek.get(thisWeek) ?? 0) >= 3 ? thisWeek : addDays(thisWeek, -7); (perWeek.get(w) ?? 0) >= 3; w = addDays(w, -7)) n++;
  return n;
}

export type PlanForStreak = { id: string; date: string; sport: string | null };
export type ActForStreak = { id: string; start_time: string; sport: string | null; duration_s: number | null; planned_workout_id: string | null };

/**
 * Planned workouts done in a row, newest first. Today's only counts once it's done (it isn't a miss yet).
 * Excused days (a streak shield, sick/injured mode, a "Life happened" skip) pass without breaking it.
 */
export function planStreak(plans: PlanForStreak[], acts: ActForStreak[], tz: string, today: string, excused: Set<string> = new Set()) {
  return planStreakDetail(plans, acts, tz, today, excused).n;
}

/** The streak, plus the missed day that ended it (what a streak shield could cover). */
export function planStreakDetail(plans: PlanForStreak[], acts: ActForStreak[], tz: string, today: string, excused: Set<string> = new Set()) {
  const days = acts.map((a) => ({ ...a, day: localDay(a.start_time, tz), fam: family(a.sport) }));
  const done = (p: PlanForStreak) => days.some((a) => a.planned_workout_id === p.id || (a.day === p.date && a.fam === family(p.sport)));
  let n = 0;
  let brokeOn: string | null = null;
  for (const p of [...plans].filter((p) => p.date <= today).sort((a, b) => b.date.localeCompare(a.date))) {
    if (done(p)) n++;
    else if (p.date === today || excused.has(p.date)) continue;
    else {
      brokeOn = p.date;
      break;
    }
  }
  return { n, brokeOn };
}

/** Workouts (10+ min) in a row with a check-in. The last day's workouts get a grace period. */
export function checkinStreak(acts: ActForStreak[], checked: Set<string>, now = new Date()) {
  let n = 0;
  let grace = true;
  for (const a of [...acts].filter((a) => (a.duration_s ?? 0) >= 600).sort((x, y) => y.start_time.localeCompare(x.start_time))) {
    if (checked.has(a.id)) {
      n++;
      grace = false;
    } else if (grace && now.getTime() - Date.parse(a.start_time) < DAY) continue;
    else break;
  }
  return n;
}
