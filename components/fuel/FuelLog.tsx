import MacroRings from "@/components/fuel/MacroRings";
import MealList from "@/components/fuel/MealList";
import MealLogger from "@/components/fuel/MealLogger";
import WeightForm from "@/components/fuel/WeightForm";
import { LEVEL_STYLE } from "@/components/fuel/levels";
import type { MealDay } from "@/lib/fuel/data";
import { FUEL_DAYS, type FuelMode } from "@/lib/fuel/plan";

/**
 * Today's eating against today's targets. The athlete logs and edits; their coach sees the same
 * card read-only (`viewer="coach"`). Hidden entirely in workout-only mode.
 */
export default function FuelLog({
  day,
  mode,
  timeZone,
  units,
  viewer = "athlete",
  autoOpen = false,
  start,
  firstName,
}: {
  day: MealDay;
  mode: FuelMode;
  timeZone: string;
  units: "mi" | "km";
  viewer?: "athlete" | "coach";
  autoOpen?: boolean;
  start?: "photo" | "scan" | "describe";
  firstName?: string;
}) {
  if (mode === "workout") return null;
  const numbers = mode === "full" || viewer === "coach";
  const athlete = viewer === "athlete";
  return (
    <section id="log" className="row-in mt-6 scroll-mt-6 rounded-[28px] border border-white/10 bg-white/[0.06] p-6 backdrop-blur-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">{athlete ? "Today's fuel" : `${firstName ?? "Their"}'s fuel today`}</h2>
          <p className="mt-0.5 flex items-center gap-2 text-sm text-white/55">
            <span className={`h-2 w-2 rounded-full ${LEVEL_STYLE[day.level].dot}`} aria-hidden />
            {`Targets for a ${FUEL_DAYS[day.level].label.toLowerCase()}`}
          </p>
        </div>
        {athlete && <MealLogger numbers={numbers} autoOpen={autoOpen} start={start} />}
      </div>

      <div className="mt-5">
        <MacroRings eaten={day.eaten} targets={day.targets} numbers={numbers} weightHref={athlete ? "#weight" : undefined} />
      </div>
      {!athlete && !day.targets && <p className="mt-3 text-xs text-white/45">No body weight entered yet, so no targets. The athlete adds it on their Fuel page.</p>}

      <div className="mt-6">
        {day.meals.length === 0 && <p className="mb-4 text-sm text-white/50">{athlete ? "Nothing logged yet today. Snap your next meal." : "Nothing logged today."}</p>}
        <MealList meals={day.meals} usual={day.usual} recent={day.recent} timeZone={timeZone} numbers={numbers} editable={athlete} />
      </div>

      {athlete && (
        <div id="weight" className="mt-6 scroll-mt-6 border-t border-white/[0.08] pt-5">
          <WeightForm weightKg={day.weightKg} unit={units === "km" ? "kg" : "lb"} />
        </div>
      )}
    </section>
  );
}
