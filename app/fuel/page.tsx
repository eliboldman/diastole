import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import FuelLog from "@/components/fuel/FuelLog";
import FuelView from "@/components/fuel/FuelView";
import DashboardShell from "@/components/layout/DashboardShell";
import { getFuelDays, getFuelMode, getMealDay, getNutritionGoals } from "@/lib/fuel/data";
import { ring } from "@/lib/fuel/meals";
import { createAdminClient, requireUser } from "@/lib/supabase/server";

import WidgetSync, { type FuelSnapshot } from "@/components/fuel/WidgetSync";

export const metadata: Metadata = { title: "Fuel · Diastole" };

export default async function FuelPage({ searchParams }: { searchParams: Promise<{ log?: string; via?: string }> }) {
  const me = await requireUser();
  const { log, via } = await searchParams;
  const start = via === "photo" || via === "scan" || via === "describe" ? via : undefined;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: me.timezone });
  const [mode, days, goals, dietitians] = await Promise.all([getFuelMode(me.id), getFuelDays(me.id, today, 7), getNutritionGoals(me.id), teamDietitians(me.coach_id, me.id)]);
  const meals = mode === "workout" ? null : await getMealDay(me.id, today, me.timezone, days[0].level);
  const r = (n: number) => Math.round(n);
  const show = mode === "full" && meals?.targets;
  const snapshot: FuelSnapshot = {
    date: today,
    level: meals?.level ?? days[0].level,
    mode,
    meals: meals?.meals.length ?? 0,
    carbs: show ? { eaten: r(meals.eaten.carbs), low: r(meals.targets!.carbs.low), high: r(meals.targets!.carbs.high) } : null,
    protein: show ? { eaten: r(meals.eaten.protein), low: r(meals.targets!.protein.low), high: r(meals.targets!.protein.high) } : null,
    fat: show ? { eaten: r(meals.eaten.fat), low: r(meals.targets!.fat.low), high: r(meals.targets!.fat.high) } : null,
    kcal: show ? { eaten: r(meals.eaten.kcal), low: r(meals.targets!.kcal.low), high: r(meals.targets!.kcal.high) } : null,
    rings: meals?.targets
      ? {
          carbs: ring(meals.eaten.carbs, meals.targets.carbs).fill,
          protein: ring(meals.eaten.protein, meals.targets.protein).fill,
          fat: ring(meals.eaten.fat, meals.targets.fat).fill,
        }
      : null,
  };
  return (
    <DashboardShell role={me.role === "coach" ? "coach" : "athlete"}>
      <WidgetSync snapshot={snapshot} />
      {(goals.note || dietitians.length > 0) && (
        <section className="mb-6 rounded-[28px] border border-emerald-300/15 bg-emerald-300/[0.05] p-5">
          {goals.note && (
            <>
              <p className="text-xs uppercase tracking-[0.18em] text-emerald-200/70">From {goals.updatedBy?.split(" ")[0] || "your dietitian"}</p>
              <p className="mt-2 whitespace-pre-line text-white/85">{goals.note}</p>
            </>
          )}
          {dietitians.length > 0 && (
            <p className={`text-xs text-white/50 ${goals.note ? "mt-3" : ""}`}>
              {dietitians.join(" and ")}, your team dietitian{dietitians.length > 1 ? "s" : ""}, can see your Diastole data and helps set your fueling goals.
            </p>
          )}
        </section>
      )}
      <FuelView mode={mode} days={days} log={meals && <FuelLog day={meals} mode={mode} timeZone={me.timezone} units={me.units} autoOpen={log === "1"} start={start} />} />
      <Link href="/races" className="lift mt-6 flex items-center justify-between gap-3 rounded-[28px] border border-white/10 bg-white/[0.055] p-5">
        <span>
          <span className="block font-medium">Race fueling</span>
          <span className="block text-sm text-white/55">Race plans, sweat-rate test and gut training</span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-white/40" aria-hidden />
      </Link>
    </DashboardShell>
  );
}

/** Names of the team dietitians who can see this athlete (profiles aren't visible to athletes, so read server-side). */
async function teamDietitians(coachId: string | null, athleteId: string): Promise<string[]> {
  if (!coachId) return [];
  const admin = createAdminClient();
  const [{ data }, { data: picked }] = await Promise.all([
    admin.from("profiles").select("id, full_name, email, dietitian_all").eq("team_coach_id", coachId).eq("role", "dietitian"),
    admin.from("dietitian_athletes").select("dietitian_id").eq("athlete_id", athleteId),
  ]);
  const mine = new Set((picked ?? []).map((p) => p.dietitian_id));
  return (data ?? []).filter((d) => d.dietitian_all || mine.has(d.id)).map((d) => d.full_name || d.email || "A dietitian");
}
