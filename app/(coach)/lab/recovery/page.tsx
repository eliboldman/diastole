import type { Metadata } from "next";

import RoutineLibrary from "@/components/recovery/RoutineLibrary";
import BackLink from "@/components/layout/BackLink";
import DashboardShell from "@/components/layout/DashboardShell";
import { MOVES } from "@/lib/recovery/catalog";
import { routinesFor } from "@/lib/recovery/data";
import { createClient, requireCoach } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Recovery routines · Diastole" };

/** The coach's recovery library: build routines from the demo moves and assign them like workouts. */
export default async function RecoveryLibraryPage() {
  const coach = await requireCoach();
  const supabase = await createClient();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: coach.timezone });
  const [routines, { data: athletes }, { data: videos }] = await Promise.all([
    routinesFor(supabase, coach.id),
    supabase.from("profiles").select("id, full_name, email").or(`coach_id.eq.${coach.id},id.eq.${coach.id}`).eq("is_test", false).order("full_name"),
    supabase.from("recovery_videos").select("slug"),
  ]);
  const roster = (athletes ?? []).map((a) => ({ id: a.id, name: a.id === coach.id ? "You" : a.full_name || a.email || "Athlete" }));
  const withClip = new Set((videos ?? []).map((v) => v.slug));
  return (
    <DashboardShell>
      <BackLink href="/endurance-lab" label="Endurance Lab" />
      <h1 className="mt-4 text-4xl font-bold tracking-tight">Recovery</h1>
      <p className="mt-2 text-white/55">
        Build routines from your demo moves and assign them like workouts. {withClip.size} of {MOVES.length} moves have your video so far.
      </p>
      <RoutineLibrary routines={routines} moves={MOVES.map((m) => ({ ...m, hasClip: withClip.has(m.slug) }))} roster={roster} today={today} />
    </DashboardShell>
  );
}
