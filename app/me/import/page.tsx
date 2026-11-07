import type { Metadata } from "next";

import AthleteShell from "@/components/AthleteShell";
import HistoryImport from "@/components/HistoryImport";
import WorkoutFilesImport from "@/components/WorkoutFilesImport";
import LastImport from "@/components/LastImport";
import { createClient, requireUser } from "@/lib/supabase/server";
import BackLink from "@/components/layout/BackLink";

export const metadata: Metadata = { title: "Import Garmin history · Diastole" };
export const maxDuration = 120; // recomputing baselines at the end takes a few seconds

export default async function MyImportPage() {
  const me = await requireUser();
  const supabase = await createClient();
  const { data: last } = await supabase
    .from("history_imports")
    .select("status, range, counts, created_at, error")
    .eq("athlete_id", me.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <AthleteShell isCoach={me.role === "coach"}>
      <BackLink href="/account/settings" label="Settings" />
      <h1 className="mt-2 text-3xl font-medium tracking-tight">Import your Garmin history</h1>
      <p className="mt-2 max-w-xl text-white/60">
        Garmin only shares new data with Diastole. Bring in your past months so your baseline is ready today instead of in a week.
      </p>
      <div className="mt-3">
        <LastImport row={last} />
      </div>
      <div className="mt-8 max-w-2xl">
        <HistoryImport athleteId={me.id} />
      </div>
      <section className="mt-10 max-w-2xl">
        <h2 className="text-xl font-medium tracking-tight">Add workout details</h2>
        <p className="mb-4 mt-1 text-sm text-white/55">Optional, after the import above. Uses the same ZIP.</p>
        <WorkoutFilesImport athleteId={me.id} />
      </section>
    </AthleteShell>
  );
}
