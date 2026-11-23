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
import AthleteTabs from "@/components/coach/AthleteTabs";
import { listSwimVideos } from "@/lib/swim/video";
import { getSwimView } from "@/lib/swim/data";
import { getPredictions } from "@/lib/predict/data";
import { getRaces } from "@/lib/fuel/race-data";
import { getFuelDays, getFuelMode, getMealDay, getMealWeek } from "@/lib/fuel/data";
import DashboardShell from "@/components/layout/DashboardShell";
import { paceOf, shortDistance } from "@/lib/activity/format";
import { FORM, type FormMetric } from "@/lib/activity/form";
import { daysBackIso, estimateMaxHr } from "@/lib/activity/zones";
import { parseAthleteView } from "@/lib/athlete-views";
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
import MobilityCoachCard from "@/components/mobility/CoachCard";
import { getTestStatus } from "@/lib/training/tests-data";
import { getZoneSuggestions } from "@/lib/training/zone-suggest-data";
import { getLoad } from "@/lib/training/load-data";
import { getWeek, weekStartFrom } from "@/lib/training/week-data";
import ClosetEditor from "@/components/ClosetEditor";
import ChangeOfPlans from "@/components/coach/ChangeOfPlans";
import { cleanCloset, closetForPrompt } from "@/lib/closet";
import { getBikeMileage, getShoeMileage } from "@/lib/shoes";

type Detail = NonNullable<Awaited<ReturnType<typeof getAthleteDetail>>>;
type Staff = Awaited<ReturnType<typeof requireStaff>>;
type Supabase = Awaited<ReturnType<typeof createClient>>;

/** What every view needs: who, where they are, and who's looking. */
type Ctx = {
  id: string;
  data: Detail;
  me: Staff;
  supabase: Supabase;
  tz: string;
  today: string;
  firstName: string;
  /** First name for the middle of a sentence ("this athlete" when unknown). */
  nameMid: string;
  units: "km" | "mi";
};

const card = "scroll-mt-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-6";

export default async function AthletePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ week?: string; view?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const view = parseAthleteView(sp.view);
  const data = await getAthleteDetail(id);
  if (!data) notFound();

  const { profile, device, readiness } = data;
  const me = await requireStaff();
  const dietitian = me.role === "dietitian";
  const supabase = await createClient();
  const tz = profile.timezone || "America/Chicago";
  const ctx: Ctx = {
    id,
    data,
    me,
    supabase,
    tz,
    today: new Date().toLocaleDateString("en-CA", { timeZone: tz }),
    firstName: (profile.full_name ?? "").split(" ")[0] || "This athlete",
    nameMid: (profile.full_name ?? "").split(" ")[0] || "this athlete",
    units: me.units === "km" ? "km" : "mi",
  };
  const overall: Flag = readiness[0]?.overall ?? "unknown";
  const chip = "inline-flex min-h-10 items-center rounded-full border border-white/10 px-4 text-sm text-white/70 transition hover:border-emerald-300/30 hover:text-white";

  return (
    <DashboardShell tone={overall === "red" ? "red" : overall === "yellow" ? "yellow" : "green"} role={dietitian ? "dietitian" : "coach"}>
      <BackLink href={dietitian ? `/nutrition/${id}` : "/athletes"} label={dietitian ? "Nutrition" : "Athletes"} />

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-4xl font-bold tracking-tight">{profile.full_name || profile.email}</h1>
          <p className="mt-2 text-sm text-white/55">
            {device ? `${device.source === "garmin" ? "Garmin" : "Apple Watch"} connected` : "No device connected"}
            {profile.email ? ` · ${profile.email}` : ""}
          </p>
        </div>
        <FlagBadge flag={overall} large />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={`/profile/${id}`} className={chip}>Avatar &amp; metrics</Link>
        <Link href={`/nutrition/${id}`} className={chip}>Nutrition review</Link>
        <Link href={`/athlete/${id}/import`} className={chip}>Import Garmin history</Link>
      </div>
      {!dietitian && (await isDemo(id)) && <OpenDemoButton athleteId={id} name={profile.full_name || "Demo athlete"} />}

      <AthleteTabs base={`/athlete/${id}`} view={view} />

      {view === "overview" && <Overview ctx={ctx} week={sp.week} />}
      {view === "plan" && <Plan ctx={ctx} />}
      {view === "zones" && <ZonesAndGear ctx={ctx} />}
      {view === "fuel" && <RacesAndFuel ctx={ctx} />}
    </DashboardShell>
  );
}

