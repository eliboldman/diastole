import { ChevronRight } from "lucide-react";
import Link from "next/link";

import type { WeightView } from "@/lib/fuel/weight-data";
import { DAY_LABEL, LB, type DayType } from "@/lib/fuel/weight-plan";

const TYPE_STYLE: Record<DayType, string> = {
  rest: "border-white/15 bg-white/[0.05] text-white/80",
  easy: "border-sky-300/25 bg-sky-300/10 text-sky-100",
  moderate: "border-amber-300/25 bg-amber-300/10 text-amber-50",
  key: "border-emerald-300/30 bg-emerald-300/15 text-emerald-50",
  carb_load: "border-emerald-300/30 bg-emerald-300/15 text-emerald-50",
  race: "border-emerald-300/30 bg-emerald-300/15 text-emerald-50",
};
const lb = (kg: number) => (kg / LB).toFixed(1);

/** Today's race-weight targets on the Fuel page: calories, macros, the training energy assumed, and why. */
export default function WeightGoalCard({ view }: { view: WeightView }) {
  const t = view.todayTarget;
  const p = view.projection;
  const maintenanceOnly = view.today > view.week.target_date;
  return (
    <section className="row-in mt-6 rounded-[28px] border border-white/10 bg-white/[0.06] p-6 backdrop-blur-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-medium">Race weight</h2>
          <span className={`rounded-full border px-3 py-0.5 text-xs font-medium ${TYPE_STYLE[t.type]}`}>{DAY_LABEL[t.type]} day</span>
        </div>
        <Link href="/fuel/weight" className="flex min-h-10 items-center gap-1 text-sm text-white/60 hover:text-white">
          Trend <ChevronRight size={15} aria-hidden />
        </Link>
      </div>
      <p className="mt-4 flex items-baseline gap-2">
        <span className="text-4xl font-semibold tabular-nums">{t.kcal.toLocaleString()}</span>
        <span className="text-sm text-white/55">kcal today</span>
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[
          ["Protein", t.protein, `${t.proteinPerMeal[0]}–${t.proteinPerMeal[1]} g × 4 meals`],
          ["Carbs", t.carbs, t.fuelCarbs ? `incl. ${t.fuelCarbs} g around training` : "to appetite around meals"],
          ["Fat", t.fat, "the rest"],
        ].map(([label, g, sub]) => (
          <div key={label as string} className="rounded-2xl border border-white/10 bg-white/[0.04] px-2 py-3">
            <p className="text-xs uppercase tracking-[0.15em] text-white/45">{label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{g} g</p>
            <p className="mt-0.5 text-[11px] leading-tight text-white/45">{sub}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-sm text-white/80">{t.reason}</p>
      <p className="mt-1 text-xs text-white/45">
        Baseline {t.baseline.toLocaleString()} ({view.week.baseline_source === "measured" ? "measured from your trend" : "estimated"}) + training {t.training.toLocaleString()} (
        {t.trainingSource === "done" ? "completed" : t.trainingSource === "mixed" ? "completed + planned" : t.trainingSource === "planned" ? "planned" : "none"}) − deficit {t.deficit}
      </p>
      <p className="mt-3 text-sm text-white/60">
        {maintenanceOnly
          ? "Maintenance block: holding weight to race day."
          : view.avg === null
            ? "Weigh in most mornings; the trend starts after 3 weigh-ins."
            : p.onTrack
              ? `7-day average ${lb(view.avg)} lb · on track for ${Math.round(view.goal.target_kg / LB)} lb by ${fmt(view.week.target_date)}.`
              : `7-day average ${lb(view.avg)} lb · ${p.behindLb !== null ? `${p.behindLb.toFixed(1)} lb behind the line` : "behind"}${p.date ? `, projected ${fmt(p.date)}` : ""}.`}
      </p>
      {!view.checkedIn && !maintenanceOnly && (
        <Link href="/fuel/weight#checkin" className="mt-3 inline-flex min-h-10 items-center rounded-2xl border border-white/10 px-4 text-sm text-white/75 hover:bg-white/[0.05]">
          Weekly energy check-in
        </Link>
      )}
    </section>
  );
}

export const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
