import type { Metadata } from "next";
import { notFound } from "next/navigation";

import VersionHistory, { type Version } from "@/components/coach/VersionHistory";
import WorkoutBuilder from "@/components/coach/WorkoutBuilder";
import WhyEditor from "@/components/coach/WhyEditor";
import WorkoutTools from "@/components/coach/WorkoutTools";
import DashboardShell from "@/components/layout/DashboardShell";
import { createClient, requireCoach } from "@/lib/supabase/server";
import type { Pool, PoolUnit, Sport, Step } from "@/lib/workouts/garmin-format";
import BackLink from "@/components/layout/BackLink";
import { MessageAbout, WorkoutMessages } from "@/components/messages/WorkoutMessages";

export const metadata: Metadata = { title: "Workout · Diastole" };

type Row = {
  id: string;
  why: string | null;
  title: string;
  sport: string;
  scheduled_date: string;
  description: string | null;
  steps: Step[];
  status: string;
  deleted_at: string | null;
  removal_status: string | null;
  removal_error: string | null;
  pool_length: number | null;
  pool_unit: PoolUnit | null;
};


export default async function WorkoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; workoutId: string }>;
  searchParams: Promise<{ sport?: string }>;
}) {
  const { id, workoutId } = await params;
  const { sport: sportParam } = await searchParams;
  const me = await requireCoach();
  const startSport: Sport = sportParam === "bike" || sportParam === "swim" ? sportParam : "run";
  const supabase = await createClient();

  const [{ data: athlete }, { data: device }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email").eq("id", id).maybeSingle(),
    supabase.from("device_connections").select("source").eq("athlete_id", id).maybeSingle(),
  ]);
  if (!athlete) notFound();

  let w: Row | null = null;
  let versions: Version[] = [];
  let whyDraft: { draft: string } | null = null;
  if (workoutId !== "new") {
    const [{ data }, { data: v }] = await Promise.all([
      supabase
        .from("planned_workouts")
        .select("id, title, sport, scheduled_date, description, steps, status, deleted_at, removal_status, removal_error, pool_length, pool_unit, why")
        .eq("id", workoutId)
        .eq("athlete_id", id)
        .maybeSingle(),
      supabase
        .from("workout_versions")
        .select("version, change, title, sport, scheduled_date, steps, created_at, pool_length, pool_unit")
        .eq("workout_id", workoutId)
        .order("version", { ascending: false }),
    ]);
    if (!data) notFound();
    w = data as Row;
    ({ data: whyDraft } = await supabase.from("workout_why_drafts").select("draft").eq("workout_id", workoutId).maybeSingle());
    versions = (v ?? []) as Version[];
  }

  const pool: Pool = w?.pool_length && w.pool_unit ? { length: Number(w.pool_length), unit: w.pool_unit } : null;
  const initial = w
    ? {
        id: w.id,
        title: w.title,
        sport: w.sport as Sport,
        scheduledDate: w.scheduled_date,
        description: w.description,
        steps: w.steps,
        status: w.status,
        pool,
        why: w.why,
      }
    : undefined;

  const name = athlete.full_name || athlete.email || "Athlete";
  const firstName = name.split(" ")[0];
  const source = (device?.source ?? null) as "garmin" | "apple" | null;

  return (
    <DashboardShell>
      <BackLink href={`/athlete/${id}`} label={name} />
      <h1 className={`mt-2 text-3xl font-bold tracking-tight sm:text-4xl ${w?.deleted_at ? "text-white/50 line-through decoration-white/20" : ""}`}>
        {w ? w.title : "New workout"}
      </h1>
      <p className="mt-2 text-sm text-white/55">For {name}. Drafts stay private until you approve and send.</p>
      {/* Not for drafts: the athlete can't see those yet. */}
      {w && !w.deleted_at && w.status !== "draft" && id !== me.id && (
        <div className="mt-4">
          <MessageAbout to={id} name={firstName} workoutId={w.id} />
        </div>
      )}
      {/* Drafts edit the why inside the builder; once sent (builder locked), it's edited here. */}
      {w && !w.deleted_at && w.status !== "draft" && (
        <section className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-5 backdrop-blur-xl sm:p-6">
          <h2 className="text-lg font-medium">Why this workout</h2>
          <p className="mb-3 mt-1 text-sm text-white/55">{`A sentence or two on what it's for. ${firstName} sees it with the workout once you save it.`}</p>
          <WhyEditor workoutId={w.id} athleteFirstName={firstName} saved={w.why ?? null} draft={whyDraft?.draft ?? null} />
        </section>
      )}
      {w && w.status !== "draft" && <WorkoutMessages workoutId={w.id} me={me.id} names={{ [id]: firstName }} />}

      {w && (
        <div className="mt-6">
          <WorkoutTools
            athleteId={id}
            athleteName={firstName}
            device={source}
            workout={{
              id: w.id,
              title: w.title,
              scheduledDate: w.scheduled_date,
              sport: w.sport,
              pool,
              units: me.units,
              steps: w.steps,
              status: w.status,
              deletedAt: w.deleted_at,
              removalStatus: w.removal_status,
              removalError: w.removal_error,
            }}
          />
        </div>
      )}

      {!w?.deleted_at && (
        <section className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-4 sm:p-6">
          <WorkoutBuilder athleteId={id} athleteName={firstName} device={source} initial={initial} startSport={startSport} units={me.units} />
        </section>
      )}

      {versions.length > 0 && (
        <div className="mt-6">
          <VersionHistory versions={versions} units={me.units} />
        </div>
      )}
    </DashboardShell>
  );
}