/** How they're doing: readiness, this week, fitness, recent training and how it felt. */
async function Overview({ ctx, week: weekParam }: { ctx: Ctx; week?: string }) {
  const { id, data, me, supabase, tz, today, firstName, units } = ctx;
  const { profile, readiness, trend, activities } = data;
  const [week, load] = await Promise.all([getWeek(supabase, id, tz, weekStartFrom(weekParam, today)), getLoad(supabase, id, tz)]);

  return (
    <>
      <ChangeOfPlans athleteId={id} today={today} placeholder={`Change of plans for ${firstName}? e.g. move Tuesday's intervals to Thursday`} />
      <div className="mt-6 empty:hidden">
        <SafetyNotes athleteId={id} />
      </div>
      <ReadinessAreas today={readiness[0]} />
      <ReadinessTrend trend={trend} readiness={readiness} />
      <div className="mt-6">
        <WeekReview week={week} units={units} basePath={`/athlete/${id}`} workoutHref={(w) => `/athlete/${id}/workouts/${w}`} />
      </div>
      <div className="mt-6">
        <FitnessSection view={load} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section id="recent" className={card}>
          <h2 className="text-lg font-medium">Recent training</h2>
          {activities.length === 0 ? (
            <p className="mt-3 text-sm text-white/55">No activities yet.</p>
          ) : (
            <div className="-mx-2 mt-3 overflow-x-auto px-2">
              <table className="w-full min-w-[22rem] text-sm">
                <tbody>
                  {activities.map((a) => (
                    <tr key={a.id} className="relative border-t border-white/[0.09] transition hover:bg-white/[0.04]">
                      <td className="whitespace-nowrap py-2 pr-3 text-white/50">
                        {new Date(a.start_time).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: profile.timezone })}
                      </td>
                      <td className="py-2 pr-3 capitalize">
                        {/* The link covers the whole row */}
                        <Link href={`/activity/${a.id}`} className="after:absolute after:inset-0 hover:underline">
                          {a.sport?.replaceAll("_", " ") ?? "Activity"}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3 text-right text-white/70">{a.duration_s ? `${Math.round(a.duration_s / 60)} min` : ""}</td>
                      <td className="whitespace-nowrap py-2 pr-3 text-right text-white/70">{shortDistance(a.distance_m, me.units, a.sport) ?? ""}</td>
                      <td className="whitespace-nowrap py-2 text-right text-white/50">{a.avg_hr ? `${Math.round(a.avg_hr)} bpm` : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section id="checkins" className={card}>
          <h2 className="text-lg font-medium">Recent check-ins</h2>
          <p className="mb-2 mt-1 text-sm text-white/55">How workouts felt, how hard, and anything that hurt. You get a notification when pain is moderate or severe.</p>
          <RecentCheckins athleteId={id} timeZone={me.timezone} />
        </section>
      </div>

      <div className="mt-6">
        <BedtimeTrend athleteId={id} timeZone={tz} name={firstName === "This athlete" ? "They" : firstName} />
      </div>
    </>
  );
}

/** What's next: planned workouts, the season plan, and the coaching extras that feed it. */
async function Plan({ ctx }: { ctx: Ctx }) {
  const { id, data, me, supabase, today, firstName, units } = ctx;
  const { device, workouts, removed } = data;
  const { data: insightRows } = await supabase
    .from("form_insights")
    .select("id, issue_key, summary, evidence, drills, picks, status, created_at")
    .eq("athlete_id", id)
    .gte("created_at", daysBackIso(60))
    .order("created_at", { ascending: false })
    .limit(20);
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

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <section id="workouts" className={`${card} lg:col-span-2`}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Planned workouts</h2>
          <Link
            href={`/athlete/${id}/workouts/new`}
            className="flex min-h-11 items-center rounded-xl border border-emerald-300/25 bg-emerald-300/10 px-4 text-sm text-emerald-100 transition active:scale-95 hover:bg-emerald-300/20"
          >
            + New workout
          </Link>
        </div>
        <WorkoutList athleteId={id} workouts={workouts} removed={removed} device={device?.source ?? null} />
        <SaveAsPlan athleteId={id} today={today} />
      </section>

      <div id="planning" className="scroll-mt-6 lg:col-span-2">
        <PlanningPanel athleteId={id} coachId={me.id} firstName={firstName} full />
      </div>

      <section id="form" className={`${card} lg:col-span-2`}>
        <h2 className="text-lg font-medium">Form insights</h2>
        <p className="mb-4 mt-1 text-sm text-white/55">Only you see these. Suggested workouts are added as drafts for you to approve and send.</p>
        <FormInsights athleteId={id} insights={insights} tomorrow={daysBackIso(-1).slice(0, 10)} />
      </section>

      <div className="empty:hidden lg:col-span-2">
        <StrengthCoachCard athleteId={id} units={units} />
      </div>
      <MobilityCoachCard athleteId={id} today={today} firstName={firstName} />
      <BossCoachPanel athleteId={id} today={today} firstName={firstName} />
    </div>
  );
}

/** Numbers and kit: zones and tests, closet, swim technique, predictions. */
async function ZonesAndGear({ ctx }: { ctx: Ctx }) {
  const { id, me, supabase, tz, today, firstName, nameMid, units } = ctx;
  const [{ data: zones }, { data: recentMax }, { data: gearRow }, zoneSugg, testStatus, swim, videos, predictions] = await Promise.all([
    supabase.from("athlete_zones").select("max_hr, threshold_speed_mps, ftp_w, threshold_hr, css_sec_per_100m").eq("athlete_id", id).maybeSingle(),
    supabase.from("activities").select("max_hr").eq("athlete_id", id).gte("start_time", daysBackIso(180)).not("max_hr", "is", null).limit(500),
    supabase.from("athlete_gear").select("gear").eq("athlete_id", id).maybeSingle(),
    getZoneSuggestions(supabase, [id]),
    getTestStatus(supabase, id, today),
    getSwimView(supabase, id, me.units !== "km"),
    listSwimVideos(id),
    getPredictions(supabase, id, tz),
  ]);
  const closet = cleanCloset(gearRow?.gear);
  const [shoeMiles, bikeMiles] = await Promise.all([getShoeMileage(supabase, id, closet, tz), getBikeMileage(supabase, id, closet, tz)]);
  const closetLines = closetForPrompt(closet);

  return (
    <div className="mt-6 grid gap-6">
      <section id="zones" className={card}>
        <h2 className="text-lg font-medium">Training zones</h2>
        <p className="mb-4 mt-1 text-sm text-white/55">Used for time in zones and to judge zone targets on the workout view.</p>
        {zoneSugg.get(id) && (
          <div className="mb-4 [&>section]:mt-0">
            <ZoneSuggestions units={units} rows={[{ athleteId: id, suggestions: zoneSugg.get(id)! }]} title={false} />
          </div>
        )}
        <ZonesForm
          athleteId={id}
          maxHr={zones?.max_hr ?? null}
          thresholdPace={zones?.threshold_speed_mps ? paceOf(Number(zones.threshold_speed_mps), me.units) : null}
          units={me.units}
          ftp={zones?.ftp_w ?? null}
          thresholdHr={zones?.threshold_hr ?? null}
          css={zones?.css_sec_per_100m ? Number(zones.css_sec_per_100m) : null}
          estimatedMaxHr={estimateMaxHr((recentMax ?? []).map((r) => r.max_hr))}
        />
        <ThresholdTests athleteId={id} status={testStatus} today={today} />
      </section>

      <section id="closet" className={card}>
        <h2 className="text-lg font-medium">Closet</h2>
        {closetLines ? (
          <ul className="mt-3 space-y-1 text-sm text-white/70">
            {closetLines.filter((l) => !l.startsWith("Does not have")).map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-white/55">{firstName} hasn&apos;t filled in their closet yet (Me › Gear &amp; closet).</p>
        )}
        <details className="mt-3">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-emerald-200">Edit closet</summary>
          <div className="mt-3">
            <ClosetEditor athleteId={id} initial={closet} mileage={shoeMiles} bikeMileage={bikeMiles} units={me.units} today={today} />
          </div>
        </details>
        <p className="mt-3 text-xs text-white/45">Suggested workouts use this, and each workout shows {nameMid} what to pack.</p>
      </section>

      {swim && <SwimTechniqueCard view={swim} coach athleteId={id} videos={videos} />}
      <PredictionsCard view={predictions} coach athleteId={id} firstName={firstName} />
    </div>
  );
}

/** Race calendar and fueling. */
async function RacesAndFuel({ ctx }: { ctx: Ctx }) {
  const { id, me, tz, today, firstName, nameMid } = ctx;
  const [fuelMode, [fuelToday], mealWeek, races] = await Promise.all([getFuelMode(id), getFuelDays(id, today, 1), getMealWeek(id, today), getRaces(id, { from: today, limit: 10 })]);
  const mealDay = await getMealDay(id, today, tz, fuelToday.level);

  return (
    <div className="mt-6 grid gap-6">
      <section id="races" className={card}>
        <h2 className="text-lg font-medium">Races</h2>
        <p className="mb-4 mt-1 text-sm text-white/55">Each race gets a fueling plan, and race-week mode turns on for {nameMid} 10 days out.</p>
        <RaceList races={races} today={today} units={me.units} empty="No upcoming races." />
        <details className="mt-4">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-emerald-200">Add a race</summary>
          <div className="mt-3">
            <RaceForm athleteId={id} units={me.units} />
          </div>
        </details>
      </section>

      <section id="fuel" className={card}>
        <h2 className="text-lg font-medium">Fueling</h2>
        <p className="mb-4 mt-1 text-sm text-white/55">What {nameMid} sees on Fuel and with each workout. Guidance follows their planned training; you can change this anytime.</p>
        <FuelModePicker athleteId={id} firstName={firstName} mode={fuelMode} />
        {/* Coach always sees numbers, even when the athlete's mode hides them. */}
        <FuelLog day={mealDay} mode={fuelMode === "workout" ? "full" : fuelMode} timeZone={tz} units="mi" viewer="coach" firstName={firstName} />
        <FuelWeek week={mealWeek} />
      </section>
    </div>
  );
}

async function isDemo(id: string) {
  const { data } = await (await createClient()).from("profiles").select("is_demo").eq("id", id).maybeSingle();
  return !!data?.is_demo;
}
