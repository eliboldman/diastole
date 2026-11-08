import Celebrate, { type Moment } from "@/components/Celebrate";
import { PR_LABEL } from "@/lib/avatar/pr-labels";
import { clock } from "@/lib/activity/format";
import { createClient } from "@/lib/supabase/server";

// Time math outside render.
const DAY = 86_400_000;
function weekStart(timeZone: string, now = Date.now()) {
  const local = new Date(new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(now)) + "T00:00:00Z");
  local.setUTCDate(local.getUTCDate() - ((local.getUTCDay() + 6) % 7));
  return local; // Monday 00:00 (as a UTC date of the local day; close enough for a weekly ring)
}
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

/**
 * This week at a glance: a ring that starts filled with what's already done, against the coach's
 * plan for the week (or the athlete's usual week when nothing is planned). Plus any new milestones.
 */
export default async function WeeklyProgress({ athleteId, timeZone }: { athleteId: string; timeZone: string }) {
  const supabase = await createClient();
  const monday = weekStart(timeZone);
  const mondayIso = monday.toISOString();
  const sunday = new Date(monday.getTime() + 6 * DAY).toISOString().slice(0, 10);
  const fourWeeksAgo = new Date(monday.getTime() - 28 * DAY).toISOString();
  const [{ data: acts }, { data: planned }, { data: recentWins }, { count: recovery }] = await Promise.all([
    supabase.from("activities").select("start_time, duration_s, planned_workout_id").eq("athlete_id", athleteId).gte("start_time", fourWeeksAgo),
    supabase
      .from("planned_workouts")
      .select("id")
      .eq("athlete_id", athleteId)
      .gte("scheduled_date", mondayIso.slice(0, 10))
      .lte("scheduled_date", sunday)
      .not("status", "in", "(draft,skipped)")
      .is("deleted_at", null),
    supabase.from("achievements").select("id, key, value, achieved_at, activity_id").eq("athlete_id", athleteId).gte("achieved_at", ago(7 * DAY)),
    // Finished recovery routines count toward the week too.
    supabase.from("recovery_sessions").select("id", { count: "exact", head: true }).eq("athlete_id", athleteId).gte("completed_at", mondayIso),
  ]);
  const real = (acts ?? []).filter((a) => (a.duration_s ?? 0) >= 300);
  const thisWeek = real.filter((a) => a.start_time >= mondayIso);
  const before = real.filter((a) => a.start_time < mondayIso);
  const hours = thisWeek.reduce((t, a) => t + (a.duration_s ?? 0), 0) / 3600;
  // With a plan: planned sessions done out of planned (anything else is "extra").
  // Without one: all workouts against the athlete's usual week.
  const plannedIds = new Set((planned ?? []).map((p) => p.id));
  const hasPlan = plannedIds.size > 0;
  const plannedDone = new Set(thisWeek.map((a) => a.planned_workout_id).filter((id): id is string => !!id && plannedIds.has(id))).size;
  const done = hasPlan ? plannedDone : thisWeek.length;
  const extra = hasPlan ? thisWeek.filter((a) => !a.planned_workout_id || !plannedIds.has(a.planned_workout_id)).length : 0;
  const target = hasPlan ? plannedIds.size : Math.max(1, Math.round(before.length / 4) || 3);
  const pct = Math.min(1, done / target);

  // Celebrate real improvements only (a first-ever value is a baseline, not a milestone).
  const { data: firsts } = recentWins?.length
    ? await supabase.from("achievements").select("key, achieved_at").eq("athlete_id", athleteId).in("key", [...new Set(recentWins.map((w) => w.key))]).order("achieved_at")
    : { data: [] };
  const firstAt = new Map<string, string>();
  for (const f of firsts ?? []) if (!firstAt.has(f.key)) firstAt.set(f.key, f.achieved_at);
  const moments: Moment[] = (recentWins ?? [])
    .filter((w) => (w.key.startsWith("pr_") || w.key.startsWith("consistency_") || w.key.endsWith("_up")) && firstAt.get(w.key) !== w.achieved_at)
    .map((w) => ({
      id: `${w.key}|${w.achieved_at}`,
      emoji: w.key.startsWith("pr_") ? "🏆" : w.key.startsWith("consistency_") ? "🔥" : "⚡",
      title: w.key.startsWith("pr_") ? `New ${(PR_LABEL[w.key] ?? "PR").replace(/^Fastest |^Best /, "")} PR` : (PR_LABEL[w.key] ?? "Milestone"),
      detail: w.key.startsWith("pr_") && w.value !== null ? (w.key === "pr_power_20m" ? `${Math.round(Number(w.value))} W` : clock(Number(w.value))) : null,
      href: w.activity_id ? `/activity/${w.activity_id}` : null,
    }));

  const R = 34;
  const C = 2 * Math.PI * R;
  return (
    <>
      <Celebrate moments={moments} />
      <section className="row-in mt-6 flex items-center gap-5 rounded-[28px] border border-white/10 bg-white/[0.05] p-5 backdrop-blur-xl">
        <svg viewBox="0 0 80 80" className="h-20 w-20 shrink-0 -rotate-90" role="img" aria-label={hasPlan ? `${done} of ${target} planned workouts done this week` : `${done} workouts this week, usual week about ${target}`}>
          <circle cx="40" cy="40" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
          <circle
            cx="40"
            cy="40"
            r={R}
            fill="none"
            stroke={pct >= 1 ? "#fbbf24" : "var(--color-emerald-300)"}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={C}
            className="ring-fill"
            style={{ ["--ring-from" as string]: C, ["--ring-to" as string]: C * (1 - Math.max(pct, 0.02)) }}
          />
        </svg>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.15em] text-white/50">This week</p>
          <p className="mt-0.5 text-2xl font-semibold tabular-nums">{hasPlan ? `${done} of ${target} planned` : `${done} workout${done === 1 ? "" : "s"}`}</p>
          <p className="text-sm text-white/55">
            {[
              hasPlan ? (pct >= 1 ? "Plan done" : null) : `usual week is about ${target}`,
              extra ? `+ ${extra} other activit${extra === 1 ? "y" : "ies"}` : null,
              `${hours.toFixed(1)} h${pct >= 1 || !hasPlan ? "" : " so far"}`,
              recovery ? `${recovery} recovery` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </section>
    </>
  );
}
