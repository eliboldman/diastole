import type { Metadata } from "next";
import { notFound } from "next/navigation";

import WorkoutBuilder from "@/components/coach/WorkoutBuilder";
import BackLink from "@/components/layout/BackLink";
import DashboardShell from "@/components/layout/DashboardShell";
import { createClient, requireUser } from "@/lib/supabase/server";
import type { Pool, Sport, Step } from "@/lib/workouts/garmin-format";

export const metadata: Metadata = { title: "Edit workout · Diastole" };

export default async function EditMyWorkout({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const [{ data: w }, { data: device }] = await Promise.all([
    supabase.from("athlete_library").select("id, title, sport, description, steps, pool_length, pool_unit").eq("id", id).eq("athlete_id", me.id).maybeSingle(),
    supabase.from("device_connections").select("source").eq("athlete_id", me.id).maybeSingle(),
  ]);
  if (!w) notFound();
  const pool: Pool = w.pool_length && w.pool_unit ? { length: Number(w.pool_length), unit: w.pool_unit as "METER" | "YARD" } : null;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: me.timezone });
  const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  return (
    <DashboardShell role={me.role === "coach" ? "coach" : "athlete"}>
      <BackLink href="/training/mine" label="My workouts" />
      <h1 className="mb-6 mt-4 text-3xl font-bold tracking-tight">{w.title}</h1>
      <WorkoutBuilder
        mode="athlete"
        hasCoach={Boolean(me.coach_id && me.coach_id !== me.id)}
        athleteId={me.id}
        athleteName="you"
        device={(device?.source ?? null) as "garmin" | "apple" | null}
        units={me.units === "km" ? "km" : "mi"}
        initial={{ id: w.id, title: w.title, sport: w.sport as Sport, scheduledDate: tomorrow, description: w.description, steps: w.steps as Step[], status: "draft", pool }}
      />
    </DashboardShell>
  );
}
