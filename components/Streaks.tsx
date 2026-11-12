import { createClient } from "@/lib/supabase/server";
import ShieldPrompt from "@/components/grit/ShieldPrompt";
import { checkinStreak, planStreakDetail, weekStreak } from "@/lib/streaks";

/** Streaks on Today. Only ones that are going (2+) show; with none going, the card stays out of the way. */
export default async function Streaks({ athleteId, timeZone, today }: { athleteId: string; timeZone: string; today: string }) {
  const supabase = await createClient();
  // Counted back from today (the page passes the athlete's local date).
  const since = (days: number) => new Date(Date.parse(`${today}T12:00:00Z`) - days * 86_400_000).toISOString();
  const [{ data: acts }, { data: plans }, { data: checks }, { data: shields }, { data: prof }, { data: shieldItem }] = await Promise.all([
    supabase.from("activities").select("id, start_time, sport, duration_s, planned_workout_id").eq("athlete_id", athleteId).gte("start_time", since(730)).order("start_time", { ascending: false }).limit(3000),
    supabase.from("planned_workouts").select("id, scheduled_date, sport, status").eq("athlete_id", athleteId).is("deleted_at", null).neq("status", "draft").gte("scheduled_date", since(180).slice(0, 10)).lte("scheduled_date", today),
    supabase.from("workout_checkins").select("activity_id").eq("athlete_id", athleteId).gte("created_at", since(180)),
    supabase.from("grit_shields").select("date").eq("athlete_id", athleteId),
    supabase.from("profiles").select("health_pause").eq("id", athleteId).maybeSingle(),
    supabase.from("grit_items").select("qty").eq("athlete_id", athleteId).eq("item_id", "ability:shield").maybeSingle(),
  ]);
  const list = acts ?? [];
  const weeks = weekStreak(list.map((a) => a.start_time), timeZone);
  // Days that never break the plan streak: a streak shield, sick/injured mode, a "Life happened" skip.
  const pausedSince = (prof?.health_pause as { since?: string } | null)?.since ?? null;
  const allPlans = plans ?? [];
  const excused = new Set<string>([
    ...(shields ?? []).map((x) => x.date as string),
    ...allPlans.filter((p) => p.status === "skipped" || (pausedSince && p.scheduled_date >= pausedSince)).map((p) => p.scheduled_date as string),
  ]);
  const forStreak = allPlans.filter((p) => p.status !== "skipped").map((p) => ({ id: p.id, date: p.scheduled_date, sport: p.sport }));
  const { n: planned, brokeOn } = planStreakDetail(forStreak, list, timeZone, today, excused);
  // A shield could save it: the miss is recent and covering it gives a streak worth keeping.
  const saved = brokeOn && (shieldItem?.qty ?? 0) > 0 && Date.parse(`${today}T12:00:00Z`) - Date.parse(`${brokeOn}T12:00:00Z`) <= 14 * 86_400_000 ? planStreakDetail(forStreak, list, timeZone, today, new Set([...excused, brokeOn])).n : 0;
  const checkins = checkinStreak(list, new Set((checks ?? []).map((c) => c.activity_id)));

  const items = [
    weeks >= 2 && { emoji: "🔥", n: weeks, label: "weeks in a row with 3+ workouts" },
    planned >= 2 && { emoji: "✅", n: planned, label: "planned workouts done in a row" },
    checkins >= 2 && { emoji: "📝", n: checkins, label: "check-ins in a row" },
  ].filter(Boolean) as { emoji: string; n: number; label: string }[];
  const offer = saved >= 2 && saved > planned ? { date: brokeOn!, streak: saved, shields: shieldItem?.qty ?? 0 } : null;
  if (!items.length && !offer) return null;

  return (
    <section className="row-in mt-6 rounded-[28px] border border-amber-200/15 bg-gradient-to-br from-amber-200/[0.06] to-white/[0.03] p-5" aria-label="Streaks">
      <ul className="grid gap-3 sm:grid-cols-3">
        {items.map((i) => (
          <li key={i.label} className="flex items-center gap-3">
            <span className="text-2xl leading-none" aria-hidden>
              {i.emoji}
            </span>
            <span className="min-w-0">
              <span className="block text-xl font-semibold tabular-nums leading-tight">{i.n}</span>
              <span className="block text-xs text-white/60">{i.label}</span>
            </span>
          </li>
        ))}
      </ul>
      {offer && <ShieldPrompt {...offer} />}
    </section>
  );
}
