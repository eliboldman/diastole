import { Flag } from "lucide-react";
import Link from "next/link";

import RaceChecklist from "@/components/race/RaceChecklist";
import { daysUntil, RACE_WEEK_DAYS, raceWeekChecklist } from "@/lib/fuel/race";
import { getRaces, getRaceTools, planFor } from "@/lib/fuel/race-data";

/** Race-day mode on Today: shows up 10 days before the next A or B race. */
export default async function RaceWeek({ athleteId, today }: { athleteId: string; today: string }) {
  const races = (await getRaces(athleteId, { from: today, limit: 5 })).filter((r) => r.priority !== "C" && daysUntil(r.race_date, today) <= RACE_WEEK_DAYS);
  const race = races[0];
  if (!race) return null;
  const days = daysUntil(race.race_date, today);
  const plan = planFor(race, await getRaceTools(athleteId));
  const phase = raceWeekChecklist(days, plan);
  return (
    <section className="row-in mt-6 rounded-[28px] border border-emerald-300/25 bg-gradient-to-br from-emerald-300/[0.12] to-white/[0.03] p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.3em] text-emerald-200/70">{days === 0 ? "Race day" : "Race week"}</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">{days === 0 ? race.name : days === 1 ? `${race.name} is tomorrow` : `${days} days to ${race.name}`}</h2>
        </div>
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-300/20 text-emerald-100">
          {days === 0 ? <Flag size={22} aria-hidden /> : <span className="text-xl font-semibold tabular-nums">{days}</span>}
        </span>
      </div>
      <p className="mt-4 text-sm font-medium text-white/80">{phase.title}</p>
      <div className="mt-2">
        <RaceChecklist raceId={race.id} items={phase.items} done={race.checklist ?? {}} />
      </div>
      <Link href={`/races/${race.id}`} className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-emerald-200 hover:underline">
        Race plan and fueling →
      </Link>
    </section>
  );
}
