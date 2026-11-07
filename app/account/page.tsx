import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { FlagBadge } from "@/components/coach/Flags";
import LayoutCustomizer from "@/components/LayoutCustomizer";
import DashboardShell from "@/components/layout/DashboardShell";
import ProfileView from "@/components/profile/ProfileView";
import FormTrends from "@/components/readiness/FormTrends";
import { ReadinessAreas, ReadinessTrend } from "@/components/readiness/ReadinessDetail";
import { FORM, type FormMetric } from "@/lib/activity/form";
import { recentFormRuns } from "@/lib/activity/form-store";
import type { ReadinessRow, WellnessPoint } from "@/lib/coach-data";
import { resolveLayout, visibleSections } from "@/lib/layout-prefs";
import { familyOf, oneFamily } from "@/lib/readiness/source";
import { createAdminClient, createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Me · Diastole" };

const card = "mt-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-6";
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

type CoachNote = { id: string; issue_key: string; summary: string; evidence: string | null; drills: string[] | null; created_at: string };

/**
 * The Me tab: your avatar and numbers, plus the same readiness, recovery and running-form analysis
 * your coach sees (without the AI tools). Settings live one tap away.
 */
export default async function MePage() {
  const me = await requireUser();
  const supabase = await createClient();

  const [{ data: readiness }, { data: wellness }, { data: device }, formRuns, { data: notes }, { data: layoutRow }] = await Promise.all([
    supabase.from("readiness_scores").select("date, overall, recovery, sleep, stress, load, note, details").eq("athlete_id", me.id).order("date", { ascending: false }).limit(14),
    supabase.from("daily_wellness").select("date, source, hrv_ms, resting_hr, sleep_seconds, stress_avg").eq("athlete_id", me.id).gte("date", daysAgo(28)).order("date"),
    supabase.from("device_connections").select("source").eq("athlete_id", me.id).maybeSingle(),
    // Your own runs, so the service role is fine here (it also back-fills older runs' summaries).
    recentFormRuns(createAdminClient(), me.id, { limit: 30, timeZone: me.timezone }),
    supabase.rpc("my_form_insights"),
    supabase.from("profiles").select("layout").eq("id", me.id).maybeSingle(),
  ]);
  const rows = (readiness ?? []) as ReadinessRow[];
  const trend = oneFamily(wellness ?? [], familyOf(device?.source ?? "garmin")) as WellnessPoint[];
  const coachNotes = (notes ?? []) as CoachNote[];
  const today = rows[0];
  // A brand-new athlete gets one clear card instead of eight empty tiles.
  const hasData = rows.some((r) => r.overall !== "unknown") || trend.some((w) => w.hrv_ms ?? w.resting_hr ?? w.sleep_seconds ?? w.stress_avg);

  const layout = resolveLayout("me", layoutRow?.layout);

  const header = (
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm uppercase tracking-[0.25em] text-white/50">Me</p>
      <LayoutCustomizer page="me" initial={layout} />
    </div>
  );

  const sections: Record<string, ReactNode> = {
    readiness: hasData ? (
      <ReadinessAreas
        today={today}
        title={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-medium">Readiness</h2>
            <FlagBadge flag={today?.overall ?? "unknown"} />
          </div>
        }
      />
    ) : (
        <section className={card}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-medium">Readiness</h2>
            <FlagBadge flag="unknown" />
          </div>
          <p className="mt-2 text-sm leading-relaxed text-white/65">
            {device
              ? "Your recovery, sleep, stress and training-load breakdown fills in here as your watch syncs. Flags start after about a week of nights."
              : "Connect your watch to see your recovery, sleep, stress and training-load breakdown here, with 14-day trends."}
          </p>
          {!device && (
            <Link href="/connect" className="mt-4 inline-flex min-h-11 items-center rounded-2xl border border-emerald-300/25 bg-emerald-300/15 px-5 text-sm font-medium text-emerald-50 active:scale-95">
              Connect Garmin or Apple Watch →
            </Link>
          )}
        </section>
    ),
    trends: hasData ? <ReadinessTrend trend={trend} readiness={rows} /> : null,
    form: (
      <section id="form" className={`${card} scroll-mt-6`}>
        <h2 className="text-lg font-medium">Running form</h2>
        <p className="mb-4 mt-1 text-sm text-white/55">Your latest run for each metric, compared with your usual and common ranges. Tap a run in Training for the full breakdown.</p>
        <FormTrends runs={formRuns} />
      </section>
    ),
    notes: (
      <>
      {coachNotes.length > 0 && (
        <section className={card}>
          <h2 className="text-lg font-medium">Form notes</h2>
          <p className="mb-4 mt-1 text-sm text-white/55">The form summaries your coach sees about your recent runs.</p>
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
                  {n.evidence && <p className="mt-2 text-xs text-white/50">{n.evidence}</p>}
                  {n.drills && n.drills.length > 0 && (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-white/70">
                      {n.drills.map((d) => (
                        <li key={d}>{d}</li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      </>
    ),
    story: (
      <Link href="/me/story" className="lift mt-6 flex items-center justify-between gap-3 rounded-[28px] border border-white/10 bg-white/[0.05] p-4 pl-5">
        <span className="min-w-0">
          <span className="block font-medium">Season story</span>
          <span className="block truncate text-sm text-white/55">Your training in one shareable picture</span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-white/40" aria-hidden />
      </Link>
    ),
  };

  return (
    <DashboardShell role={me.role === "coach" ? "coach" : "athlete"}>
      <ProfileView id={me.id} me={me} header={header} sections={sections} order={visibleSections(layout)} />
      <p className="mx-auto mt-6 max-w-3xl text-xs text-white/45">Readiness compares you to your own last 28 days. Training guidance, not medical advice.</p>
    </DashboardShell>
  );
}
