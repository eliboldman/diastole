import type { Metadata } from "next";
import { notFound } from "next/navigation";

import BackLink from "@/components/layout/BackLink";
import DashboardShell from "@/components/layout/DashboardShell";
import ApplyPlan from "@/components/plans/ApplyPlan";
import PlanAthletes from "@/components/plans/PlanAthletes";
import TemplateEditor, { type EditorWorkout } from "@/components/plans/TemplateEditor";
import { createClient, requireCoach } from "@/lib/supabase/server";
import type { Brick, Pool, PoolUnit, Step } from "@/lib/workouts/garmin-format";
import { summarize } from "@/lib/workouts/totals";

export const metadata: Metadata = { title: "Plan · Diastole" };

export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const coach = await requireCoach();
  const supabase = await createClient();
  const [{ data: t }, { data: rows }, { data: apps }, { data: roster }, { data: library }] = await Promise.all([
    supabase.from("plan_templates").select("id, name, description, tags, weeks, race_week, week_notes, version").eq("id", id).maybeSingle(),
    supabase.from("plan_template_workouts").select("id, week, day, position, title, sport, steps, brick, pool_length, pool_unit").eq("template_id", id).order("week").order("day").order("position"),
    supabase.from("plan_applications").select("id, athlete_id, template_version, start_date, race_date, created_at").eq("template_id", id).order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name, email").or(`coach_id.eq.${coach.id},id.eq.${coach.id}`).eq("is_test", false).order("full_name"),
    supabase.from("workout_library").select("id, title, sport").eq("coach_id", coach.id).in("sport", ["run", "bike", "swim"]).order("updated_at", { ascending: false }).limit(300),
  ]);
  if (!t) notFound();
  const units = coach.units === "km" ? "km" : "mi";
  const name = (pid: string) => {
    const p = roster?.find((r) => r.id === pid);
    return pid === coach.id ? "You" : ((p?.full_name || p?.email || "Athlete") as string);
  };
  const workouts: EditorWorkout[] = (rows ?? []).map((r) => {
    const pool: Pool = r.pool_length && r.pool_unit ? { length: Number(r.pool_length), unit: r.pool_unit as PoolUnit } : null;
    const s = summarize((r.steps ?? []) as Step[], r.sport, pool, units, null, (r.brick ?? null) as Brick);
    return { id: r.id, week: r.week, day: r.day, title: r.title, sport: r.sport, summary: [s.structure, s.time].filter(Boolean).join(" · ") };
  });

  return (
    <DashboardShell>
      <BackLink href="/library" label="Library" />
      <TemplateEditor
        plan={{ id: t.id, name: t.name, description: t.description, tags: t.tags ?? [], weeks: t.weeks, raceWeek: t.race_week, weekNotes: (t.week_notes ?? {}) as Record<string, string> }}
        workouts={workouts}
        library={(library ?? []).map((l) => ({ id: l.id, title: l.title, sport: l.sport }))}
      />
      <ApplyPlan planId={t.id} raceWeek={t.race_week} weeks={t.weeks} athletes={(roster ?? []).map((r) => ({ id: r.id, name: name(r.id) }))} />
      <PlanAthletes
        version={t.version}
        apps={(apps ?? []).map((a) => ({ id: a.id, name: name(a.athlete_id), athleteId: a.athlete_id, start: a.start_date, race: a.race_date, behind: a.template_version < t.version }))}
      />
    </DashboardShell>
  );
}
