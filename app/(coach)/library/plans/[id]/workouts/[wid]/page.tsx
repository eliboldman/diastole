import type { Metadata } from "next";
import { notFound } from "next/navigation";

import WorkoutBuilder from "@/components/coach/WorkoutBuilder";
import BackLink from "@/components/layout/BackLink";
import DashboardShell from "@/components/layout/DashboardShell";
import { createClient, requireCoach } from "@/lib/supabase/server";
import type { Brick, Pool, PoolUnit, Sport, Step } from "@/lib/workouts/garmin-format";
import type { StrengthItem } from "@/lib/strength/workout";

export const metadata: Metadata = { title: "Plan session · Diastole" };

/** One session of a plan template, in the builder (template mode: week and day, nothing is sent). */
export default async function PlanSessionPage({ params, searchParams }: { params: Promise<{ id: string; wid: string }>; searchParams: Promise<{ week?: string; day?: string }> }) {
  const { id, wid } = await params;
  const sp = await searchParams;
  const coach = await requireCoach();
  const supabase = await createClient();
  const { data: t } = await supabase.from("plan_templates").select("id, name, weeks").eq("id", id).maybeSingle();
  if (!t) notFound();
  const isNew = wid === "new";
  const { data: w } = isNew
    ? { data: null }
    : await supabase.from("plan_template_workouts").select("id, week, day, title, sport, description, why, steps, brick, pool_length, pool_unit, strength").eq("id", wid).eq("template_id", id).maybeSingle();
  if (!isNew && !w) notFound();
  const week = w?.week ?? Math.min(52, Math.max(1, Number(sp.week) || 1));
  const day = w?.day ?? Math.min(6, Math.max(0, Number(sp.day) || 0));
  const pool: Pool = w?.pool_length && w.pool_unit ? { length: Number(w.pool_length), unit: w.pool_unit as PoolUnit } : null;

  return (
    <DashboardShell>
      <BackLink href={`/library/plans/${id}`} label={t.name} />
      <p className="mt-4 text-sm uppercase tracking-[0.25em] text-white/50">{t.name}</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">{isNew ? "New session" : "Edit session"}</h1>
      <p className="mt-2 text-sm text-white/55">Write targets for the athlete the plan was built from; they&apos;re re-worked from each athlete&apos;s zones when the plan is applied.</p>
      <div className="mt-6">
        <WorkoutBuilder
          mode="template"
          template={{ id, week, day, weeks: t.weeks }}
          athleteId={coach.id}
          athleteName="this plan"
          device={null}
          units={coach.units === "km" ? "km" : "mi"}
          initial={
            w
              ? {
                  id: w.id,
                  title: w.title,
                  sport: w.sport as Sport | "strength",
                  strength: (w.strength ?? null) as StrengthItem[] | null,
                  scheduledDate: new Date().toISOString().slice(0, 10),
                  description: w.description,
                  steps: (w.steps ?? []) as Step[],
                  status: "draft",
                  pool,
                  why: w.why,
                  brick: (w.brick ?? null) as Brick,
                }
              : undefined
          }
        />
      </div>
    </DashboardShell>
  );
}
