// Server side: turn an athlete's real training into avatar progress (achievements, unlocks, aura,
// pins) and today's state (mood, where the load landed). Writes achievements with the admin client.
import type { SupabaseClient } from "@supabase/supabase-js";

import { bestsOf, RUN_DISTANCES, type Bests } from "@/lib/activity/bests";
import type { Streams } from "@/lib/activity/fit";
import type { AvatarState, Mood } from "@/components/avatar/Avatar";
import { normalizeStrain, recentStrain, type Strain } from "@/lib/avatar/strain";
import { sportGroup } from "@/lib/pod-stickers";

export type Achievement = { key: string; value: number | null; activity_id: string | null; achieved_at: string };

export { PR_LABEL } from "./pr-labels";

const BEST_KEY: Record<keyof Bests, string> = { run_1mi: "pr_1mi", run_5k: "pr_5k", run_10k: "pr_10k", run_half: "pr_half", power_20m: "pr_power_20m" };
const LOWER_IS_BETTER = new Set(["pr_1mi", "pr_5k", "pr_10k", "pr_half"]);

/**
 * Fill in best efforts for workouts that have streams but haven't been scanned yet, in batches,
 * for up to ~4 s per call (older history finishes over the next visits).
 */
async function scanBests(admin: SupabaseClient, athleteId: string, batch = 25, budgetMs = 4000) {
  const until = Date.now() + budgetMs;
  while (Date.now() < until) {
    const { data } = await admin.from("activity_details").select("activity_id, streams, activities(sport)").eq("athlete_id", athleteId).is("bests", null).limit(batch);
    if (!data?.length) return;
    await Promise.all(
      data.map((row) => {
        const sport = (row.activities as unknown as { sport: string | null } | null)?.sport ?? null;
        return admin.from("activity_details").update({ bests: bestsOf(row.streams as Streams, sport) }).eq("activity_id", row.activity_id);
      }),
    );
    if (data.length < batch) return;
  }
}

/** Monday of the week containing this instant, in the athlete's timezone, as YYYY-MM-DD. */
function weekOf(iso: string, timeZone: string) {
  const local = new Date(new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(iso)) + "T12:00:00Z");
  const dow = (local.getUTCDay() + 6) % 7;
  local.setUTCDate(local.getUTCDate() - dow);
  return local.toISOString().slice(0, 10);
}

export type Progress = {
  achievements: Achievement[]; // every improvement, oldest first
  unlocked: Set<string>;
  aura: number;
  badges: string[];
  streak: { current: number; best: number };
};

/** Recompute achievements from real data, store new ones, and summarize. */
export async function refreshProgress(admin: SupabaseClient, athleteId: string, timeZone: string): Promise<Progress> {
  await scanBests(admin, athleteId);
  const since = new Date(Date.now() - 2 * 365 * 86_400_000).toISOString();
  const [{ data: details }, { data: acts }, { data: zones }, { data: goal }] = await Promise.all([
    admin.from("activity_details").select("activity_id, bests, activities!inner(start_time)").eq("athlete_id", athleteId).not("bests", "is", null),
    admin.from("activities").select("id, sport, start_time, distance_m").eq("athlete_id", athleteId).gte("start_time", since).order("start_time"),
    admin.from("zone_history").select("field, value, changed_at").eq("athlete_id", athleteId).order("changed_at"),
    admin.from("athlete_goals").select("race_name").eq("athlete_id", athleteId).maybeSingle(),
  ]);

  const out: Achievement[] = [];
  const improve = (key: string, value: number, activity_id: string | null, at: string, best: Map<string, number>) => {
    const prev = best.get(key);
    const better = prev === undefined || (LOWER_IS_BETTER.has(key) ? value < prev : value > prev);
    if (better) {
      best.set(key, value);
      out.push({ key, value, activity_id, achieved_at: at });
    }
  };

  // PRs from best efforts, in date order.
  const best = new Map<string, number>();
  const rows = (details ?? [])
    .map((d) => ({ id: d.activity_id as string, bests: (d.bests ?? {}) as Bests, at: (d.activities as unknown as { start_time: string }).start_time }))
    .sort((a, b) => a.at.localeCompare(b.at));
  for (const r of rows) for (const [k, v] of Object.entries(r.bests) as [keyof Bests, number][]) if (BEST_KEY[k]) improve(BEST_KEY[k], v, r.id, r.at, best);

  // Longest run / ride.
  for (const a of acts ?? []) {
    const g = sportGroup(a.sport);
    if (a.distance_m && (g === "run" || g === "bike")) improve(g === "run" ? "longest_run" : "longest_ride", Math.round(Number(a.distance_m)), a.id, a.start_time, best);
  }

  // Consistency: weeks with 3+ workouts in a row.
  const perWeek = new Map<string, number>();
  for (const a of acts ?? []) perWeek.set(weekOf(a.start_time, timeZone), (perWeek.get(weekOf(a.start_time, timeZone)) ?? 0) + 1);
  const weeks = [...perWeek.keys()].sort();
  let run = 0;
  let bestRun = 0;
  let prevWeek: string | null = null;
  for (const w of weeks) {
    const consecutive = prevWeek && Date.parse(w) - Date.parse(prevWeek) === 7 * 86_400_000;
    run = perWeek.get(w)! >= 3 ? (consecutive && run > 0 ? run + 1 : 1) : 0;
    bestRun = Math.max(bestRun, run);
    for (const n of [4, 8, 12]) if (run === n) out.push({ key: `consistency_${n}w`, value: n, activity_id: null, achieved_at: new Date(Date.parse(w) + 6 * 86_400_000 + 12 * 3_600_000).toISOString() });
    prevWeek = w;
  }
  const thisWeek = weekOf(new Date().toISOString(), timeZone);
  const lastWeek = new Date(Date.parse(thisWeek) - 7 * 86_400_000).toISOString().slice(0, 10);
  // The current streak counts through last week, plus this week once it reaches 3.
  let current = 0;
  for (let w = (perWeek.get(thisWeek) ?? 0) >= 3 ? thisWeek : lastWeek; (perWeek.get(w) ?? 0) >= 3; w = new Date(Date.parse(w) - 7 * 86_400_000).toISOString().slice(0, 10)) current++;

  // Coach-set thresholds that improved.
  const lastZone = new Map<string, number>();
  for (const z of zones ?? []) {
    const v = Number(z.value);
    const prev = lastZone.get(z.field);
    if (prev !== undefined && v > prev && (z.field === "ftp_w" || z.field === "threshold_speed_mps"))
      out.push({ key: z.field === "ftp_w" ? "ftp_up" : "threshold_up", value: v, activity_id: null, achieved_at: z.changed_at });
    lastZone.set(z.field, v);
  }

  out.sort((a, b) => a.achieved_at.localeCompare(b.achieved_at));
  if (out.length) {
    await admin
      .from("achievements")
      .upsert(out.map((a) => ({ ...a, athlete_id: athleteId })), { onConflict: "athlete_id,key,achieved_at", ignoreDuplicates: true });
  }

  const s = summarize(out, { current, best: bestRun }, Boolean(goal?.race_name));
  return { achievements: out, ...s, streak: { current, best: bestRun } };
}

