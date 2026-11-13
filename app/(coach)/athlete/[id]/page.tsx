import OpenDemoButton from "@/components/demo/OpenDemoButton";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FlagBadge } from "@/components/coach/Flags";
import { ReadinessAreas, ReadinessTrend } from "@/components/readiness/ReadinessDetail";
import WorkoutList from "@/components/coach/WorkoutList";
import FormInsights, { type InsightView } from "@/components/coach/FormInsights";
import RecentCheckins from "@/components/coach/RecentCheckins";
import ThresholdTests from "@/components/coach/ThresholdTests";
import BossCoachPanel from "@/components/bosses/BossCoachPanel";
import ZonesForm from "@/components/coach/ZonesForm";
import FuelModePicker from "@/components/coach/FuelModePicker";
import SafetyNotes from "@/components/coach/SafetyNotes";
import FuelLog from "@/components/fuel/FuelLog";
import FuelWeek from "@/components/fuel/FuelWeek";
import PlanningPanel from "@/components/coach/PlanningPanel";
import RaceForm from "@/components/race/RaceForm";
import RaceList from "@/components/race/RaceList";
import PredictionsCard from "@/components/predict/PredictionsCard";
import SwimTechniqueCard from "@/components/swim/SwimTechniqueCard";
import { listSwimVideos } from "@/lib/swim/video";
import { getSwimView } from "@/lib/swim/data";
import { getPredictions } from "@/lib/predict/data";
import { getRaces } from "@/lib/fuel/race-data";
import { getFuelDays, getFuelMode, getMealDay, getMealWeek } from "@/lib/fuel/data";
import DashboardShell from "@/components/layout/DashboardShell";
import { paceOf, shortDistance } from "@/lib/activity/format";
import { FORM, type FormMetric } from "@/lib/activity/form";
import { daysBackIso, estimateMaxHr } from "@/lib/activity/zones";
import { getAthleteDetail } from "@/lib/coach-data";
import { createClient, requireStaff } from "@/lib/supabase/server";
import type { Flag } from "@/lib/readiness/engine";
import BackLink from "@/components/layout/BackLink";
import WeekReview from "@/components/training/WeekReview";
import FitnessSection from "@/components/training/FitnessSection";
import ZoneSuggestions from "@/components/coach/ZoneSuggestions";
import SaveAsPlan from "@/components/plans/SaveAsPlan";
import BedtimeTrend from "@/components/sleep/BedtimeTrend";
import StrengthCoachCard from "@/components/strength/StrengthCoachCard";
import { getTestStatus } from "@/lib/training/tests-data";
import { getZoneSuggestions } from "@/lib/training/zone-suggest-data";
import { getLoad } from "@/lib/training/load-data";
import { getWeek, weekStartFrom } from "@/lib/training/week-data";
import ClosetEditor from "@/components/ClosetEditor";
import ChangeOfPlans from "@/components/coach/ChangeOfPlans";
import { cleanCloset, closetForPrompt } from "@/lib/closet";
import { getBikeMileage, getShoeMileage } from "@/lib/shoes";

