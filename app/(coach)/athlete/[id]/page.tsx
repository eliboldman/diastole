import Link from "next/link";
import { notFound } from "next/navigation";

import { FLAG_STYLE, FlagBadge } from "@/components/coach/Flags";
import Sparkline, { fmt, lastNDays } from "@/components/coach/Sparkline";
import WorkoutList from "@/components/coach/WorkoutList";
import FormInsights, { type InsightView } from "@/components/coach/FormInsights";
import RecentCheckins from "@/components/coach/RecentCheckins";
import ZonesForm from "@/components/coach/ZonesForm";
import FuelModePicker from "@/components/coach/FuelModePicker";
import SafetyNotes from "@/components/coach/SafetyNotes";
import FuelLog from "@/components/fuel/FuelLog";
import FuelWeek from "@/components/fuel/FuelWeek";
import PlanningPanel from "@/components/coach/PlanningPanel";
import RaceForm from "@/components/race/RaceForm";
import RaceList from "@/components/race/RaceList";
import { getRaces } from "@/lib/fuel/race-data";
import { getFuelDays, getFuelMode, getMealDay, getMealWeek } from "@/lib/fuel/data";
import DashboardShell from "@/components/layout/DashboardShell";
import { paceOf, shortDistance } from "@/lib/activity/format";
import { FORM, type FormMetric } from "@/lib/activity/form";
import { daysBackIso, estimateMaxHr } from "@/lib/activity/zones";
import { getAthleteDetail } from "@/lib/coach-data";
import { createClient, requireCoach } from "@/lib/supabase/server";
import type { Flag } from "@/lib/readiness/engine";
import BackLink from "@/components/layout/BackLink";

const AREA_HELP: Record<string, string> = {
  recovery: "HRV and resting heart rate vs. the athlete's last 28 days",
  sleep: "Sleep duration (and Garmin sleep score) vs. baseline and minimums",
  stress: "Garmin all-day stress and Body Battery peak",
  load: "Last 7 days of training vs. the usual week (HR-weighted minutes)",
};

function detailLine(key: string, d: Record<string, unknown> | null | undefined) {
  if (!d) return null;
  const v = d as Record<string, Record<string, number> | number | undefined>;
  switch (key) {
    case "recovery": {
      const parts = [];
      if (v.hrv && typeof v.hrv === "object") parts.push(`HRV ${v.hrv.today} ms (baseline ${v.hrv.baseline}, ${v.hrv.pct > 0 ? "+" : ""}${v.hrv.pct}%)`);
      if (v.resting_hr && typeof v.resting_hr === "object")
        parts.push(`RHR ${v.resting_hr.today} bpm (baseline ${v.resting_hr.baseline})`);
      return parts.join(" · ") || null;
    }
    case "sleep":
      return v.sleep && typeof v.sleep === "object"
        ? `${v.sleep.hours} h${v.sleep.baseline_hours ? ` (usual ${v.sleep.baseline_hours} h)` : ""}${typeof v.sleep_score === "number" ? ` · score ${v.sleep_score}` : ""}`
        : null;
    case "stress": {
      const parts = [];
      if (v.stress && typeof v.stress === "object") parts.push(`stress ${v.stress.today} (usual ${v.stress.baseline})`);
      if (typeof v.body_battery_high === "number") parts.push(`Body Battery peak ${v.body_battery_high}`);
      return parts.join(" · ") || null;
    }
    case "load":
      return v.load && typeof v.load === "object" ? `7-day load ${v.load.acute} vs usual ${v.load.chronic_weekly} (×${v.load.ratio})` : null;
  }
  return null;
}

