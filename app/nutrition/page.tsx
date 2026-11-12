import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import EmptyState from "@/components/EmptyState";
import DashboardShell from "@/components/layout/DashboardShell";
import WorkoutAlerts from "@/components/nutrition/WorkoutAlerts";
import { getNutritionGoals, getNutritionReview, getRefuel } from "@/lib/fuel/data";
import { createClient, requireStaff } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Nutrition · Diastole" };

const pct = (n: number, of: number) => (of ? `${n}/${of}` : "–");

// The team at a glance for a dietitian (or the coach): last 7 days of logging and targets reached.
export default async function NutritionPage() {
  const me = await requireStaff();
  const teamCoach = me.role === "dietitian" ? me.team_coach_id : me.id;
  const supabase = await createClient();
  const { data: athletes } = teamCoach
    ? await supabase.from("profiles").select("id, full_name, email, timezone").eq("coach_id", teamCoach).eq("is_test", false).order("full_name")
    : { data: [] };

  const { data: mine } = me.role === "dietitian" ? await supabase.from("profiles").select("notify_prefs").eq("id", me.id).maybeSingle() : { data: null };

  const rows = await Promise.all(
    (athletes ?? []).map(async (a) => {
      const tz = a.timezone || "America/Chicago";
      const today = new Date().toLocaleDateString("en-CA", { timeZone: tz });
      const goals = await getNutritionGoals(a.id);
      const weekAgo = new Date(`${today}T12:00:00Z`);
      weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);
      const [review, refuel] = await Promise.all([
        getNutritionReview(a.id, today, tz, 8, goals.perKg), // today + 7 finished days
        getRefuel(a.id, weekAgo.toISOString().slice(0, 10), tz),
      ]);
      const s = review.summary;
      const flags: string[] = [];
      if (!review.weightKg) flags.push("No body weight, so no gram targets");
      if (!s.logged) flags.push("Nothing logged this week");
      else if (s.scored >= 3 && s.reached.kcal / s.scored < 0.5) flags.push("Under energy target most logged days");
      else if (s.scored >= 3 && s.reached.carbs / s.scored < 0.5) flags.push("Under carb target most logged days");
      const rf = refuel.summary;
      if (rf.scored >= 3 && rf.within60 / rf.scored < 0.5) flags.push("Often no food logged within an hour of finishing");
      const custom = Object.keys(goals.perKg).length > 0;
      const todayMeals = review.days[0]?.meals ?? 0;
      return { a, s, rf, flags, custom, todayMeals, note: !!goals.note };
    }),
  );

  return (
    <DashboardShell role={me.role === "dietitian" ? "dietitian" : "coach"}>
      <p className="text-sm uppercase tracking-[0.25em] text-white/50">Nutrition</p>
      <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">Team fueling</h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-white/55">
        The last 7 finished days for each athlete: how many days they logged, and on logged days how often they reached the low end of their targets. Open an athlete to see every day and meal, and to set their goals.
      </p>
      {me.role === "dietitian" && <WorkoutAlerts initial={(mine?.notify_prefs ?? {}) as Record<string, boolean>} />}

      {!rows.length ? (
        <div className="mt-10">
          <EmptyState emoji="🥗" title="No athletes yet">Athletes show up here once the coach has invited them.</EmptyState>
        </div>
      ) : (
        <ul className="mt-10 grid gap-3">
          {rows.map(({ a, s, rf, flags, custom, todayMeals, note }) => (
            <li key={a.id}>
              <Link href={`/nutrition/${a.id}`} className="lift flex items-center gap-4 rounded-[28px] border border-white/10 bg-white/[0.055] p-5">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {a.full_name || a.email}
                    {custom && <span className="rounded-full border border-emerald-300/25 px-2 py-0.5 text-[11px] text-emerald-200/90">Custom goals</span>}
                    {note && <span className="rounded-full border border-white/15 px-2 py-0.5 text-[11px] text-white/60">Note shared</span>}
                  </p>
                  <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-6">
                    <Stat label="Days logged" value={pct(s.logged, s.days)} />
                    <Stat label="Energy reached" value={pct(s.reached.kcal, s.scored)} />
                    <Stat label="Carbs reached" value={pct(s.reached.carbs, s.scored)} />
                    <Stat label="Protein reached" value={pct(s.reached.protein, s.scored)} />
                    <Stat label="Refuel ≤60 min" value={pct(rf.within60, rf.scored)} />
                    <Stat label="Meals today" value={String(todayMeals)} />
                  </dl>
                  {flags.length > 0 && <p className="mt-3 text-sm text-amber-200/90">{flags.join(" · ")}</p>}
                </div>
                <ChevronRight size={18} className="shrink-0 text-white/40" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </DashboardShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-white/45">{label}</dt>
      <dd className="tabular-nums text-white/85">{value}</dd>
    </div>
  );
}
