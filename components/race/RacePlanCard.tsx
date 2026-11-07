import { clock } from "@/lib/activity/format";
import type { RacePlan } from "@/lib/fuel/race";

const card = "rounded-[28px] border border-white/10 bg-white/[0.055] p-6";

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-white/45">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-white/50">{sub}</p>}
    </div>
  );
}

/** The race-day fueling plan: per-hour targets, the days before, and a feed timeline. */
export default function RacePlanCard({ plan, units = "km" }: { plan: RacePlan; units?: "mi" | "km" }) {
  const oz = (ml: number) => (units === "mi" ? ` (${Math.round(ml / 29.5735)} oz)` : "");
  return (
    <section className={card}>
      <h2 className="text-lg font-medium">Race fueling plan</h2>
      <p className="mt-1 text-sm text-white/55">For about {clock(plan.minutes * 60)} of racing.</p>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Carbs" value={plan.carbsPerHour ? `${plan.carbsPerHour} g/h` : "None needed"} sub={plan.carbsPerHour ? "from the first feed" : "under an hour"} />
        <Stat label="Fluid" value={plan.fluidMlPerHour ? `${plan.fluidMlPerHour} ml/h` : "To thirst"} sub={plan.fluidMlPerHour && units === "mi" ? `about ${Math.round(plan.fluidMlPerHour / 29.5735)} fl oz an hour` : undefined} />
        {plan.sodiumMgPerHour && <Stat label="Sodium" value={`${plan.sodiumMgPerHour} mg/h`} />}
      </div>

      <h3 className="mt-6 text-sm font-medium text-white/80">Before the race</h3>
      <ul className="mt-2 space-y-2 text-sm text-white/70">
        {plan.carbLoad && (
          <li>
            <span className="text-white">Carb load</span> the {plan.carbLoad.days === 2 ? "two days" : "day"} before:{" "}
            {plan.carbLoad.grams ? `${plan.carbLoad.grams[0]}–${plan.carbLoad.grams[1]} g carbs a day` : `${plan.carbLoad.gPerKg[0]}–${plan.carbLoad.gPerKg[1]} g per kg of body weight a day`}. Rice, pasta, bread, potatoes, juice; easy on fiber and fat.
          </li>
        )}
        <li>
          <span className="text-white">Breakfast</span> about {plan.breakfast.hoursBefore} hours before:{" "}
          {plan.breakfast.grams ? `${plan.breakfast.grams[0]}–${plan.breakfast.grams[1]} g carbs` : "carb-rich and familiar"}, something you&apos;ve eaten before a hard session.
        </li>
      </ul>

      {plan.feeds.length > 0 && (
        <>
          <h3 className="mt-6 text-sm font-medium text-white/80">During</h3>
          <ol className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            {plan.feeds.map((f) => (
              <li key={f.minute} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                <span className="block text-xs text-white/45">{clock(f.minute * 60)}</span>
                <span className="tabular-nums">{f.carbs} g carbs</span>
                {f.fluid ? <span className="block text-xs text-white/55">{f.fluid} ml fluid{oz(f.fluid)}</span> : null}
              </li>
            ))}
          </ol>
        </>
      )}

      {plan.notes.length > 0 && (
        <ul className="mt-5 space-y-1 text-sm text-amber-100/80">
          {plan.notes.map((n) => (
            <li key={n}>• {n}</li>
          ))}
        </ul>
      )}
      <p className="mt-5 text-xs text-white/40">General sports-nutrition guidance for training and racing, not medical or dietetic advice. Practice it in training first.</p>
    </section>
  );
}
