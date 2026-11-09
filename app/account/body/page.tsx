import type { Metadata } from "next";
import Link from "next/link";

import { FlagBadge } from "@/components/coach/Flags";
import BackLink from "@/components/layout/BackLink";
import DashboardShell from "@/components/layout/DashboardShell";
import { ReadinessAreas, ReadinessTrend } from "@/components/readiness/ReadinessDetail";
import type { ReadinessRow, WellnessPoint } from "@/lib/coach-data";
import { familyOf, oneFamily } from "@/lib/readiness/source";
import { createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Body & recovery · Diastole" };

const card = "mt-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-6";
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

/** Readiness in detail (recovery, sleep, stress, load) and the last 14 days, as your coach sees it. */
export default async function BodyPage() {
  const me = await requireUser();
  const supabase = await createClient();
  const [{ data: readiness }, { data: wellness }, { data: device }] = await Promise.all([
    supabase.from("readiness_scores").select("date, overall, recovery, sleep, stress, load, note, details").eq("athlete_id", me.id).order("date", { ascending: false }).limit(14),
    supabase.from("daily_wellness").select("date, source, hrv_ms, resting_hr, sleep_seconds, stress_avg").eq("athlete_id", me.id).gte("date", daysAgo(28)).order("date"),
    supabase.from("device_connections").select("source").eq("athlete_id", me.id).maybeSingle(),
  ]);
  const rows = (readiness ?? []) as ReadinessRow[];
  const trend = oneFamily(wellness ?? [], familyOf(device?.source ?? "garmin")) as WellnessPoint[];
  const today = rows[0];
  // A brand-new athlete gets one clear card instead of eight empty tiles.
  const hasData = rows.some((r) => r.overall !== "unknown") || trend.some((w) => w.hrv_ms ?? w.resting_hr ?? w.sleep_seconds ?? w.stress_avg);

  return (
    <DashboardShell role={me.role === "coach" ? "coach" : "athlete"}>
      <div className="mx-auto max-w-3xl">
        <BackLink href="/account" label="Me" />
        <h1 className="mt-3 text-4xl font-bold tracking-tight">Body &amp; recovery</h1>
        <p className="mt-2 text-white/55">How you&apos;re recovering, compared with your own last 28 days.</p>
        {hasData ? (
          <>
            <ReadinessAreas
              today={today}
              title={
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-medium">Readiness</h2>
                  <FlagBadge flag={today?.overall ?? "unknown"} />
                </div>
              }
            />
            <ReadinessTrend trend={trend} readiness={rows} />
          </>
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
        )}
        <p className="mt-6 text-xs text-white/45">Readiness compares you to your own last 28 days. Training guidance, not medical advice.</p>
      </div>
    </DashboardShell>
  );
}
