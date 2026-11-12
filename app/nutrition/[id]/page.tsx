import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import GoalsEditor from "@/components/nutrition/GoalsEditor";
import BackLink from "@/components/layout/BackLink";
import DashboardShell from "@/components/layout/DashboardShell";
import { getFuelMode, getNutritionGoals, getNutritionReview, getRefuel, type ReviewDay } from "@/lib/fuel/data";
import type { RefuelRow, RefuelStatus } from "@/lib/fuel/refuel";
import { PER_KG, type LoggedItem, type Macro, type Range } from "@/lib/fuel/meals";
import { FUEL_MODES, type FuelDay } from "@/lib/fuel/plan";
import { createClient, requireStaff } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Nutrition · Diastole" };

const LEVEL: Record<FuelDay, { label: string; tone: string }> = {
  high: { label: "High", tone: "text-amber-200 border-amber-300/30" },
  medium: { label: "Medium", tone: "text-sky-200 border-sky-300/30" },
  low: { label: "Low", tone: "text-emerald-200 border-emerald-300/30" },
};

const dayLabel = (iso: string, today: string) =>
  iso === today ? "Today" : new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

export default async function NutritionAthletePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ days?: string }> }) {
  const me = await requireStaff();
  const { id } = await params;
  const span = (await searchParams).days === "28" ? 28 : 14;
  const supabase = await createClient();
  const { data: athlete } = await supabase.from("profiles").select("id, full_name, email, timezone, role").eq("id", id).maybeSingle();
  if (!athlete || athlete.role === "dietitian") notFound();

  const tz = athlete.timezone || "America/Chicago";
  const today = new Date().toLocaleDateString("en-CA", { timeZone: tz });
  const goals = await getNutritionGoals(id);
  const fromDate = new Date(`${today}T12:00:00Z`);
  fromDate.setUTCDate(fromDate.getUTCDate() - (span - 1));
  const from = fromDate.toISOString().slice(0, 10);
  const [review, mode, { data: mealRows }, refuel] = await Promise.all([
    getNutritionReview(id, today, tz, span, goals.perKg),
    getFuelMode(id),
    supabase.from("meal_logs").select("id, local_date, eaten_at, label, items, carbs_g, protein_g, fat_g, kcal, note").eq("athlete_id", id).gte("local_date", from).order("eaten_at", { ascending: false }).limit(200),
    getRefuel(id, from, tz),
  ]);
  const s = review.summary;
  const w = review.weightKg;
  const perKg = (g: number) => (w ? (g / w).toFixed(1) : null);
  const mealsOn = (date: string) => (mealRows ?? []).filter((m) => m.local_date === date);
  const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
  const name = athlete.full_name || athlete.email || "Athlete";

  return (
    <DashboardShell role={me.role === "dietitian" ? "dietitian" : "coach"}>
      <BackLink href="/nutrition" label="Team fueling" />
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">{name}</h1>
          <p className="mt-2 text-sm text-white/55">
            {w ? `${w} kg (${Math.round(w * 2.2046)} lb)` : "No body weight entered"}
            {review.weightUpdated ? ` · updated ${new Date(review.weightUpdated).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
            {` · Fuel page shows: ${FUEL_MODES[mode].label.toLowerCase()}`}
          </p>
        </div>
        <Link href={`/athlete/${id}`} className="inline-flex min-h-11 items-center rounded-2xl border border-white/10 px-4 text-sm text-emerald-200/90 hover:bg-white/[0.05]">
          Full athlete view: training, readiness, activities →
        </Link>
      </div>

      {/* Summary */}
      <section className="mt-8 rounded-[28px] border border-white/10 bg-white/[0.055] p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-lg font-medium">Last {span - 1} finished days</h2>
          <div className="flex gap-2 text-sm">
            {[14, 28].map((n) => (
              <Link key={n} href={`/nutrition/${id}${n === 28 ? "?days=28" : ""}`} className={`rounded-full border px-3 py-1 ${span === n ? "border-emerald-300/40 text-emerald-100" : "border-white/10 text-white/55"}`}>
                {n} days
              </Link>
            ))}
          </div>
        </div>
        <p className="mt-1 text-sm text-white/50">“Reached” = at or above the low end of that day&apos;s target. Only days with meals logged count; today isn&apos;t scored yet.</p>
        <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-5">
          <Big label="Days logged" value={`${s.logged}/${s.days}`} />
          {(["kcal", "carbs", "protein", "fat"] as const).map((k) => (
            <Big
              key={k}
              label={k === "kcal" ? "Energy reached" : `${cap(k)} reached`}
              value={s.scored ? `${s.reached[k]}/${s.scored}` : "–"}
              sub={s.logged ? `avg ${s.avg[k]}${k === "kcal" ? " kcal" : " g"}${k !== "kcal" && perKg(s.avg[k]) ? ` · ${perKg(s.avg[k])} g/kg` : ""}` : undefined}
            />
          ))}
        </dl>
      </section>

      {/* Post-workout refuel */}
      <section id="refuel" className="scroll-mt-24 mt-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-6">
        <h2 className="text-lg font-medium">Refuel after workouts</h2>
        <p className="mt-1 text-sm text-white/55">
          The first food eaten after each session of 20+ minutes. Times are when the athlete says they ate it; if they logged it later without changing the time, it shows when it was logged.
        </p>
        {refuel.summary.scored > 0 ? (
          <p className="mt-4 text-2xl font-semibold tabular-nums">
            {refuel.summary.within60}/{refuel.summary.scored}
            <span className="ml-2 text-base font-normal text-white/60">
              sessions refueled within 60 min ({refuel.summary.within30} within 30)
            </span>
          </p>
        ) : (
          <p className="mt-4 text-sm text-white/55">{refuel.rows.length ? "No sessions on days with meals logged yet." : "No sessions of 20+ minutes recorded in this period."}</p>
        )}
        {refuel.rows.length > 0 && (
          <ul className="mt-4 divide-y divide-white/[0.06] border-t border-white/[0.08] text-sm">
            {refuel.rows.map((r) => (
              <RefuelLine key={r.activity.id} r={r} today={today} time={time} />
            ))}
          </ul>
        )}
      </section>

      {/* Goals */}
      <section className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-6">
        <h2 className="text-lg font-medium">Goals</h2>
        <p className="mt-1 text-sm text-white/55">
          Grams per kg of body weight per day, by training day. The day&apos;s level comes from the planned workouts and what they actually did. Leave a range at its default to keep it.
          {goals.updatedAt ? ` Last changed ${new Date(goals.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}${goals.updatedBy ? ` by ${goals.updatedBy}` : ""}.` : ""}
        </p>
        <GoalsEditor athleteId={id} firstName={name.split(" ")[0]} weightKg={w} defaults={PER_KG} custom={goals.perKg} note={goals.note ?? ""} />
      </section>

      {/* Day by day */}
      <section className="mt-6">
        <h2 className="text-lg font-medium">Day by day</h2>
        <ul className="mt-3 grid gap-3">
          {review.days.map((d) => (
            <DayCard key={d.date} d={d} label={dayLabel(d.date, today)} meals={mealsOn(d.date).map((m) => ({ ...m, time: time(m.eaten_at), items: (m.items ?? []) as LoggedItem[] }))} />
          ))}
        </ul>
      </section>
    </DashboardShell>
  );
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

const REFUEL_BADGE: Record<RefuelStatus, { label: string; tone: string }> = {
  within30: { label: "Within 30 min", tone: "border-emerald-300/40 text-emerald-200" },
  within60: { label: "Within 60 min", tone: "border-emerald-300/25 text-emerald-200/80" },
  late: { label: "Later", tone: "border-amber-300/35 text-amber-200" },
  none: { label: "Nothing logged after", tone: "border-amber-300/35 text-amber-200" },
  notLogged: { label: "No meals logged that day", tone: "border-white/15 text-white/50" },
  pending: { label: "Window still open", tone: "border-sky-300/30 text-sky-200" },
};

function RefuelLine({ r, today, time }: { r: RefuelRow; today: string; time: (iso: string) => string }) {
  const b = REFUEL_BADGE[r.status];
  const mins = Math.round((r.activity.duration_s ?? 0) / 60);
  const what = r.activity.name || (r.activity.sport ? cap(r.activity.sport.replace(/_/g, " ").toLowerCase()) : "Workout");
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
      <span className="min-w-0 flex-1">
        <Link href={`/activity/${r.activity.id}`} className="text-white/85 hover:underline">
          {what}
        </Link>
        <span className="block text-white/45">
          {dayLabel(r.localDate, today)} · {mins} min · finished {time(r.end)}
        </span>
      </span>
      <span className="text-right">
        <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] ${b.tone}`}>{b.label}</span>
        {r.meal && (
          <span className="block text-xs text-white/55">
            {r.minutes === 0 ? "Right away" : `${r.minutes} min after`}: {r.meal.label || "Meal"} · {Math.round(r.meal.carbs_g)} g carbs, {Math.round(r.meal.protein_g)} g protein
          </span>
        )}
      </span>
    </li>
  );
}

function Big({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <dt className="text-xs text-white/45">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
      {sub && <dd className="text-xs text-white/50">{sub}</dd>}
    </div>
  );
}

type MealView = { id: string; time: string; label: string | null; items: LoggedItem[]; carbs_g: number; protein_g: number; fat_g: number; kcal: number; note: string | null };

function DayCard({ d, label, meals }: { d: ReviewDay; label: string; meals: MealView[] }) {
  const lv = LEVEL[d.level];
  return (
    <li className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
      <details>
        <summary className="cursor-pointer list-none">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium">{label}</span>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] ${lv.tone}`}>{lv.label} fuel day</span>
            <span className="text-sm text-white/50">
              {d.workouts.length ? d.workouts.join(" · ") : "No planned session"}
              {d.trained ? ` · ${d.trained} min recorded` : ""}
            </span>
            <span className="ml-auto text-sm text-white/50">{d.meals ? `${d.meals} meal${d.meals === 1 ? "" : "s"} ›` : "Nothing logged"}</span>
          </div>
          {d.meals > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Macro name="Energy" unit="kcal" eaten={d.eaten.kcal} range={d.targets?.kcal ?? null} />
              {(["carbs", "protein", "fat"] as Macro[]).map((k) => (
                <Macro key={k} name={cap(k)} unit="g" eaten={d.eaten[k]} range={d.targets?.[k] ?? null} />
              ))}
            </div>
          )}
        </summary>
        {meals.length > 0 && (
          <ul className="mt-4 divide-y divide-white/[0.06] border-t border-white/[0.08] text-sm">
            {meals.map((m) => (
              <li key={m.id} className="py-3">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="text-white/85">
                    <span className="text-white/45">{m.time}</span> {m.label || "Meal"}
                  </span>
                  <span className="tabular-nums text-white/55">
                    {Math.round(m.carbs_g)} C · {Math.round(m.protein_g)} P · {Math.round(m.fat_g)} F · {m.kcal} kcal
                  </span>
                </div>
                {m.items.length > 0 && <p className="mt-1 text-white/50">{m.items.map((i) => (i.portion ? `${i.name} (${i.portion})` : i.name)).join(", ")}</p>}
                {m.note && <p className="mt-1 text-white/45 italic">“{m.note}”</p>}
              </li>
            ))}
          </ul>
        )}
      </details>
    </li>
  );
}

function Macro({ name, unit, eaten, range }: { name: string; unit: string; eaten: number; range: Range | null }) {
  const reached = range ? eaten >= range.low : null;
  const over = range ? eaten > range.high : false;
  const fill = range ? Math.min(1, eaten / Math.max(1, range.low)) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-white/50">{name}</span>
        <span className={`tabular-nums ${reached === null ? "text-white/70" : reached ? "text-emerald-200" : "text-amber-200"}`}>
          {eaten}
          {range ? ` / ${range.low}–${range.high}` : ""} {unit}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
        <div className={`h-full rounded-full ${reached ? (over ? "bg-sky-300/70" : "bg-emerald-300/80") : "bg-amber-300/70"}`} style={{ width: `${Math.round(fill * 100)}%` }} />
      </div>
    </div>
  );
}
