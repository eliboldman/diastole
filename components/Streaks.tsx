import { createClient } from "@/lib/supabase/server";
import { checkinStreak, planStreak, weekStreak } from "@/lib/streaks";

/** Streaks on Today. Only ones that are going (2+) show; with none going, the card stays out of the way. */
export default async function Streaks({ athleteId, timeZone, today }: { athleteId: string; timeZone: string; today: string }) {
  const supabase = await createClient();
  // Counted back from today (the page passes the athlete's local date).
  const since = (days: number) => new Date(Date.parse(`${today}T12:00:00Z`) - days * 86_400_000).toISOString();
  const [{ data: acts }, { data: plans }, { data: checks }] = await Promise.all([
    supabase.from("activities").select("id, start_time, sport, duration_s, planned_workout_id").eq("athlete_id", athleteId).gte("start_time", since(730)).order("start_time", { ascending: false }).limit(3000),
    supabase.from("planned_workouts").select("id, scheduled_date, sport").eq("athlete_id", athleteId).is("deleted_at", null).neq("status", "draft").gte("scheduled_date", since(180).slice(0, 10)).lte("scheduled_date", today),
    supabase.from("workout_checkins").select("activity_id").eq("athlete_id", athleteId).gte("created_at", since(180)),
  ]);
  const list = acts ?? [];
  const weeks = weekStreak(list.map((a) => a.start_time), timeZone);
  const planned = planStreak((plans ?? []).map((p) => ({ id: p.id, date: p.scheduled_date, sport: p.sport })), list, timeZone, today);
  const checkins = checkinStreak(list, new Set((checks ?? []).map((c) => c.activity_id)));

  const items = [
    weeks >= 2 && { emoji: "🔥", n: weeks, label: "weeks in a row with 3+ workouts" },
    planned >= 2 && { emoji: "✅", n: planned, label: "planned workouts done in a row" },
    checkins >= 2 && { emoji: "📝", n: checkins, label: "check-ins in a row" },
  ].filter(Boolean) as { emoji: string; n: number; label: string }[];
  if (!items.length) return null;

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
    </section>
  );
}
