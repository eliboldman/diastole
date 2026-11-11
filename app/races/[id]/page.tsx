import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import DashboardShell from "@/components/layout/DashboardShell";
import BackLink from "@/components/layout/BackLink";
import RaceChecklist from "@/components/race/RaceChecklist";
import RaceEdit from "@/components/race/RaceEdit";
import { countdown, raceDistance } from "@/components/race/RaceList";
import RacePlanCard from "@/components/race/RacePlanCard";
import RaceEstimate from "@/components/predict/RaceEstimate";
import { clock } from "@/lib/activity/format";
import { daysUntil, RACE_WEEK_DAYS, raceWeekChecklist } from "@/lib/fuel/race";
import { getRace, getRaceTools, planFor } from "@/lib/fuel/race-data";
import { getRacePrediction } from "@/lib/predict/data";
import { createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Race · Diastole" };
const UUID = /^[0-9a-f-]{36}$/i;
const SPORT: Record<string, string> = { run: "Run", bike: "Bike", swim: "Swim", tri: "Triathlon", other: "Race" };

export default async function RacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const me = await requireUser();
  const race = await getRace(id); // row-level security: the athlete or their coach
  if (!race) notFound();
  const own = race.athlete_id === me.id;
  const [tools, owner] = await Promise.all([
    getRaceTools(race.athlete_id),
    own ? Promise.resolve(null) : (await createClient()).from("profiles").select("full_name, timezone").eq("id", race.athlete_id).maybeSingle(),
  ]);
  const tz = owner?.data?.timezone ?? me.timezone;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: tz });
  const days = daysUntil(race.race_date, today);
  const plan = planFor(race, tools);
  const est = days >= 0 ? await getRacePrediction(await createClient(), race, tz) : null;
  const showEst = est && !(own && est.hidden);
  const phase = days >= 0 && days <= RACE_WEEK_DAYS ? raceWeekChecklist(days, plan) : null;

  return (
    <DashboardShell role={me.role === "coach" ? "coach" : "athlete"}>
      <BackLink href={own ? "/races" : `/athlete/${race.athlete_id}`} label={own ? "Races" : (owner?.data?.full_name ?? "Athlete")} />
      <p className="mt-6 text-xs uppercase tracking-[0.3em] text-emerald-200/60">
        {race.priority} race · {countdown(days)}
      </p>
      <h1 className="mt-3 break-words text-3xl font-medium tracking-tight sm:text-4xl">{race.name}</h1>
      <p className="mt-2 text-white/55">
        {[new Date(`${race.race_date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }), SPORT[race.sport], raceDistance(race.distance_km, me.units), race.goal_seconds ? `goal ${clock(race.goal_seconds)}` : null]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {race.notes && <p className="mt-3 whitespace-pre-wrap text-sm text-white/70">{race.notes}</p>}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {phase && (
          <section className="rounded-[28px] border border-emerald-300/25 bg-emerald-300/[0.06] p-6">
            <h2 className="text-lg font-medium">{days === 0 ? "Race morning" : `Race week: ${phase.title.toLowerCase()}`}</h2>
            <div className="mt-3">
              <RaceChecklist raceId={race.id} items={phase.items} done={race.checklist ?? {}} />
            </div>
          </section>
        )}
        {showEst && <RaceEstimate prediction={est.prediction} goal={race.goal_seconds} note={est.note} own={own} />}
        {plan ? (
          <RacePlanCard plan={plan} units={me.units} />
        ) : (
          <section className="rounded-[28px] border border-white/10 bg-white/[0.055] p-6 text-sm text-white/60">Add a distance or goal time to get a fueling plan.</section>
        )}
        <section className="rounded-[28px] border border-white/10 bg-white/[0.055] p-6 text-sm text-white/65">
          <h2 className="mb-2 text-lg font-medium text-white">Sized from</h2>
          <ul className="space-y-1">
            <li>Body weight: {tools.weightKg ? "on file" : "not added yet (Fuel page)"}</li>
            <li>Sweat rate: {tools.sweatRateMlH ? `${tools.sweatRateMlH} ml/h` : "no test yet"}</li>
            <li>Gut training: {tools.gutMaxCarbs != null ? `handles ${tools.gutMaxCarbs} g/h well` : "no sessions yet"}</li>
          </ul>
          {own && (
            <Link href="/races#sweat" className="mt-3 inline-flex min-h-11 items-center text-emerald-200 hover:underline">
              Sweat test and gut training →
            </Link>
          )}
        </section>
        <section className="rounded-[28px] border border-white/10 bg-white/[0.055] p-6">
          <RaceEdit race={race} units={me.units} athleteId={own ? undefined : race.athlete_id} back={own ? "/races" : `/athlete/${race.athlete_id}`} />
        </section>
      </div>
    </DashboardShell>
  );
}