/** Unlocks, aura (0-4) and pins from achievements alone (also used for pod mates' pages). */
export function summarize(out: Achievement[], streak: { current: number; best: number }, goalRace = false) {
  const count = (k: string) => out.filter((a) => a.key === k).length;
  const prImproved = Object.values(BEST_KEY).some((k) => count(k) > 1);
  const longestRun = Math.max(0, ...out.filter((a) => a.key === "longest_run").map((a) => a.value ?? 0));
  const unlocked = new Set<string>();
  if (prImproved) unlocked.add("pr_any");
  if (count("pr_half") > 0 || longestRun >= 21097.5) unlocked.add("pr_half");
  for (const n of [4, 8, 12]) if (count(`consistency_${n}w`) > 0) unlocked.add(`consistency_${n}w`);
  if (count("ftp_up") > 0) unlocked.add("ftp_up");
  if (count("threshold_up") > 0) unlocked.add("threshold_up");
  if (goalRace) unlocked.add("goal_race");

  const recent = (k: string, days: number) => out.some((a) => a.key.startsWith(k) && Date.now() - Date.parse(a.achieved_at) < days * 86_400_000);
  const recentPr = Object.values(BEST_KEY).some((k) => count(k) > 1 && recent(k, 30));
  const bestStreak = Math.max(streak.best, count("consistency_8w") ? 8 : 0);
  const aura = Math.min(
    4,
    (prImproved ? 1 : 0) + (streak.current >= 4 ? 1 : 0) + (bestStreak >= 8 ? 1 : 0) + (count("ftp_up") + count("threshold_up") > 0 ? 1 : 0) + (unlocked.has("pr_half") ? 1 : 0),
  );
  const badges = [recentPr && "⭐", streak.current >= 4 && "🔥", (recent("ftp_up", 90) || recent("threshold_up", 90)) && "⚡", unlocked.has("pr_half") && "🏅"].filter(Boolean) as string[];
  return { unlocked, aura, badges };
}

/** Today's look: mood from the latest readiness, and the muscles still recovering (last 72 h, fading). */
export async function todayState(db: SupabaseClient, athleteId: string): Promise<{ mood: Mood; strain: Strain; note: string | null; date: string | null }> {
  const since = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const [{ data: r }, { data: worked }] = await Promise.all([
    db.from("readiness_scores").select("date, overall, note").eq("athlete_id", athleteId).order("date", { ascending: false }).limit(1).maybeSingle(),
    db.from("activity_strain").select("auto, custom, activities!inner(start_time)").eq("athlete_id", athleteId).gte("activities.start_time", since),
  ]);
  // Only today's or yesterday's readiness counts as "today".
  const fresh = r && Date.now() - Date.parse(`${r.date}T12:00:00Z`) < 2.5 * 86_400_000;
  const mood: Mood = !fresh ? null : r.overall === "green" ? "fresh" : r.overall === "yellow" ? "ok" : r.overall === "red" ? "tired" : null;
  const strain = recentStrain(
    (worked ?? []).map((w) => ({
      strain: normalizeStrain(w.custom ?? w.auto),
      at: (w.activities as unknown as { start_time: string }).start_time,
    })),
  );
  return { mood, strain, note: fresh ? r.note : null, date: fresh ? r.date : null };
}

export const RUN_PR_KEYS = RUN_DISTANCES.map((d) => BEST_KEY[d.key]);
export type { AvatarState };
