import type { Metadata } from "next";

import ConnectImport from "@/components/coach/ConnectImport";
import Library from "@/components/coach/Library";
import DashboardShell from "@/components/layout/DashboardShell";
import { createClient, requireCoach } from "@/lib/supabase/server";
import type { Step } from "@/lib/workouts/garmin-format";

export const metadata: Metadata = { title: "Library · Diastole" };

export default async function LibraryPage() {
  const coach = await requireCoach();
  const supabase = await createClient();
  const [{ data: items }, { data: athletes }] = await Promise.all([
    supabase
      .from("workout_library")
      .select("id, title, sport, workout_type, tags, description, steps, use_count, last_used_at, updated_at, pool_length, pool_unit")
      .eq("coach_id", coach.id)
      .order("updated_at", { ascending: false })
      .limit(500),
    supabase.from("profiles").select("id, full_name, email").eq("coach_id", coach.id).order("full_name"),
  ]);

  return (
    <DashboardShell>
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Workout library</h1>
      <p className="mt-2 text-sm text-white/55">
        Every workout you build is saved here. Assign one to any athlete as a draft, then approve and send as usual.
      </p>
      <ConnectImport />
      <Library
        items={(items ?? []).map((i) => ({ ...i, steps: i.steps as Step[] }))}
        athletes={(athletes ?? []).map((a) => ({ id: a.id, name: a.full_name || a.email || "Athlete" }))}
      />
    </DashboardShell>
  );
}
