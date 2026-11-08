import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { monthName, periodRange, prevMonth } from "@/lib/story";
import { loadStory } from "@/lib/story-data";

/**
 * On the 1st (each person's own time zone): every athlete who trained gets their last month's
 * recap, and each coach gets one line for the team. Sent through server_notify, so dedupe keys
 * make reruns safe and test athletes and notification settings are respected.
 */
export async function runMonthlyRecaps(admin: SupabaseClient) {
  const { data: people } = await admin.from("profiles").select("id, full_name, role, coach_id, timezone").eq("is_test", false);
  const hours = new Map<string, { name: string; hours: number; workouts: number }>();
  let athletes = 0;
  let coaches = 0;

  for (const p of people ?? []) {
    const tz = p.timezone || "America/Chicago";
    const today = new Date().toLocaleDateString("en-CA", { timeZone: tz });
    if (!today.endsWith("-01")) continue;
    const month = prevMonth(today.slice(0, 7));
    const r = periodRange(month, today);
    const s = await loadStory(admin, p.id, r.from, r.to, tz);
    hours.set(p.id, { name: (p.full_name ?? "").trim().split(/\s+/)[0] || "Someone", hours: s.hours, workouts: s.workouts });
    if (!s.workouts) continue;
    const extras = [s.prs ? `${s.prs} new ${s.prs === 1 ? "PR" : "PRs"}` : null, s.bestStreakWeeks >= 3 ? `${s.bestStreakWeeks}-week streak` : null].filter(Boolean);
    await admin.rpc("server_notify", {
      p_user: p.id,
      p_kind: "workout_recap",
      p_title: `Your ${monthName(month)} recap 📊`,
      p_body: `${s.hours} h over ${s.workouts} ${s.workouts === 1 ? "workout" : "workouts"}${extras.length ? `, ${extras.join(", ")}` : ""}. Tap to see it and share it.`,
      p_href: `/me/story?period=${month}`,
      p_key: `recap:${month}`,
    });
    athletes++;
  }

  // Coaches: the team's month in one line (only athletes whose 1st it is today, so the month matches).
  for (const c of (people ?? []).filter((x) => x.role === "coach")) {
    const tz = c.timezone || "America/Chicago";
    const today = new Date().toLocaleDateString("en-CA", { timeZone: tz });
    if (!today.endsWith("-01")) continue;
    const month = prevMonth(today.slice(0, 7));
    const team = (people ?? []).filter((a) => a.coach_id === c.id && a.id !== c.id).map((a) => hours.get(a.id)).filter((x): x is NonNullable<typeof x> => !!x);
    const total = Math.round(team.reduce((t, a) => t + a.hours, 0) * 10) / 10;
    const sessions = team.reduce((t, a) => t + a.workouts, 0);
    if (!sessions) continue;
    const top = [...team].sort((a, b) => b.hours - a.hours)[0];
    await admin.rpc("server_notify", {
      p_user: c.id,
      p_kind: "monthly_digest",
      p_title: `${monthName(month)} across your team`,
      p_body: `${team.length} ${team.length === 1 ? "athlete" : "athletes"} logged ${total} h over ${sessions} workouts. Most hours: ${top.name} (${top.hours} h).`,
      p_href: "/",
      p_key: `team_recap:${month}`,
    });
    coaches++;
  }
  return { athletes, coaches };
}
