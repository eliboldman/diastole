import type { Metadata } from "next";
import { notFound } from "next/navigation";

import HistoryImport from "@/components/HistoryImport";
import WorkoutFilesImport from "@/components/WorkoutFilesImport";
import LastImport from "@/components/LastImport";
import DashboardShell from "@/components/layout/DashboardShell";
import { createClient, requireCoach } from "@/lib/supabase/server";
import BackLink from "@/components/layout/BackLink";

export const metadata: Metadata = { title: "Import Garmin history · Diastole" };
export const maxDuration = 120;

export default async function CoachImportPage({ params }: { params: Promise<{ id: string }> }) {
  const coach = await requireCoach();
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: athlete }, { data: last }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, coach_id").eq("id", id).maybeSingle(),
    supabase
      .from("history_imports")
      .select("status, range, counts, created_at, error")
      .eq("athlete_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!athlete || (athlete.coach_id !== coach.id && athlete.id !== coach.id)) notFound();
  const name = athlete.full_name || athlete.email || "Athlete";

  return (
    <DashboardShell>
      <BackLink href={`/athlete/${id}`} label={name} />
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Import Garmin history</h1>
      <p className="mt-2 max-w-xl text-white/60">
        Upload {name.split(" ")[0]}&apos;s Garmin account export on their behalf. The import reads only health and activity summaries; the optional second step adds their workout files.
      </p>
      <div className="mt-3">
        <LastImport row={last} />
      </div>
      <div className="mt-8 max-w-2xl">
        <HistoryImport athleteId={id} forName={name.split(" ")[0]} />
      </div>
      <section className="mt-10 max-w-2xl">
        <h2 className="text-xl font-medium tracking-tight">Add workout details</h2>
        <p className="mb-4 mt-1 text-sm text-white/55">Optional, after the import above. Uses the same ZIP.</p>
        <WorkoutFilesImport athleteId={id} />
      </section>
    </DashboardShell>
  );
}
