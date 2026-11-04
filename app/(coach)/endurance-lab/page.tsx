import { Activity, BookOpen, Bot, ChevronRight, Gauge, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import BuildPicker from "@/components/coach/BuildPicker";
import CheckFormAll from "@/components/coach/CheckFormAll";
import ConnectImport from "@/components/coach/ConnectImport";
import FormInsights, { type InsightView } from "@/components/coach/FormInsights";
import DashboardShell from "@/components/layout/DashboardShell";
import { FORM, type FormMetric } from "@/lib/activity/form";
import { daysBackIso } from "@/lib/activity/zones";
import { createClient, requireCoach } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "The Endurance Lab · Diastole" };
export const maxDuration = 120; // "Check everyone's form" can call Claude

function Card({ title, icon, children, aside }: { title: string; icon: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-white/[0.055] p-5 backdrop-blur-2xl sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-medium">
          {icon}
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

const linkRow = "lift flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-sm";

export default async function EnduranceLabPage() {
  const coach = await requireCoach();
  const supabase = await createClient();

  const [{ data: athletes }, { count: libraryCount }, { data: insightRows }, { count: pendingSuggestions }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email").eq("coach_id", coach.id).eq("is_test", false).order("full_name"),
    supabase.from("workout_library").select("id", { count: "exact", head: true }).eq("coach_id", coach.id),
    supabase
      .from("form_insights")
      .select("id, athlete_id, issue_key, summary, evidence, drills, picks, status, created_at")
      .eq("coach_id", coach.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("ai_suggestions")
      .select("id", { count: "exact", head: true })
      .eq("coach_id", coach.id)
      .eq("status", "pending")
      .gte("date", daysBackIso(2).slice(0, 10)),
  ]);

  const roster = (athletes ?? []).map((a) => ({ id: a.id, name: a.id === coach.id ? `${a.full_name || "You"} (you)` : a.full_name || a.email || "Athlete" }));
  const nameOf = (id: string) => roster.find((a) => a.id === id)?.name ?? "Athlete";

  // Group open form insights by athlete.
  const byAthlete = new Map<string, InsightView[]>();
  for (const r of insightRows ?? []) {
    const [metric, kind] = r.issue_key.split(":");
    const view: InsightView = {
      id: r.id,
      issue: `${FORM[metric as FormMetric]?.label ?? metric} · ${kind === "fatigue" ? "drifts late in runs" : "across recent runs"}`,
      summary: r.summary,
      evidence: r.evidence,
      drills: r.drills ?? [],
      picks: (r.picks ?? []) as InsightView["picks"],
      status: "pending",
      created_at: r.created_at,
    };
    byAthlete.set(r.athlete_id, [...(byAthlete.get(r.athlete_id) ?? []), view]);
  }
  const tomorrow = daysBackIso(-1).slice(0, 10);

  return (
    <DashboardShell>
      <p className="text-sm uppercase tracking-[0.25em] text-white/50">Coaching tools</p>
      <h1 className="mt-3 text-4xl font-bold tracking-tight">The Endurance Lab</h1>
      <p className="mt-2 max-w-prose text-sm text-white/55">Build workouts, reuse your library, and review what the AI has noticed. Nothing reaches an athlete until you approve and send it.</p>

      <div className="mt-8 grid gap-6">
        <Card title="Build a workout" icon={<Activity size={18} className="text-emerald-200" aria-hidden />}>
          <BuildPicker athletes={roster} />
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Workout library" icon={<BookOpen size={18} className="text-emerald-200" aria-hidden />}>
            <p className="text-sm text-white/55">
              {libraryCount ? `${libraryCount} saved workout${libraryCount === 1 ? "" : "s"}.` : "Every workout you build is saved here."} Assign one to any athlete in a tap.
            </p>
            <Link href="/library" className={`${linkRow} mt-4`}>
              Open the library <ChevronRight size={16} className="text-white/45" aria-hidden />
            </Link>
            <ConnectImport />
          </Card>

          <Card title="Readiness suggestions" icon={<Gauge size={18} className="text-emerald-200" aria-hidden />}>
            <p className="text-sm text-white/55">
              {pendingSuggestions
                ? `${pendingSuggestions} suggestion${pendingSuggestions === 1 ? "" : "s"} waiting for you from this morning's review.`
                : "No suggestions waiting. Each morning, athletes flagged yellow or red get a proposal for you to approve."}
            </p>
            <Link href="/dashboard" className={`${linkRow} mt-4`}>
              {pendingSuggestions ? "Review on Today" : "Go to Today"} <ChevronRight size={16} className="text-white/45" aria-hidden />
            </Link>
          </Card>
        </div>

        <Card title="Form insights" icon={<Sparkles size={18} className="text-emerald-200" aria-hidden />} aside={<CheckFormAll />}>
          {byAthlete.size === 0 ? (
            <p className="text-sm text-white/55">No open form insights. They appear when a running-form issue shows up in 3 of an athlete&apos;s last 5 runs.</p>
          ) : (
            <div className="grid gap-6">
              {[...byAthlete.entries()].map(([athleteId, list]) => (
                <div key={athleteId}>
                  <Link href={`/athlete/${athleteId}#form`} className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm font-medium hover:underline">
                    {nameOf(athleteId)} <ChevronRight size={15} className="text-white/45" aria-hidden />
                  </Link>
                  <FormInsights athleteId={athleteId} insights={list} tomorrow={tomorrow} compact />
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="More tools" icon={<Bot size={18} className="text-emerald-200" aria-hidden />}>
          <div className="grid gap-2 sm:grid-cols-3">
            <Link href="/athletes" className={linkRow}>
              Training zones <ChevronRight size={16} className="text-white/45" aria-hidden />
            </Link>
            <Link href="/lab" className={linkRow}>
              AI test mode <ChevronRight size={16} className="text-white/45" aria-hidden />
            </Link>
            <Link href="/garmin-log" className={linkRow}>
              Garmin deliveries <ChevronRight size={16} className="text-white/45" aria-hidden />
            </Link>
          </div>
        </Card>
      </div>
    </DashboardShell>
  );
}
