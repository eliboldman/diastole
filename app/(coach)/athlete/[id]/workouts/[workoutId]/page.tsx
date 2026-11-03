import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import WorkoutBuilder from "@/components/coach/WorkoutBuilder";
import DashboardShell from "@/components/layout/DashboardShell";
import { createClient } from "@/lib/supabase/server";
import type { Sport, Step } from "@/lib/workouts/garmin-format";

export const metadata: Metadata = { title: "Workout · Diastole" };

export default async function WorkoutPage({ params }: { params: Promise<{ id: string; workoutId: string }> }) {
  const { id, workoutId } = await params;
  const supabase = await createClient();

  const [{ data: athlete }, { data: device }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email").eq("id", id).maybeSingle(),
    supabase.from("device_connections").select("source").eq("athlete_id", id).maybeSingle(),
  ]);
  if (!athlete) notFound();

  let initial;
  if (workoutId !== "new") {
    const { data: w } = await supabase
      .from("planned_workouts")
      .select("id, title, sport, scheduled_date, description, steps, status")
      .eq("id", workoutId)
      .eq("athlete_id", id)
      .maybeSingle();
    if (!w) notFound();
    initial = {
      id: w.id,
      title: w.title,
      sport: w.sport as Sport,
      scheduledDate: w.scheduled_date,
      description: w.description,
      steps: w.steps as Step[],
      status: w.status,
    };
  }

  const name = athlete.full_name || athlete.email || "Athlete";
  const firstName = name.split(" ")[0];

  return (
    <DashboardShell>
      <Link href={`/athlete/${id}`} className="text-sm text-white/45 hover:text-white">
        ← {name}
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">{initial ? initial.title : "New workout"}</h1>
      <p className="mt-2 text-sm text-white/40">
        For {name}. Drafts stay private until you approve and send.
      </p>
      <section className="mt-8 rounded-[28px] border border-white/10 bg-white/[0.03] p-4 sm:p-6">
        <WorkoutBuilder athleteId={id} athleteName={firstName} device={device?.source ?? null} initial={initial} />
      </section>
    </DashboardShell>
  );
}
