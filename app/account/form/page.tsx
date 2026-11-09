import type { Metadata } from "next";

import BackLink from "@/components/layout/BackLink";
import DashboardShell from "@/components/layout/DashboardShell";
import FormTrends from "@/components/readiness/FormTrends";
import { FORM, type FormMetric } from "@/lib/activity/form";
import { recentFormRuns } from "@/lib/activity/form-store";
import { createAdminClient, createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Running form · Diastole" };

const card = "mt-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-6";

type CoachNote = { id: string; issue_key: string; summary: string; evidence: string | null; drills: string[] | null; created_at: string };

/** What your coach sees about your running form: their notes first, then every metric. */
export default async function FormPage() {
  const me = await requireUser();
  const supabase = await createClient();
  const [formRuns, { data: notes }] = await Promise.all([
    // Your own runs, so the service role is fine here (it also back-fills older runs' summaries).
    recentFormRuns(createAdminClient(), me.id, { limit: 30, timeZone: me.timezone }),
    supabase.rpc("my_form_insights"),
  ]);
  const coachNotes = (notes ?? []) as CoachNote[];

  return (
    <DashboardShell role={me.role === "coach" ? "coach" : "athlete"}>
      <div className="mx-auto max-w-3xl">
        <BackLink href="/account" label="Me" />
        <h1 className="mt-3 text-4xl font-bold tracking-tight">Running form</h1>
        <p className="mt-2 text-white/55">Your latest run for each metric, compared with your usual and common ranges. Tap a run in Training for the full breakdown.</p>

        {coachNotes.length > 0 && (
          <section className={card}>
            <h2 className="text-lg font-medium">Notes on your form</h2>
            <p className="mb-4 mt-1 text-sm text-white/55">The summaries your coach sees about your recent runs.</p>
            <ul className="space-y-3">
              {coachNotes.map((n) => {
                const [metric, kind] = n.issue_key.split(":");
                return (
                  <li key={n.id} className="rounded-2xl border border-white/[0.09] bg-white/[0.04] p-4">
                    <p className="text-xs uppercase tracking-[0.15em] text-white/50">
                      {FORM[metric as FormMetric]?.label ?? metric} · {kind === "fatigue" ? "drifts late in runs" : "across recent runs"} ·{" "}
                      {new Date(n.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: me.timezone })}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-white/80">{n.summary}</p>
                    {n.drills && n.drills.length > 0 && (
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-white/70">
                        {n.drills.map((d) => (
                          <li key={d}>{d}</li>
                        ))}
                      </ul>
                    )}
                    {n.evidence && (
                      <details className="mt-2 text-xs text-white/50">
                        <summary className="cursor-pointer select-none">The numbers behind this</summary>
                        <p className="mt-1">{n.evidence}</p>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className={card}>
          <h2 className="mb-4 text-lg font-medium">Every metric</h2>
          <FormTrends runs={formRuns} />
        </section>
      </div>
    </DashboardShell>
  );
}
