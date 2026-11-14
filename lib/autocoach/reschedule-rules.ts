// Where a missed key session can go. Rules from the plan: mornings only (the session keeps its time),
// no swims on Friday or Saturday (pool), never two key days in a row, nothing in race week.
// Pure module, testable with `node`.

export type DaySession = { date: string; sport: string; key: boolean };

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const weekday = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay(); // 0 Sun … 6 Sat

/**
 * The first day from tomorrow through three days out where the session fits, or null (then it's
 * dropped: a missed key session isn't worth squeezing in at the cost of the next one).
 */
export function pickRescheduleDate(missed: { sport: string }, upcoming: DaySession[], today: string, raceDate: string): string | null {
  const keyOn = (d: string) => upcoming.some((s) => s.date === d && s.key);
  const raceWeekStart = addDays(raceDate, -6);
  for (let i = 1; i <= 3; i++) {
    const d = addDays(today, i);
    if (d >= raceWeekStart) return null;
    if (missed.sport === "swim" && (weekday(d) === 5 || weekday(d) === 6)) continue;
    if (keyOn(d) || keyOn(addDays(d, -1)) || keyOn(addDays(d, 1))) continue;
    // Not on top of another session of the same sport that day.
    if (upcoming.some((s) => s.date === d && s.sport === missed.sport)) continue;
    return d;
  }
  return null;
}
