// Post-workout refuel (dietitian view): did the athlete take something in within 30-60 minutes of
// finishing a session? Pure module so it can be tested directly with `node`.
//
// Meal times are meal_logs.eaten_at: when the athlete says they ate it (the log time unless they changed it).

export type RefuelActivity = { id: string; sport: string | null; name: string | null; start_time: string; duration_s: number | null };
export type RefuelMeal = { id: string; eaten_at: string; local_date: string; label: string | null; carbs_g: number; protein_g: number; kcal: number };
export type RefuelStatus = "within30" | "within60" | "late" | "none" | "notLogged" | "pending";
export type RefuelRow = { activity: RefuelActivity; end: string; localDate: string; status: RefuelStatus; meal: RefuelMeal | null; minutes: number | null };

export const REFUEL = {
  minSessionS: 20 * 60, // shorter sessions don't need a recovery snack
  earlyMin: 10, // a log up to 10 min before the recorded end still counts (watch stopped late)
  lookMin: 180, // how far after the end to look for the first intake
} as const;

const MIN = 60_000;
const localDate = (ms: number, timeZone: string) => new Date(ms).toLocaleDateString("en-CA", { timeZone });

/** One row per session of 20+ minutes, newest first, with the first intake logged after it finished. */
export function refuelRows(acts: RefuelActivity[], meals: RefuelMeal[], timeZone: string, nowMs: number): RefuelRow[] {
  const loggedDays = new Set(meals.map((m) => m.local_date));
  const sorted = [...meals].sort((a, b) => Date.parse(a.eaten_at) - Date.parse(b.eaten_at));
  return acts
    .filter((a) => (a.duration_s ?? 0) >= REFUEL.minSessionS)
    .map((a) => {
      const endMs = Date.parse(a.start_time) + (a.duration_s ?? 0) * 1000;
      const day = localDate(endMs, timeZone);
      const meal = sorted.find((m) => {
        const t = Date.parse(m.eaten_at);
        return t >= endMs - REFUEL.earlyMin * MIN && t <= endMs + REFUEL.lookMin * MIN;
      }) ?? null;
      const minutes = meal ? Math.max(0, Math.round((Date.parse(meal.eaten_at) - endMs) / MIN)) : null;
      let status: RefuelStatus;
      if (minutes !== null) status = minutes <= 30 ? "within30" : minutes <= 60 ? "within60" : "late";
      else if (nowMs - endMs < 60 * MIN) status = "pending"; // still inside the window
      else if (!loggedDays.has(day)) status = "notLogged"; // no meals that day at all: unknown, not missed
      else status = "none";
      return { activity: a, end: new Date(endMs).toISOString(), localDate: day, status, meal, minutes };
    })
    .sort((a, b) => Date.parse(b.end) - Date.parse(a.end));
}

export type RefuelSummary = { sessions: number; scored: number; within30: number; within60: number };

/** Sessions on days with meals logged (and not still in the window) are scored; within60 includes within30. */
export function refuelSummary(rows: RefuelRow[]): RefuelSummary {
  const scored = rows.filter((r) => r.status !== "notLogged" && r.status !== "pending");
  return {
    sessions: rows.length,
    scored: scored.length,
    within30: scored.filter((r) => r.status === "within30").length,
    within60: scored.filter((r) => r.status === "within30" || r.status === "within60").length,
  };
}
