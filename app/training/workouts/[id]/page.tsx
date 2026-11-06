import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import SessionFuel from "@/components/fuel/SessionFuel";
import BackLink from "@/components/layout/BackLink";
import { MessageAbout, WorkoutMessages } from "@/components/messages/WorkoutMessages";
import DashboardShell from "@/components/layout/DashboardShell";
import { sportLabel } from "@/lib/activity/format";
import { getFuelMode } from "@/lib/fuel/data";
import { estimateSession, FUEL_DISCLAIMER } from "@/lib/fuel/plan";
import { createClient, requireUser } from "@/lib/supabase/server";
import { describe } from "@/lib/workouts/describe";
import type { Pool, PoolUnit, Step } from "@/lib/workouts/garmin-format";

export const metadata: Metadata = { title: "Workout · Diastole" };

/** An athlete's view of one planned workout (drafts stay hidden by row-level security). */
export default async function AthleteWorkoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireUser();
  const supabase = await createClient();

  const [{ data: w }, { data: done }] = await Promise.all([
    supabase
      .from("planned_workouts")
      .select("id, athlete_id, title, sport, scheduled_date, description, steps, status, pool_length, pool_unit, why")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase.from("activities").select("id, name, sport").eq("planned_workout_id", id).limit(1).maybeSingle(),
  ]);
  if (!w) notFound();
  const [{ data: zones }, mode] = await Promise.all([
    supabase.from("athlete_zones").select("threshold_speed_mps, ftp_w").eq("athlete_id", w.athlete_id).maybeSingle(),
    getFuelMode(w.athlete_id),
  ]);

  const pool: Pool = w.pool_length && w.pool_unit ? { length: Number(w.pool_length), unit: w.pool_unit as PoolUnit } : null;
  const lines = describe(w.steps as Step[], me.units, pool, w.sport === "swim");
  const session = estimateSession(w.steps as Step[], w.sport, zones, pool);

  return (
    <DashboardShell role={me.role === "coach" ? "coach" : "athlete"}>
      <BackLink href="/training" label="Training" />
      <p className="mt-4 text-sm uppercase tracking-[0.25em] text-white/50">{sportLabel(w.sport)}</p>
      <h1 className="mt-2 break-words text-3xl font-bold tracking-tight sm:text-4xl">{w.title}</h1>
      <p className="mt-2 text-sm text-white/55">
        {new Date(`${w.scheduled_date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        {pool ? ` · ${pool.length} ${pool.unit === "YARD" ? "yd" : "m"} pool` : ""}
      </p>

      {w.why && (
        <section className="row-in mt-6 rounded-[28px] border border-emerald-300/20 bg-emerald-300/[0.05] p-5">
          <p className="text-[11px] uppercase tracking-[0.15em] text-emerald-100/70">Why this workout</p>
          <p className="mt-1.5 text-[15px] leading-relaxed text-white/90">{w.why}</p>
          <p className="mt-2 text-xs text-white/45">From your coach</p>
        </section>
      )}

      {me.coach_id && me.coach_id !== me.id && (
        <div className="mt-4">
          <MessageAbout to="coach" name="coach" workoutId={w.id} />
        </div>
      )}

      {done && (
        <Link href={`/activity/${done.id}`} className="lift mt-6 flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-emerald-300/25 bg-emerald-300/[0.08] px-4">
          <span className="min-w-0 truncate text-sm">
            Done: <strong className="font-medium">{done.name || sportLabel(done.sport)}</strong>. See how it went.
          </span>
          <ChevronRight size={16} className="shrink-0 text-emerald-200" aria-hidden />
        </Link>
      )}

      {w.description && (
        <section className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-6">
          <p className="whitespace-pre-line text-sm leading-relaxed text-white/75">{w.description}</p>
        </section>
      )}

      <section className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-6">
        <h2 className="text-lg font-medium">Steps</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-white/80">
          {lines.map((l, i) => (
            <li key={i} className="break-words">
              {l}
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs text-white/45">On your watch after it syncs. Training guidance from your coach, not medical advice.</p>
      </section>

      {!done && (
        <section className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-6">
          <h2 className="text-lg font-medium">Fueling</h2>
          <div className="mt-3">
            <SessionFuel session={session} mode={mode} />
          </div>
          <p className="mt-4 text-xs text-white/45">{FUEL_DISCLAIMER}</p>
        </section>
      )}

      <WorkoutMessages workoutId={w.id} me={me.id} names={{}} />
    </DashboardShell>
  );
}
