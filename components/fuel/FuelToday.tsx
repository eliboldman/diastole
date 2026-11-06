import { Camera, ChevronRight } from "lucide-react";
import Link from "next/link";

import MacroRings from "@/components/fuel/MacroRings";
import { LEVEL_STYLE } from "@/components/fuel/levels";
import { getFuelDays, getFuelMode, getMealDay } from "@/lib/fuel/data";
import { dayReason, FUEL_DAYS } from "@/lib/fuel/plan";

/** On Today: the fuel level, small macro rings and a one-tap "Log a meal". Hidden in workout-only mode. */
export default async function FuelToday({ athleteId, today, timeZone }: { athleteId: string; today: string; timeZone: string }) {
  const [mode, [day]] = await Promise.all([getFuelMode(athleteId), getFuelDays(athleteId, today, 1)]);
  if (mode === "workout") return null;
  const meals = await getMealDay(athleteId, today, timeZone, day.level);
  return (
    <section className="row-in mt-6 rounded-[28px] border border-white/10 bg-white/[0.05] p-4 backdrop-blur-xl">
      <Link href="/fuel" className="flex min-h-11 items-center gap-3">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${LEVEL_STYLE[meals.level].dot}`} aria-hidden />
        <span className="min-w-0 flex-1 text-sm">
          <span className="font-medium">{FUEL_DAYS[meals.level].label}</span>
          <span className="text-white/55"> · {dayReason(day.workouts.map((w) => w.session), day.race)}</span>
        </span>
        <ChevronRight size={16} className="shrink-0 text-white/40" aria-hidden />
      </Link>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <MacroRings eaten={meals.eaten} targets={meals.targets} numbers={mode === "full"} size="sm" weightHref="/fuel#weight" />
        <Link href="/fuel?log=1" className="flex min-h-11 items-center gap-2 rounded-2xl bg-emerald-300 px-4 text-sm font-medium text-emerald-950 transition active:scale-[0.97]">
          <Camera size={16} aria-hidden /> Log a meal
        </Link>
      </div>
    </section>
  );
}
