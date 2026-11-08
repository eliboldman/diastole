import type { Metadata } from "next";

import WorkoutBuilder from "@/components/coach/WorkoutBuilder";
import BackLink from "@/components/layout/BackLink";
import DashboardShell from "@/components/layout/DashboardShell";
import { createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Build a workout · Diastole" };

export default async function NewMyWorkout() {
  const me = await requireUser();
  const { data: device } = await (await createClient()).from("device_connections").select("source").eq("athlete_id", me.id).maybeSingle();
  return (
    <DashboardShell role={me.role === "coach" ? "coach" : "athlete"}>
      <BackLink href="/training/mine" label="My workouts" />
      <h1 className="mb-6 mt-4 text-3xl font-bold tracking-tight">Build a workout</h1>
      <WorkoutBuilder mode="athlete" hasCoach={Boolean(me.coach_id && me.coach_id !== me.id)} athleteId={me.id} athleteName="you" device={(device?.source ?? null) as "garmin" | "apple" | null} units={me.units === "km" ? "km" : "mi"} />
    </DashboardShell>
  );
}