export default async function AthletePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ week?: string }> }) {
  const { id } = await params;
  const weekParam = (await searchParams).week;
  const data = await getAthleteDetail(id);
  if (!data) notFound();

  const { profile, device, readiness, trend, activities, workouts, removed } = data;

  const me = await requireStaff();
  const dietitian = me.role === "dietitian";
  const supabase = await createClient();
  const [{ data: zones }, { data: recentMax }, { data: insightRows }, fuelMode, { data: gearRow }] = await Promise.all([
    supabase.from("athlete_zones").select("max_hr, threshold_speed_mps, ftp_w, threshold_hr, css_sec_per_100m").eq("athlete_id", id).maybeSingle(),
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
    supabase.from("athlete_gear").select("gear").eq("athlete_id", id).maybeSingle(),
  ]);
  const athleteTz = profile.timezone || "America/Chicago";
  const athleteToday = new Date().toLocaleDateString("en-CA", { timeZone: athleteTz });
  const closet = cleanCloset(gearRow?.gear);
  const [shoeMiles, bikeMiles] = await Promise.all([getShoeMileage(supabase, id, closet, athleteTz), getBikeMileage(supabase, id, closet, athleteTz)]);
  const [[fuelToday], mealWeek] = await Promise.all([getFuelDays(id, athleteToday, 1), getMealWeek(id, athleteToday)]);
  const [mealDay, races, week, load, zoneSugg] = await Promise.all([
    getMealDay(id, athleteToday, athleteTz, fuelToday.level),
    getRaces(id, { from: athleteToday, limit: 10 }),
    getWeek(supabase, id, athleteTz, weekStartFrom(weekParam, athleteToday)),
    getLoad(supabase, id, athleteTz),
    getZoneSuggestions(supabase, [id]),
  ]);
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
    <DashboardShell tone={overall === "red" ? "red" : overall === "yellow" ? "yellow" : "green"} role={dietitian ? "dietitian" : "coach"}>
      <BackLink href={dietitian ? `/nutrition/${id}` : "/athletes"} label={dietitian ? "Nutrition" : "Athletes"} />

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
            <Link href={`/nutrition/${profile.id}`} className="inline-flex min-h-11 items-center text-sm text-emerald-200/90 hover:underline">
              Nutrition review →
            </Link>
            <Link href={`/athlete/${profile.id}/import`} className="inline-flex min-h-11 items-center text-sm text-emerald-200/90 hover:underline">
              Import Garmin history →
            </Link>
          </span>
        </div>
        <FlagBadge flag={overall} large />
      </div>
      {!dietitian && (await isDemo(profile.id)) && <OpenDemoButton athleteId={profile.id} name={profile.full_name || "Demo athlete"} />}

      <ChangeOfPlans athleteId={profile.id} today={athleteToday} placeholder={`Change of plans for ${(profile.full_name ?? "").split(" ")[0] || "them"}? e.g. move Tuesday's intervals to Thursday`} />

      <ReadinessAreas today={today} />
      <ReadinessTrend trend={trend} readiness={readiness} />

      <div className="mt-6">
        <WeekReview week={week} units={me.units === "km" ? "km" : "mi"} basePath={`/athlete/${profile.id}`} workoutHref={(w) => `/athlete/${profile.id}/workouts/${w}`} />
      </div>
      <div className="mt-6">
        <FitnessSection view={load} />
      </div>
      <div className="mt-6 empty:hidden">
        <StrengthCoachCard athleteId={profile.id} units={me.units === "km" ? "km" : "mi"} />
      </div>
      <div className="mt-6">
        <BedtimeTrend athleteId={profile.id} timeZone={athleteTz} name={(profile.full_name ?? "").split(" ")[0] || "They"} />
      </div>

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

        <section id="workouts" className="scroll-mt-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-6">
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
          <SaveAsPlan athleteId={profile.id} today={athleteToday} />
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

        <BossCoachPanel athleteId={profile.id} today={athleteToday} firstName={(profile.full_name || "This athlete").split(" ")[0]} />

        <section id="zones" className="scroll-mt-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-6 lg:col-span-2">
          <h2 className="text-lg font-medium">Training zones</h2>
          <p className="mb-4 mt-1 text-sm text-white/55">Used for time in zones and to judge zone targets on the workout view.</p>
          {zoneSugg.get(id) && (
            <div className="mb-4 [&>section]:mt-0">
              <ZoneSuggestions units={me.units === "km" ? "km" : "mi"} rows={[{ athleteId: id, suggestions: zoneSugg.get(id)! }]} title={false} />
            </div>
          )}
          <ZonesForm
            athleteId={profile.id}
            maxHr={zones?.max_hr ?? null}
            thresholdPace={zones?.threshold_speed_mps ? paceOf(Number(zones.threshold_speed_mps), me.units) : null}
            units={me.units}
            ftp={zones?.ftp_w ?? null}
            thresholdHr={zones?.threshold_hr ?? null}
            css={zones?.css_sec_per_100m ? Number(zones.css_sec_per_100m) : null}
            estimatedMaxHr={estimateMaxHr((recentMax ?? []).map((r) => r.max_hr))}
          />
          <ThresholdTests athleteId={profile.id} status={await getTestStatus(supabase, profile.id, athleteToday)} today={athleteToday} />
        </section>

        <section id="closet" className="scroll-mt-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-6 lg:col-span-2">
          <h2 className="text-lg font-medium">Closet</h2>
          {(() => {
            const lines = closetForPrompt(closet);
            return lines ? (
              <ul className="mt-3 space-y-1 text-sm text-white/70">
                {lines.filter((l) => !l.startsWith("Does not have")).map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-white/55">{(profile.full_name || "This athlete").split(" ")[0]} hasn&apos;t filled in their closet yet (Me › Gear &amp; closet).</p>
            );
          })()}
          <details className="mt-3">
            <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-emerald-200">Edit closet</summary>
            <div className="mt-3">
              <ClosetEditor athleteId={profile.id} initial={closet} mileage={shoeMiles} bikeMileage={bikeMiles} units={me.units} today={athleteToday} />
            </div>
          </details>
          <p className="mt-3 text-xs text-white/45">Suggested workouts use this, and each workout shows {(profile.full_name || "the athlete").split(" ")[0]} what to pack.</p>
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

        {await Promise.all([getSwimView(supabase, profile.id, me.units !== "km"), listSwimVideos(profile.id)]).then(([v, videos]) => (v ? <div className="lg:col-span-2"><SwimTechniqueCard view={v} coach athleteId={profile.id} videos={videos} /></div> : null))}
        <div className="lg:col-span-2">
          <PredictionsCard view={await getPredictions(supabase, profile.id, athleteTz)} coach athleteId={profile.id} firstName={(profile.full_name || "The athlete").split(" ")[0]} />
        </div>

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

async function isDemo(id: string) {
  const { data } = await (await createClient()).from("profiles").select("is_demo").eq("id", id).maybeSingle();
  return !!data?.is_demo;
}
