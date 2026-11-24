import { ChevronRight, Wind } from "lucide-react";
import Link from "next/link";

import WorkoutPeek from "@/components/calendar/WorkoutPeek";
import { FlagBadge } from "@/components/coach/Flags";
import MacroRings from "@/components/fuel/MacroRings";
import { LEVEL_STYLE } from "@/components/fuel/levels";
import { breathData } from "@/lib/breath/data";
import { SESSIONS, suggest } from "@/lib/breath/plan";
import { getFuelDays, getFuelMode, getMealDay } from "@/lib/fuel/data";
import { FUEL_DAYS } from "@/lib/fuel/plan";
import type { Flag } from "@/lib/readiness/engine";
import { createClient } from "@/lib/supabase/server";
import { PEEK_COLUMNS, toPeek, type PeekRow } from "@/lib/workouts/peek";

/**
 * On the coach's Today: the coach's own day, for coaches who train too (on their own roster, or with
 * anything planned in the last or next two weeks). Readiness, today's sessions, fuel, a breathing
 * session. Everything links to the full page; My day has the rest.
 */
export default async function YouToday({ coachId, coachOfSelf, today, timeZone, units }: { coachId: string; coachOfSelf: boolean; today: string; timeZone: string; units: "km" | "mi" }) {
  const supabase = await createClient();
  const shift = (days: number) => new Date(Date.parse(`${today}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  const [{ data: readiness }, { data: workouts }, { count: nearby }] = await Promise.all([
    supabase.from("readiness_scores").select("overall, note").eq("athlete_id", coachId).order("date", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("planned_workouts").select(PEEK_COLUMNS).eq("athlete_id", coachId).eq("scheduled_date", today).is("deleted_at", null).in("status", ["approved", "sent", "completed"]).order("start_time"),
    supabase.from("planned_workouts").select("id", { count: "exact", head: true }).eq("athlete_id", coachId).is("deleted_at", null).gte("scheduled_date", shift(-14)).lte("scheduled_date", shift(14)),
  ]);
  if (!coachOfSelf && !nearby) return null;

  const todays = ((workouts ?? []) as unknown as PeekRow[]).map((w) => toPeek(w, { coach: false, done: w.status === "completed", units }));
  const [fuel, breath] = await Promise.all([
    (async () => {
      const [mode, [day]] = await Promise.all([getFuelMode(coachId), getFuelDays(coachId, today, 1)]);
      if (mode === "workout") return null;
      return { mode, meals: await getMealDay(coachId, today, timeZone, day.level) };
    })().catch(() => null),
    breathData(supabase, coachId, today, timeZone)
      .then((d) => suggest(d.context))
      .catch(() => null),
  ]);

  return (
    <section aria-labelledby="you-today" className="row-in mt-6 rounded-[28px] border border-sky-300/15 bg-sky-300/[0.04] p-5 backdrop-blur-xl sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 id="you-today" className="text-lg font-semibold">You today</h2>
        <Link href="/me" className="flex min-h-11 items-center gap-0.5 text-sm text-emerald-200 hover:text-emerald-100">
          My day <ChevronRight size={15} aria-hidden />
        </Link>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <FlagBadge flag={(readiness?.overall as Flag) ?? "unknown"} />
        {readiness?.note && <p className="min-w-0 flex-1 text-sm text-white/65">{readiness.note}</p>}
      </div>

      <ul className="mt-4 grid gap-2">
        {todays.length ? (
          todays.map((w) => <WorkoutPeek key={w.id} w={w} />)
        ) : (
          <li className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/60">Nothing planned for you today.</li>
        )}
      </ul>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {fuel && (
          <Link href="/fuel" className="flex min-h-14 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2 transition hover:bg-white/[0.06]">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${LEVEL_STYLE[fuel.meals.level].dot}`} aria-hidden />
            <span className="min-w-0 flex-1 text-sm font-medium">{FUEL_DAYS[fuel.meals.level].label}</span>
            <MacroRings eaten={fuel.meals.eaten} targets={fuel.meals.targets} numbers={false} size="sm" />
          </Link>
        )}
        {breath && (
          <Link href={`/recovery/breathe/${breath.kind}`} className="flex min-h-14 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2 transition hover:bg-white/[0.06]">
            <Wind size={17} className="shrink-0 text-sky-200" aria-hidden />
            <span className="min-w-0 flex-1 text-sm">
              <span className="font-medium">{SESSIONS[breath.kind].title}</span>
              <span className="text-white/55"> · {breath.minutes} min</span>
            </span>
            <ChevronRight size={15} className="shrink-0 text-white/40" aria-hidden />
          </Link>
        )}
      </div>
    </section>
  );
}
