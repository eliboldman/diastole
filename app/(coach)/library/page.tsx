import type { Metadata } from "next";

import ConnectImport from "@/components/coach/ConnectImport";
import Library from "@/components/coach/Library";
import PlanCards from "@/components/plans/PlanCards";
import Spotlight from "@/components/Spotlight";
import { seen, TIPS } from "@/lib/discovery";
import DashboardShell from "@/components/layout/DashboardShell";
import { createClient, requireCoach } from "@/lib/supabase/server";
import type { Step } from "@/lib/workouts/garmin-format";

export const metadata: Metadata = { title: "Library · Diastole" };

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const coach = await requireCoach();
  const supabase = await createClient();
  const [{ data: items }, { data: athletes }, { data: plans }, { data: apps }, { data: prof }] = await Promise.all([
    supabase
      .from("workout_library")
      .select("id, title, sport, workout_type, tags, description, steps, use_count, last_used_at, updated_at, pool_length, pool_unit, brick")
      .eq("coach_id", coach.id)
      .order("updated_at", { ascending: false })
      .limit(500),
    supabase.from("profiles").select("id, full_name, email").eq("coach_id", coach.id).order("full_name"),
    supabase.from("plan_templates").select("id, name, weeks, tags, version, updated_at, plan_template_workouts(count)").eq("coach_id", coach.id).order("updated_at", { ascending: false }),
    supabase.from("plan_applications").select("template_id, athlete_id, template_version").eq("coach_id", coach.id),
    supabase.from("profiles").select("seen_tips").eq("id", coach.id).maybeSingle(),
  ]);
  const planCards = (plans ?? []).map((p) => {
    const mine = (apps ?? []).filter((a) => a.template_id === p.id);
    const count = (p.plan_template_workouts as unknown as { count: number }[] | null)?.[0]?.count ?? 0;
    return { id: p.id, name: p.name, weeks: p.weeks, tags: p.tags ?? [], sessions: count, athletes: new Set(mine.map((a) => a.athlete_id)).size, behind: mine.filter((a) => a.template_version < p.version).length, updated_at: p.updated_at };
  });

  return (
    <DashboardShell>
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Workout library</h1>
      <p className="mt-2 text-sm text-white/55">
        Every workout you build is saved here. Assign one to any athlete as a draft, then approve and send as usual.
      </p>
      <Spotlight tip={TIPS.plans} seen={seen(prof?.seen_tips, TIPS.plans.id)} />
      <PlanCards plans={planCards} />
      <ConnectImport athletes={(athletes ?? []).map((a) => ({ id: a.id, name: a.id === coach.id ? `${a.full_name || "You"} (you)` : a.full_name || a.email || "Athlete" }))} />
      <Library
        items={(items ?? []).map((i) => ({ ...i, steps: i.steps as Step[] }))}
        athletes={(athletes ?? []).map((a) => ({ id: a.id, name: a.full_name || a.email || "Athlete" }))}
        units={coach.units}
        initialQuery={typeof q === "string" ? q.slice(0, 100) : ""}
      />
    </DashboardShell>
  );
}
