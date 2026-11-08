import { Check, ChevronDown, ChevronUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import ActivityCharts from "@/components/activity/ActivityCharts";
import ActivityTitle from "@/components/activity/ActivityTitle";
import FormSection from "@/components/activity/FormSection";
import RouteMap from "@/components/activity/RouteMap";
import DashboardShell from "@/components/layout/DashboardShell";
import { compareWorkout, type ComparedStep } from "@/lib/activity/compare";
import type { Lap, Streams } from "@/lib/activity/fit";
import type { SwimRep } from "@/lib/activity/swim";
import { RUN_SPORT, type FormSummary } from "@/lib/activity/form";
import { formToStore, recentFormRuns } from "@/lib/activity/form-store";
import { clock, distance, isFootSport, sportLabel, speedText, whole, type Units } from "@/lib/activity/format";
import { isSwim, strokeName, swimClock, swimDist, swimPace, swimPool, swimSummary, unitLabel } from "@/lib/activity/swim";
import { daysBackIso, estimateMaxHr, hrZones, paceZones, powerZones, timeInZones, type Zone } from "@/lib/activity/zones";
import { createAdminClient, createClient, requireUser } from "@/lib/supabase/server";
import { describe } from "@/lib/workouts/describe";
import type { Pool, PoolUnit, Step } from "@/lib/workouts/garmin-format";
import BackLink from "@/components/layout/BackLink";
import { MessageAbout, WorkoutMessages } from "@/components/messages/WorkoutMessages";
import CheckIn from "@/components/avatar/CheckIn";
import ShoePicker from "@/components/ShoePicker";
import MergeNote from "@/components/MergeNote";
import Explain from "@/components/Explain";
import { explain, TILE_KEYS } from "@/lib/explain";
import { SOURCE_LABEL } from "@/lib/activity/dupes";
import { cleanCloset, defaultShoe, INDOOR_RIDE } from "@/lib/closet";
import MusclesWorked from "@/components/avatar/MusclesWorked";
import { normalizePain } from "@/lib/avatar/pain";
import { normalizeStrain } from "@/lib/avatar/strain";
import { writeAutoStrain } from "@/lib/avatar/strain-store";

export const metadata: Metadata = { title: "Workout · Diastole" };

// Ordinal ramp for zones 1-5, validated against the card surface (one hue, light end clears 2:1).
const ZONE_COLORS = ["#1c5cab", "#2a78d6", "#5598e7", "#86b6ef", "#b7d3f6"];

type Activity = {
  id: string;
  athlete_id: string;
  sport: string | null;
  name: string | null;
  start_time: string;
  duration_s: number | null;
  distance_m: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  calories: number | null;
  elevation_gain_m: number | null;
  avg_speed_mps: number | null;
  max_speed_mps: number | null;
  avg_power: number | null;
  max_power: number | null;
  normalized_power: number | null;
  avg_cadence: number | null;
  training_load: number | null;
  device: string | null;
  planned_workout_id: string | null;
};

function Card({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-5 backdrop-blur-2xl sm:p-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-medium">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function ZoneBars({ title, zones, secs, label, note }: { title: string; zones: Zone[]; secs: number[]; label: (z: Zone) => string; note: string }) {
  const total = secs.reduce((a, b) => a + b, 0);
  if (!total) return null;
  return (
    <div className="mb-6 last:mb-0">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium text-white/80">{title}</h3>
        <span className="text-xs text-white/45">{note}</span>
      </div>
      <div className="flex h-3 overflow-hidden rounded-full" aria-hidden>
        {secs.map((s, i) =>
          s ? <span key={i} style={{ width: `${(s / total) * 100}%`, background: ZONE_COLORS[i] }} className="h-full border-r-2 border-panel last:border-r-0" /> : null,
        )}
      </div>
      <ul className="mt-3 space-y-1.5 text-sm">
        {zones.map((z, i) => (
          <li key={z.n} className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: ZONE_COLORS[i] }} aria-hidden />
            <span className="w-6 shrink-0 text-white/50">Z{z.n}</span>
            <span className="min-w-0 flex-1 truncate text-white/75">
              {z.name} <span className="text-white/40">{label(z)}</span>
            </span>
            <span className="shrink-0 tabular-nums text-white/80">{secs[i] ? clock(secs[i]) : "–"}</span>
            <span className="w-10 shrink-0 text-right tabular-nums text-white/45">{Math.round((secs[i] / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const VERDICT = {
  on: { text: "On target", icon: Check, cls: "border-emerald-300/30 bg-emerald-300/10 text-emerald-100" },
  over: { text: "Over", icon: ChevronUp, cls: "border-amber-300/30 bg-amber-300/10 text-amber-100" },
  under: { text: "Under", icon: ChevronDown, cls: "border-sky-300/30 bg-sky-300/10 text-sky-100" },
} as const;

function plannedText(p: ComparedStep["planned"], pool: Pool, swim: boolean, u: Units) {
  // Same wording as the builder's send confirmation, minus the intensity (shown as the row label).
  const line = describe([{ kind: "step", ...p }], u, pool, swim)[0] ?? "";
  return line.replace(/^\S+\s/, "").replace(/ @ /, " · ").replace("until lap", "Lap button");
}

function actualText(c: ComparedStep, sport: string | null, swimUnit: PoolUnit | null, u: Units) {
  const a = c.actual;
  const t = c.planned.target;
  const measured =
    swimUnit && (t?.type === "swim_pace" || !t)
      ? swimPace(a.avg_speed, swimUnit)
      : t?.type === "pace_range"
        ? speedText(a.avg_speed, sport, u)
        : t?.type === "power_range"
          ? whole(a.avg_power, "W")
          : t?.type === "hr_zone" || t?.type === "hr_range"
            ? whole(a.avg_hr, "bpm")
            : null;
  const dist = swimUnit ? swimDist(a.distance_m, swimUnit) : distance(a.distance_m, u);
  return [clock(a.duration_s), dist, measured].filter(Boolean).join(" · ") || "–";
}

export default async function ActivityPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ feel?: string }> }) {
  const { id } = await params;
  const presetFeel = Number((await searchParams).feel) || null;
  const me = await requireUser();
  const supabase = await createClient();

  // Row-level security decides visibility: own, coach, or an opted-in pod mate.
  const { data: act } = await supabase.from("activities").select("*").eq("id", id).maybeSingle<Activity>();
  if (!act) notFound();

  const isOwn = act.athlete_id === me.id;
  const isCoach = me.role === "coach";
  const since = daysBackIso(180);

  const [{ data: detail }, { data: zonesRow }, { data: recent }, { data: plan }, { data: owner }] = await Promise.all([
    supabase.from("activity_details").select("streams, laps, route, form").eq("activity_id", id).maybeSingle(),
    supabase.from("athlete_zones").select("max_hr, threshold_speed_mps, ftp_w").eq("athlete_id", act.athlete_id).maybeSingle(),
    supabase.from("activities").select("max_hr").eq("athlete_id", act.athlete_id).gte("start_time", since).not("max_hr", "is", null).limit(500),
    act.planned_workout_id
      ? supabase.from("planned_workouts").select("id, title, sport, steps, scheduled_date, pool_length, pool_unit").eq("id", act.planned_workout_id).maybeSingle()
      : Promise.resolve({ data: null }),
    // Name only, after the visibility check above passed (pod mates can't read profiles directly).
    createAdminClient().from("profiles").select("full_name, timezone").eq("id", act.athlete_id).maybeSingle(),
  ]);

  // Muscles worked: estimated after the workout; created now if this one predates the feature.
  let { data: strainRow } = await supabase.from("activity_strain").select("auto, custom, reviewed_at").eq("activity_id", id).maybeSingle();
  if (!strainRow && (isOwn || isCoach)) {
    await writeAutoStrain(createAdminClient(), id, { laps: detail?.laps });
    ({ data: strainRow } = await supabase.from("activity_strain").select("auto, custom, reviewed_at").eq("activity_id", id).maybeSingle());
  }
  const [{ data: ownerAvatar }, { data: checkin }] = await Promise.all([
    supabase.from("avatars").select("look").eq("athlete_id", act.athlete_id).maybeSingle(),
    // Only the athlete and their coach can read check-ins (row-level security).
    supabase.from("workout_checkins").select("feel, rpe, pain, note, updated_at").eq("activity_id", id).maybeSingle(),
  ]);

  const streams = (detail?.streams ?? null) as Streams | null;
  const laps = ((detail?.laps ?? []) as Lap[]).filter((l) => (l.duration_s ?? 0) > 0);
  const route = (detail?.route ?? null) as [number, number][] | null;
  const tz = owner?.timezone ?? me.timezone;
  const u: Units = me.units ?? "mi";

  // Running form: this run's summary (computed once if missing) and the athlete's earlier runs.
  // Visibility was settled above: whoever can open this run may see this athlete's workout details.
  const isRun = RUN_SPORT.test(act.sport ?? "");
  // Gear: which shoes a run, or which bike a ride, counts toward (own sessions, or the coach's athlete).
  const isRide = !isRun && /cycl|bik|ride/i.test(act.sport ?? "") && !INDOOR_RIDE.test(act.sport ?? "");
  const [{ data: gearRow }, { data: shoePick }, { data: bikePick }] =
    (isRun || isRide) && (isOwn || isCoach)
      ? await Promise.all([
          supabase.from("athlete_gear").select("gear").eq("athlete_id", act.athlete_id).maybeSingle(),
          isRun ? supabase.from("activity_shoes").select("shoe_id").eq("activity_id", act.id).maybeSingle() : Promise.resolve({ data: null }),
          isRide ? supabase.from("activity_bikes").select("bike_id").eq("activity_id", act.id).maybeSingle() : Promise.resolve({ data: null }),
        ])
      : [{ data: null }, { data: null }, { data: null }];
  const runCloset = cleanCloset(gearRow?.gear);
  const { data: typicalLoadRows } = await supabase.from("activities").select("training_load").eq("athlete_id", act.athlete_id).gte("start_time", new Date(Date.parse(act.start_time) - 28 * 86_400_000).toISOString()).not("training_load", "is", null).limit(200);
  const { data: merges } = isOwn || isCoach ? await supabase.from("activity_merges").select("id, source").eq("kept_id", act.id).is("undone_at", null) : { data: [] };
  const pickable = runCloset.shoes.filter((s) => !s.retired || s.id === shoePick?.shoe_id);
  const onlyBike = runCloset.bikes.length === 1 ? runCloset.bikes[0] : null;
  let form: FormSummary | null = (detail?.form as FormSummary | null) ?? null;
  let formHistory: Awaited<ReturnType<typeof recentFormRuns>> = [];
  if (isRun && streams) {
    const admin = createAdminClient();
    if (!form) {
      form = formToStore(streams, act.sport);
      if (form) await admin.from("activity_details").update({ form }).eq("activity_id", id);
    }
    formHistory = await recentFormRuns(admin, act.athlete_id, { before: act.start_time, timeZone: tz, limit: 25 });
  }
  const foot = isFootSport(act.sport);
  const swim = isSwim(act.sport);
  const pool = swim ? swimPool(streams, laps, act.distance_m, u) : null;
  const swimUnit = pool?.unit ?? null;
  const swimSum = pool ? swimSummary(laps, pool.unit, pool) : null;

  // Zones: the coach's numbers, otherwise an estimate for max HR.
  const setMax = zonesRow?.max_hr ?? null;
  const estMax = setMax ? null : estimateMaxHr((recent ?? []).map((r) => r.max_hr));
  const maxHr = setMax ?? estMax;
  const hrNote = setMax ? `Max HR ${setMax} (set by coach)` : estMax ? `Max HR ~${estMax} (estimated)` : "";

  const planPool: Pool = plan?.pool_length && plan.pool_unit ? { length: Number(plan.pool_length), unit: plan.pool_unit as PoolUnit } : null;
  const planSwim = plan?.sport === "swim";
  const comparison = plan && laps.length ? compareWorkout(plan.steps as Step[], laps, maxHr, planPool) : null;
  const canEditZones = isCoach; // a coach only ever sees their own athletes here
  const back = isCoach && !isOwn ? { href: `/athlete/${act.athlete_id}`, label: owner?.full_name || "Athlete" } : isOwn ? { href: "/training", label: "Training" } : { href: "/me/pods", label: "Pods" };

  const when = new Date(act.start_time);
  const tiles = swimUnit
    ? [
        ["Time", clock(act.duration_s)],
        ["Distance", swimDist(swimSum?.distance_m ?? act.distance_m, swimUnit)],
        // Pace while swimming (rest excluded), as swimmers quote it; the session average otherwise.
        ["Avg pace", swimSum?.sec_per_100 ? `${swimClock(swimSum.sec_per_100)} /100${unitLabel(swimUnit)}` : swimPace(act.avg_speed_mps, swimUnit)],
        ["Swim time", swimSum ? clock(swimSum.swim_s) : null],
        ["Rest", swimSum?.rest_s ? clock(swimSum.rest_s) : null],
        ["Best rep pace", swimSum?.best_100 && swimSum.reps.length > 1 ? `${swimClock(swimSum.best_100)} /100${unitLabel(swimUnit)}` : null],
        ["Avg SWOLF", swimSum?.swolf ? String(swimSum.swolf) : null],
        ["Stroke rate", whole(swimSum?.stroke_rate ?? act.avg_cadence, "str/min")],
        ["Pool", pool?.length_m ? `${Math.round(pool.length_m / (swimUnit === "YARD" ? 0.9144 : 1))} ${unitLabel(swimUnit)}` : null],
        ["Avg HR", whole(act.avg_hr, "bpm")],
        ["Max HR", whole(act.max_hr, "bpm")],
        ["Calories", whole(act.calories, "kcal")],
        ["Training load", whole(act.training_load, "")],
      ].filter((x): x is [string, string] => Boolean(x[1]))
    : [
    ["Time", clock(act.duration_s)],
    ["Distance", distance(act.distance_m, u)],
    [foot ? "Avg pace" : "Avg speed", speedText(act.avg_speed_mps, act.sport, u)],
    ["Avg HR", whole(act.avg_hr, "bpm")],
    ["Max HR", whole(act.max_hr, "bpm")],
    ["Avg power", whole(act.avg_power, "W")],
    ["Normalized power", whole(act.normalized_power, "W")],
    ["Max power", whole(act.max_power, "W")],
    ["Cadence", whole(act.avg_cadence, foot ? "spm" : "rpm")],
    ["Elevation gain", whole(act.elevation_gain_m, "m")],
    ["Calories", whole(act.calories, "kcal")],
    ["Training load", whole(act.training_load, "")],
  ].filter((x): x is [string, string] => Boolean(x[1]));

  const swimCols = swimSum
    ? [
        { key: "dist", head: "Distance", get: (r: SwimRep) => swimDist(r.distance_m, swimUnit!) },
        { key: "stroke", head: "Stroke", get: (r: SwimRep) => strokeName(r.stroke) },
        { key: "time", head: "Time", get: (r: SwimRep) => swimClock(r.time_s, true) },
        { key: "pace", head: `/100${unitLabel(swimUnit!)}`, get: (r: SwimRep) => swimClock(r.sec_per_100) },
        { key: "rest", head: "Rest", get: (r: SwimRep) => (r.rest_s ? swimClock(r.rest_s) : null) },
        { key: "swolf", head: "SWOLF", get: (r: SwimRep) => (r.swolf ? String(r.swolf) : null) },
        { key: "spl", head: "Str/len", get: (r: SwimRep) => (r.strokes_per_length ? r.strokes_per_length.toFixed(1) : null) },
        { key: "rate", head: "Str/min", get: (r: SwimRep) => whole(r.stroke_rate, "") },
        { key: "hr", head: "Avg HR", get: (r: SwimRep) => whole(r.avg_hr, "") },
      ].filter((c) => swimSum.reps.some((r) => c.get(r)))
    : [];

  const lapCols = [
    { key: "time", head: "Time", get: (l: Lap) => clock(l.duration_s) },
    { key: "dist", head: "Distance", get: (l: Lap) => distance(l.distance_m, u) },
    { key: "pace", head: foot ? "Pace" : "Speed", get: (l: Lap) => speedText(l.avg_speed, act.sport, u) },
    { key: "hr", head: "Avg HR", get: (l: Lap) => whole(l.avg_hr, "") },
    { key: "power", head: "Power", get: (l: Lap) => whole(l.avg_power, "") },
    { key: "cad", head: "Cadence", get: (l: Lap) => whole(l.avg_cadence, "") },
  ].filter((c) => laps.some((l) => c.get(l)));

  const interval = streams?.interval_s ?? 5;
  const hrSecs = streams?.hr && maxHr ? timeInZones(hrZones(maxHr), streams.hr, interval) : null;
  const paceSecs = foot && streams?.speed && zonesRow?.threshold_speed_mps ? timeInZones(paceZones(Number(zonesRow.threshold_speed_mps)), streams.speed, interval, 0.5) : null;
  const powerSecs = streams?.power && zonesRow?.ftp_w ? timeInZones(powerZones(zonesRow.ftp_w), streams.power, interval) : null;
  const hasZones = [hrSecs, paceSecs, powerSecs].some((s) => s?.some(Boolean));

  // "Explain this" on the tiles, with this athlete's own numbers.
  const typicalLoad = typicalLoadRows?.length ? typicalLoadRows.reduce((t, r) => t + Number(r.training_load), 0) / typicalLoadRows.length : null;
  const explainCtx = (label: string) => {
    const key = TILE_KEYS[label];
    const value = key === "avg_hr" ? act.avg_hr : key === "max_hr" ? act.max_hr : key === "normalized_power" ? act.normalized_power : key === "training_load" ? act.training_load : key === "swolf" ? (swimSum?.swolf ?? null) : null;
    return { value: value == null ? null : Number(value), baseline: key === "training_load" ? typicalLoad : null, maxHr: maxHr ?? null, ftp: zonesRow?.ftp_w ?? null };
  };

  return (
    <DashboardShell role={isCoach ? "coach" : "athlete"}>
      <BackLink href={back.href} label={back.label} />
      <p className="mt-4 text-sm uppercase tracking-[0.25em] text-white/50">{sportLabel(act.sport)}</p>
      <div className="mt-2">
        {/* Owner or their coach (a coach only ever sees their own athletes here) can rename. */}
        <ActivityTitle id={act.id} name={act.name} fallback={sportLabel(act.sport)} canRename={isOwn || isCoach} as="h1" className="text-3xl font-bold tracking-tight sm:text-4xl" />
      </div>
      <p className="mt-2 text-sm text-white/55">
        {[
          !isOwn && owner?.full_name,
          when.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: tz }),
          when.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz }),
          act.device && act.device.replaceAll("_", " "),
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {(isOwn || isCoach) && <MergeNote merges={(merges ?? []).map((m) => ({ id: m.id, label: SOURCE_LABEL[m.source] ?? m.source }))} />}

      {/* Owner -> their coach; coach -> the athlete. A coach who is their own athlete has no one to message. */}
      {((isOwn && me.coach_id && me.coach_id !== me.id) || (isCoach && !isOwn)) && (
        <div className="mt-4">
          <MessageAbout to={isOwn ? "coach" : act.athlete_id} name={isOwn ? "coach" : (owner?.full_name?.split(" ")[0] ?? "athlete")} activityId={act.id} />
        </div>
      )}

      {tiles.length > 0 && (
        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {tiles.map(([label, value]) => (
            <div key={label} className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.055] p-4">
              <p className="flex min-w-0 items-center gap-1.5 text-xs uppercase tracking-[0.15em] text-white/45">
                <span className="truncate">{label}</span>
                {TILE_KEYS[label] && <Explain label={label} text={explain(TILE_KEYS[label], explainCtx(label))} />}
              </p>
              <p className="mt-1 truncate text-xl font-semibold tabular-nums">{value}</p>
            </div>
          ))}
        </section>
      )}

      {isRun && (isOwn || isCoach) && pickable.length > 0 && (
        <section className="mt-6 rounded-[24px] border border-white/10 bg-white/[0.04] px-4 py-2">
          <ShoePicker activityId={act.id} shoes={pickable.map((s) => ({ id: s.id, model: s.model }))} defaultId={defaultShoe(runCloset)?.id ?? null} initial={shoePick?.shoe_id ?? null} />
        </section>
      )}

      {isRide && (isOwn || isCoach) && runCloset.bikes.length > 0 && (
        <section className="mt-6 rounded-[24px] border border-white/10 bg-white/[0.04] px-4 py-2">
          <ShoePicker gear="bike" activityId={act.id} shoes={runCloset.bikes.map((b) => ({ id: b.id, model: b.model }))} defaultId={onlyBike?.id ?? null} initial={bikePick?.bike_id ?? null} />
        </section>
      )}

      {(isOwn || checkin) && (
        <section id="checkin" className="scroll-mt-6">
          <Card title={isOwn ? "How did it go?" : "Check-in"}>
            <CheckIn
              activityId={act.id}
              look={ownerAvatar?.look ?? null}
              initial={checkin ? { feel: checkin.feel, rpe: checkin.rpe, pain: normalizePain(checkin.pain), note: checkin.note, updated_at: checkin.updated_at } : null}
              editable={isOwn}
              durationS={act.duration_s}
              firstName={owner?.full_name?.split(" ")[0] ?? "The athlete"}
              presetFeel={presetFeel}
            />
          </Card>
        </section>
      )}

      {strainRow && (
        <section id="muscles" className="scroll-mt-6">
          <Card title="Muscles worked">
            <MusclesWorked
              activityId={act.id}
              look={ownerAvatar?.look ?? null}
              auto={normalizeStrain(strainRow.auto)}
              custom={strainRow.custom ? normalizeStrain(strainRow.custom) : null}
              reviewed={Boolean(strainRow.reviewed_at)}
              editable={isOwn || isCoach}
              firstName={owner?.full_name?.split(" ")[0] ?? "the athlete"}
            />
          </Card>
        </section>
      )}

      {plan && (
        <Card
          title="Planned vs completed"
          aside={
            isCoach ? (
              <Link href={`/athlete/${act.athlete_id}/workouts/${plan.id}`} className="truncate text-sm text-emerald-200 hover:underline">
                {plan.title} →
              </Link>
            ) : (
              <span className="truncate text-sm text-white/55">{plan.title}</span>
            )
          }
        >
          {!comparison ? (
            <p className="text-sm text-white/55">
              {laps.length
                ? "The laps from this session don't line up with the planned steps (for example, the workout was run without the watch's workout screen), so they can't be compared step by step."
                : "Step-by-step comparison appears once the watch's detailed file arrives."}
            </p>
          ) : (
            <ol className="divide-y divide-white/10">
              {comparison.map((c, i) => {
                const v = c.verdict ? VERDICT[c.verdict] : null;
                return (
                  <li key={i} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                    <div className="min-w-0 flex-1 basis-48">
                      <p className="text-sm font-medium">
                        {c.planned.label}
                        {c.planned.rep && <span className="text-white/45"> · {c.planned.rep}</span>}
                      </p>
                      <p className="text-xs text-white/50">Plan: {plannedText(c.planned, planPool, planSwim, u)}</p>
                    </div>
                    <p className="min-w-0 flex-1 basis-40 text-sm tabular-nums text-white/80">{actualText(c, act.sport, planPool?.unit ?? swimUnit, u)}</p>
                    {v ? (
                      <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${v.cls}`}>
                        <v.icon className="h-3.5 w-3.5" aria-hidden />
                        {v.text}
                      </span>
                    ) : (
                      <span className="w-[5.5rem] shrink-0" aria-hidden />
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
      )}

      {(isOwn || isCoach) && <WorkoutMessages activityId={act.id} me={me.id} names={{ [act.athlete_id]: owner?.full_name?.split(" ")[0] ?? "Athlete" }} />}

      {streams && streams.t.length > 1 && (
        <Card title="Over the session">
          <ActivityCharts streams={streams} sport={act.sport} units={u} swimUnit={swimUnit} />
        </Card>
      )}

      {isRun && form && (
        <FormSection
          form={form}
          history={formHistory}
          streams={streams}
          date={new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(act.start_time))}
        />
      )}

      {(hasZones || canEditZones) && (
        <Card
          title="Zones"
          aside={
            canEditZones ? (
              <Link href={`/athlete/${act.athlete_id}#zones`} className="text-sm text-emerald-200 hover:underline">
                Edit zones →
              </Link>
            ) : null
          }
        >
          {hasZones ? (
            <>
              {hrSecs && <ZoneBars title="Heart rate" zones={hrZones(maxHr!)} secs={hrSecs} note={hrNote} label={(z) => (z.high ? `< ${z.high}` : `${z.low}+`)} />}
              {paceSecs && (
                <ZoneBars
                  title="Pace"
                  zones={paceZones(Number(zonesRow!.threshold_speed_mps))}
                  secs={paceSecs}
                  note={`Threshold ${speedText(Number(zonesRow!.threshold_speed_mps), "run", u)}`}
                  label={(z) => (z.high ? `slower than ${speedText(z.high, "run", u)}` : `${speedText(z.low, "run", u)} or faster`)}
                />
              )}
              {powerSecs && (
                <ZoneBars title="Power" zones={powerZones(zonesRow!.ftp_w!)} secs={powerSecs} note={`FTP ${zonesRow!.ftp_w} W`} label={(z) => (z.high ? `< ${z.high} W` : `${z.low} W+`)} />
              )}
            </>
          ) : (
            <p className="text-sm text-white/55">
              {streams ? "Set max heart rate, threshold pace or FTP to see time in each zone." : "Zones appear once the watch's detailed file arrives."}
            </p>
          )}
        </Card>
      )}

      {swimSum && swimCols.length > 0 && (
        <Card
          title="Swim splits"
          aside={
            <span className="text-sm tabular-nums text-white/55">
              {swimSum.reps.length} {swimSum.reps.length === 1 ? "rep" : "reps"} · {swimDist(swimSum.distance_m, swimUnit!)}
            </span>
          }
        >
          <div className="-mx-2 overflow-x-auto px-2">
            <table className="w-full min-w-[22rem] text-sm tabular-nums">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-white/45">
                  <th className="py-2 pr-3 font-normal">#</th>
                  {swimCols.map((c) => (
                    <th key={c.key} className={`whitespace-nowrap py-2 pr-3 font-normal last:pr-0 ${c.key === "stroke" ? "text-left" : "text-right"}`}>
                      {c.head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {swimSum.reps.map((r) => (
                  <tr key={r.n} className="border-t border-white/[0.08]">
                    <td className="py-2 pr-3 text-white/50">{r.n}</td>
                    {swimCols.map((c) => (
                      <td
                        key={c.key}
                        className={`whitespace-nowrap py-2 pr-3 last:pr-0 ${c.key === "stroke" ? "text-left text-white/60" : "text-right"} ${
                          c.key === "pace" ? "font-medium text-white" : c.key === "rest" ? "text-white/50" : "text-white/80"
                        }`}
                      >
                        {c.get(r) ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-white/45">
            Pace is per 100 {swimUnit === "YARD" ? "yards" : "meters"} while swimming. Rest is the time until the next rep starts.
            {swimCols.some((c) => c.key === "swolf") ? " SWOLF is seconds plus strokes per length; lower is more efficient." : ""}
          </p>
        </Card>
      )}

      {!swimSum && laps.length > 1 && lapCols.length > 0 && (
        <Card title="Laps">
          <div className="-mx-2 overflow-x-auto px-2">
            <table className="w-full min-w-[22rem] text-sm tabular-nums">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-white/45">
                  <th className="py-2 pr-3 font-normal">#</th>
                  {lapCols.map((c) => (
                    <th key={c.key} className="py-2 pr-3 text-right font-normal last:pr-0">
                      {c.head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {laps.map((l, i) => (
                  <tr key={i} className="border-t border-white/[0.08]">
                    <td className="py-2 pr-3 text-white/50">{i + 1}</td>
                    {lapCols.map((c) => (
                      <td key={c.key} className="whitespace-nowrap py-2 pr-3 text-right text-white/80 last:pr-0">
                        {c.get(l) ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {route && route.length > 1 && (
        <Card title="Route">
          <RouteMap route={route} />
        </Card>
      )}

      {!streams && (
        <p className="mt-6 text-sm text-white/45">
          Charts, laps and the route appear when the watch&apos;s detailed activity file arrives. Activities from before the file sync was turned on
          show the summary only.
        </p>
      )}
    </DashboardShell>
  );
}
