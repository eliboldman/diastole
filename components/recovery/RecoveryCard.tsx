import Link from "next/link";
import { Leaf } from "lucide-react";

import { minutesLabel, routineSeconds, suggestRoutine, type RoutineItem } from "@/lib/recovery/catalog";
import { createClient } from "@/lib/supabase/server";

/**
 * Recovery on Today, only when there's a reason: a routine the coach assigned (today or overdue
 * this week), else a suggestion from recent sore spots or a low readiness day. Hidden otherwise.
 */
export default async function RecoveryCard({ athleteId, today }: { athleteId: string; today: string }) {
  const supabase = await createClient();
  const day = (n: number) => new Date(Date.parse(`${today}T12:00:00Z`) + n * 86_400_000).toISOString();
  const [{ data: assigned }, { data: checks }, { data: ready }, { data: doneToday }] = await Promise.all([
    supabase.from("recovery_assignments").select("id, title, items, scheduled_date").eq("athlete_id", athleteId).is("completed_at", null).lte("scheduled_date", today).gte("scheduled_date", day(-6).slice(0, 10)).order("scheduled_date", { ascending: false }).limit(1),
    supabase.from("workout_checkins").select("pain").eq("athlete_id", athleteId).gte("created_at", day(-3)),
    supabase.from("readiness_scores").select("overall").eq("athlete_id", athleteId).eq("date", today).maybeSingle(),
    supabase.from("recovery_sessions").select("id").eq("athlete_id", athleteId).gte("completed_at", day(-1)).limit(1),
  ]);

  const a = assigned?.[0];
  let item: { href: string; title: string; sub: string; label: string } | null = null;
  if (a) {
    item = { href: `/recovery/a-${a.id}?from=/me`, title: a.title, sub: `${minutesLabel(routineSeconds(a.items as RoutineItem[]))} · ${a.scheduled_date === today ? "for today" : "from earlier this week"}`, label: "From your coach" };
  } else if (!doneToday?.length) {
    const tip = suggestRoutine({ spots: (checks ?? []).flatMap((c) => Object.keys((c.pain ?? {}) as Record<string, number>)), readiness: (ready?.overall as string) ?? null });
    if (tip) item = { href: `/recovery/${tip.routine.id}?from=/me&s=suggested`, title: tip.routine.title, sub: `${tip.why} ${minutesLabel(routineSeconds(tip.routine.items))}.`, label: "Recovery idea" };
  }
  if (!item) return null;

  return (
    <section className="row-in mt-6 rounded-[28px] border border-emerald-300/15 bg-gradient-to-br from-emerald-300/[0.07] to-white/[0.02] p-5">
      <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.15em] text-emerald-200/70">
        <Leaf size={13} aria-hidden /> {item.label}
      </p>
      <p className="mt-2 text-lg font-medium">{item.title}</p>
      <p className="text-sm text-white/55">{item.sub}</p>
      <div className="mt-4 flex items-center gap-4">
        <Link href={item.href} className="flex min-h-11 items-center rounded-2xl bg-emerald-300 px-5 text-sm font-medium text-black active:scale-95">
          Start
        </Link>
        <Link href="/recovery" className="text-sm text-white/55 hover:text-white">
          All routines
        </Link>
      </div>
    </section>
  );
}