export default async function AthletePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getAthleteDetail(id);
  if (!data) notFound();

  const { profile, device, readiness, trend, activities, workouts, removed } = data;

  const me = await requireCoach();
  const supabase = await createClient();
  const [{ data: zones }, { data: recentMax }, { data: insightRows }, fuelMode] = await Promise.all([
    supabase.from("athlete_zones").select("max_hr, threshold_speed_mps, ftp_w, threshold_hr").eq("athlete_id", id).maybeSingle(),
    supabase
      .from("activities")
      .select("max_hr")
      .eq("athlete_id", id)
      .gte("start_time", daysBackIso(180))
      .not("max_hr", "is", null)
      .limit(500),
    supabase
      .from("form_insights")
      .select("id, issue_key, summary, evidence, drills, picks, status, created_at")
      .eq("athlete_id", id)
      .gte("created_at", daysBackIso(60))
      .order("created_at", { ascending: false })
      .limit(20),
    getFuelMode(id),
  ]);
  const athleteTz = profile.timezone || "America/Chicago";
  const athleteToday = new Date().toLocaleDateString("en-CA", { timeZone: athleteTz });
  const [[fuelToday], mealWeek] = await Promise.all([getFuelDays(id, athleteToday, 1), getMealWeek(id, athleteToday)]);
  const [mealDay, races] = await Promise.all([getMealDay(id, athleteToday, athleteTz, fuelToday.level), getRaces(id, { from: athleteToday, limit: 10 })]);
  const insights: InsightView[] = (insightRows ?? []).map((r) => {
    const [metric, kind] = r.issue_key.split(":");
    return {
      id: r.id,
      issue: `${FORM[metric as FormMetric]?.label ?? metric} · ${kind === "fatigue" ? "drifts late in runs" : "across recent runs"}`,
      summary: r.summary,
      evidence: r.evidence,
      drills: r.drills ?? [],
      picks: (r.picks ?? []) as InsightView["picks"],
      status: r.status as InsightView["status"],
      created_at: r.created_at,
    };
  });
  const today = readiness[0];
  const overall: Flag = today?.overall ?? "unknown";

  return (
    <DashboardShell tone={overall === "red" ? "red" : overall === "yellow" ? "yellow" : "green"}>
      <BackLink href="/athletes" label="Athletes" />

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">{profile.full_name || profile.email}</h1>
          <p className="mt-2 text-sm text-white/55">
            {device ? `${device.source === "garmin" ? "Garmin" : "Apple Watch"} connected` : "No device connected"}
            {profile.email ? ` · ${profile.email}` : ""}
          </p>
          <span className="mt-1 flex flex-wrap gap-x-4">
            <Link href={`/profile/${profile.id}`} className="inline-flex min-h-11 items-center text-sm text-emerald-200/90 hover:underline">
              Avatar and metrics →
            </Link>
            <Link href={`/athlete/${profile.id}/import`} className="inline-flex min-h-11 items-center text-sm text-emerald-200/90 hover:underline">
              Import Garmin history →
            </Link>
          </span>
        </div>
        <FlagBadge flag={overall} large />
      </div>

      <section className="mt-8 rounded-[28px] border border-white/10 bg-white/[0.05] p-6 backdrop-blur-xl">
        <p className="text-lg leading-relaxed text-white/80">{today?.note ?? "No readiness yet — waiting for data."}</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {(["recovery", "sleep", "stress", "load"] as const).map((key) => {
            const flag: Flag = today?.[key] ?? "unknown";
            return (
              <div key={key} className="rounded-2xl border border-white/[0.09] bg-white/[0.05] p-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium capitalize">{key}</p>
                  <span className={`inline-flex items-center gap-2 text-sm ${FLAG_STYLE[flag].text}`}>
                    <span className={`h-2 w-2 rounded-full ${FLAG_STYLE[flag].dot}`} aria-hidden />
                    {FLAG_STYLE[flag].label}
                  </span>
                </div>
                <p className="mt-1 text-sm text-white/60">{detailLine(key, today?.details) ?? "—"}</p>
                <p className="mt-2 text-xs text-white/45">{AREA_HELP[key]}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-6">
        <h2 className="text-lg font-medium">Last 14 days</h2>
        <div className="mt-4 grid grid-cols-2 gap-6 sm:grid-cols-4">
          <Sparkline label="HRV" points={lastNDays(trend, "hrv_ms")} format={fmt.hrv} width={150} height={40} />
          <Sparkline label="Resting HR" points={lastNDays(trend, "resting_hr")} format={fmt.rhr} width={150} height={40} />
          <Sparkline label="Sleep" points={lastNDays(trend, "sleep_seconds")} format={fmt.sleep} width={150} height={40} />
          <Sparkline label="Stress" points={lastNDays(trend, "stress_avg")} format={fmt.stress} width={150} height={40} />
        </div>
        {readiness.length > 1 && (
          <div className="mt-6 flex flex-wrap gap-1.5" aria-label="Daily overall flags, oldest to newest">
            {[...readiness].reverse().map((r) => (
              <span key={r.date} title={`${r.date}: ${FLAG_STYLE[r.overall].label}`} className={`h-3 w-3 rounded-full ${FLAG_STYLE[r.overall].dot}`} />
            ))}
          </div>
        )}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-[28px] border border-white/10 bg-white/[0.055] p-6">
          <h2 className="text-lg font-medium">Recent training</h2>
          {activities.length === 0 ? (
            <p className="mt-3 text-sm text-white/55">No activities yet.</p>
          ) : (
            <table className="mt-3 w-full text-sm">
              <tbody>
                {activities.map((a) => (
                  <tr key={a.id} className="relative border-t border-white/[0.09] transition hover:bg-white/[0.04]">
                    <td className="py-2 pr-3 text-white/50">
                      {new Date(a.start_time).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: profile.timezone })}
                    </td>
                    <td className="py-2 pr-3 capitalize">
                      {/* The link covers the whole row */}
                      <Link href={`/activity/${a.id}`} className="after:absolute after:inset-0 hover:underline">
                        {a.sport?.replaceAll("_", " ") ?? "Activity"}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-right text-white/70">{a.duration_s ? `${Math.round(a.duration_s / 60)} min` : ""}</td>
                    <td className="py-2 pr-3 text-right text-white/70">
                      {shortDistance(a.distance_m, me.units, a.sport) ?? ""}
                    </td>
                    <td className="py-2 text-right text-white/50">{a.avg_hr ? `${Math.round(a.avg_hr)} bpm` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="rounded-[28px] border border-white/10 bg-white/[0.055] p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Planned workouts</h2>
            <Link
              href={`/athlete/${profile.id}/workouts/new`}
              className="flex min-h-11 items-center rounded-xl border border-emerald-300/25 bg-emerald-300/10 px-4 text-sm text-emerald-100 transition active:scale-95 hover:bg-emerald-300/20"
            >
              + New workout
            </Link>
          </div>
          <WorkoutList athleteId={profile.id} workouts={workouts} removed={removed} device={device?.source ?? null} />
        </section>

        <section id="form" className="scroll-mt-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-6 lg:col-span-2">
          <h2 className="text-lg font-medium">Form insights</h2>
          <p className="mb-4 mt-1 text-sm text-white/55">Only you see these. Suggested workouts are added as drafts for you to approve and send.</p>
          <FormInsights athleteId={profile.id} insights={insights} tomorrow={daysBackIso(-1).slice(0, 10)} />
        </section>

        <section id="checkins" className="scroll-mt-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-6 lg:col-span-2">
          <h2 className="text-lg font-medium">Recent check-ins</h2>
          <p className="mb-2 mt-1 text-sm text-white/55">How workouts felt, how hard, and anything that hurt. You get a notification when pain is moderate or severe.</p>
          <RecentCheckins athleteId={profile.id} timeZone={me.timezone} />
        </section>

        <section id="zones" className="scroll-mt-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-6 lg:col-span-2">
          <h2 className="text-lg font-medium">Training zones</h2>
          <p className="mb-4 mt-1 text-sm text-white/55">Used for time in zones and to judge zone targets on the workout view.</p>
          <ZonesForm
            athleteId={profile.id}
            maxHr={zones?.max_hr ?? null}
            thresholdPace={zones?.threshold_speed_mps ? paceOf(Number(zones.threshold_speed_mps), me.units) : null}
            units={me.units}
            ftp={zones?.ftp_w ?? null}
            thresholdHr={zones?.threshold_hr ?? null}
            estimatedMaxHr={estimateMaxHr((recentMax ?? []).map((r) => r.max_hr))}
          />
        </section>

        <div id="planning" className="scroll-mt-6 lg:col-span-2">
          <PlanningPanel athleteId={profile.id} coachId={me.id} firstName={(profile.full_name || "This athlete").split(" ")[0]} full />
        </div>

        <section id="races" className="scroll-mt-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-6 lg:col-span-2">
          <h2 className="text-lg font-medium">Races</h2>
          <p className="mb-4 mt-1 text-sm text-white/55">Each race gets a fueling plan, and race-week mode turns on for {(profile.full_name || "this athlete").split(" ")[0]} 10 days out.</p>
          <RaceList races={races} today={athleteToday} units={me.units} empty="No upcoming races." />
          <details className="mt-4">
            <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-emerald-200">Add a race</summary>
            <div className="mt-3">
              <RaceForm athleteId={profile.id} units={me.units} />
            </div>
          </details>
        </section>

        <SafetyNotes athleteId={profile.id} />
        <section id="fuel" className="scroll-mt-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-6 lg:col-span-2">
          <h2 className="text-lg font-medium">Fueling</h2>
          <p className="mb-4 mt-1 text-sm text-white/55">What {(profile.full_name || "this athlete").split(" ")[0]} sees on Fuel and with each workout. Guidance follows their planned training; you can change this anytime.</p>
          <FuelModePicker athleteId={profile.id} firstName={(profile.full_name || "This athlete").split(" ")[0]} mode={fuelMode} />
          {/* Coach always sees numbers, even when the athlete's mode hides them. */}
          <FuelLog day={mealDay} mode={fuelMode === "workout" ? "full" : fuelMode} timeZone={athleteTz} units="mi" viewer="coach" firstName={(profile.full_name || "This athlete").split(" ")[0]} />
          <FuelWeek week={mealWeek} />
        </section>
      </div>
    </DashboardShell>
  );
}
