import { Backpack, CloudSun, Flag } from "lucide-react";
import Link from "next/link";

import RaceChecklist from "@/components/race/RaceChecklist";
import { daysUntil, RACE_WEEK_DAYS, raceWeekChecklist } from "@/lib/fuel/race";
import { getRaces, getRaceTools, planFor } from "@/lib/fuel/race-data";
import { getPackView } from "@/lib/pack/data";
import { createClient } from "@/lib/supabase/server";
import { weatherLine } from "@/lib/weather";
import { athleteWeather } from "@/lib/weather-data";

/** Race-day mode on Today: shows up 10 days before the next A or B race. */
export default async function RaceWeek({ athleteId, today, units = "mi" }: { athleteId: string; today: string; units?: "mi" | "km" }) {
  const races = (await getRaces(athleteId, { from: today, limit: 5 })).filter((r) => r.priority !== "C" && daysUntil(r.race_date, today) <= RACE_WEEK_DAYS);
  const race = races[0];
  if (!race) return null;
  const days = daysUntil(race.race_date, today);
  const plan = planFor(race, await getRaceTools(athleteId));
  const phase = raceWeekChecklist(days, plan);
  const supabase = await createClient();
  const weather = await athleteWeather(supabase, athleteId, race.race_date);
  const pack = await getPackView(supabase, race, units);
  const packed = pack.items.filter((i) => pack.checked[i.key]).length;
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
      {weather.day && weather.place && (
        <p className="mt-4 flex items-start gap-2 text-sm text-white/75">
          <CloudSun size={16} className="mt-0.5 shrink-0 text-emerald-200" aria-hidden />
          <span>
            <span className="text-white/90">{days === 0 ? "Today" : "Race day"} in {weather.place.name.split(",")[0]}:</span> {weatherLine(weather.day, units)}
          </span>
        </p>
      )}
      <Link href={`/races/${race.id}#packing`} className="mt-4 flex min-h-12 items-center gap-2 rounded-2xl border border-white/10 bg-black/10 px-4 text-sm">
        <Backpack size={16} className="text-emerald-200" aria-hidden />
        <span className="font-medium">Packing list</span>
        <span className="ml-auto text-xs text-white/55">
          {packed} of {pack.items.length} packed
        </span>
      </Link>
      <Link href={`/races/${race.id}`} className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-emerald-200 hover:underline">
        Race plan and fueling →
      </Link>
    </section>
  );
}
