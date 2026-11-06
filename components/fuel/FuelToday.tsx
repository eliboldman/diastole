import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { LEVEL_STYLE } from "@/components/fuel/levels";
import { getFuelDays, getFuelMode } from "@/lib/fuel/data";
import { dayReason, FUEL_DAYS } from "@/lib/fuel/plan";

/** One line on Today: today's fuel level, linking to Fuel. Hidden in workout-only mode. */
export default async function FuelToday({ athleteId, today }: { athleteId: string; today: string }) {
  const [mode, [day]] = await Promise.all([getFuelMode(athleteId), getFuelDays(athleteId, today, 1)]);
  if (mode === "workout") return null;
  return (
    <Link href="/fuel" className="lift row-in mt-6 flex min-h-14 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${LEVEL_STYLE[day.level].dot}`} aria-hidden />
      <span className="min-w-0 flex-1 text-sm">
        <span className="font-medium">{FUEL_DAYS[day.level].label}</span>
        <span className="text-white/55"> · {dayReason(day.workouts.map((w) => w.session), day.race)}</span>
      </span>
      <ChevronRight size={16} className="shrink-0 text-white/40" aria-hidden />
    </Link>
  );
}
