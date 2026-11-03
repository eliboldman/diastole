import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import HistoryImport from "@/components/HistoryImport";
import LastImport from "@/components/LastImport";
import DashboardShell from "@/components/layout/DashboardShell";
import { createClient, requireCoach } from "@/lib/supabase/server";

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
      <Link href={`/athlete/${id}`} className="inline-flex min-h-11 items-center text-sm text-white/60 hover:text-white">
        ← {name}
      </Link>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Import Garmin history</h1>
      <p className="mt-2 max-w-xl text-white/60">
        Upload {name.split(" ")[0]}&apos;s Garmin account export on their behalf. Only health and activity summaries are read.
      </p>
      <div className="mt-3">
        <LastImport row={last} />
      </div>
      <div className="mt-8 max-w-2xl">
        <HistoryImport athleteId={id} forName={name.split(" ")[0]} />
      </div>
    </DashboardShell>
  );
}
