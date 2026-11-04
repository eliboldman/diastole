import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { parseFit, type FitActivity } from "@/lib/activity/fit";

type Admin = SupabaseClient;

const present = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined));

/** Sport families, so a planned "run" matches running, treadmill or trail runs. */
const FAMILY: Record<string, RegExp> = {
  run: /run|treadmill|track/i,
  bike: /cycl|bike|biking|ride|spin/i,
  swim: /swim/i,
};

/** treadmill + running -> treadmill_running; lap_swimming + swimming -> lap_swimming. */
function sportName(fit: FitActivity) {
  const { sport, sub_sport: sub } = fit.summary;
  if (!sub || sub === "generic" || !sport) return sport;
  return sub.includes(sport) ? sub : `${sub}_${sport}`;
}

function summaryColumns(fit: FitActivity) {
  const s = fit.summary;
  return {
    duration_s: s.duration_s,
    distance_m: s.distance_m,
    avg_hr: s.avg_hr,
    max_hr: s.max_hr,
    calories: s.calories,
    elevation_gain_m: s.elevation_gain_m,
    elevation_loss_m: s.elevation_loss_m,
    avg_speed_mps: s.avg_speed_mps,
    max_speed_mps: s.max_speed_mps,
    avg_power: s.avg_power,
    max_power: s.max_power,
    normalized_power: s.normalized_power,
    avg_cadence: s.avg_cadence,
    training_load: s.training_load,
    device: s.device,
  };
}

/**
 * Parses a FIT file and stores it against the activity with this external id (Garmin activityId),
 * creating the activity if its summary hasn't arrived yet. Summary values already present from
 * Garmin's own summary are kept; the FIT file only fills gaps. Returns the activity id.
 */
export async function saveFitActivity(
  admin: Admin,
  opts: { athleteId: string; source: "garmin" | "garmin_export"; externalId: string; bytes: Uint8Array; name?: string | null },
): Promise<string> {
  const fit = parseFit(opts.bytes);

  const { data: existing } = await admin
    .from("activities")
    .select("*")
    .eq("source", opts.source)
    .eq("external_id", opts.externalId)
    .maybeSingle();

  let activityId: string;
  if (existing) {
    activityId = existing.id;
  } else {
    const { data, error } = await admin
      .from("activities")
      .insert({
        athlete_id: opts.athleteId,
        source: opts.source,
        external_id: opts.externalId,
        sport: sportName(fit),
        start_time: fit.summary.start_time,
        name: opts.name ?? null,
        ...summaryColumns(fit),
      })
      .select("id")
      .single();
    if (error) throw new Error(`Saving activity failed: ${error.message}`);
    activityId = data.id;
  }

  await saveFitDetail(admin, existing ?? { id: activityId, athlete_id: opts.athleteId }, fit, opts.source === "garmin" ? "garmin_fit" : "garmin_export_fit", opts.name);
  await linkPlannedWorkout(admin, activityId);
  return activityId;
}

/**
 * Stores parsed FIT detail against an existing activity row. Summary values already on the row
 * (from Garmin's own summary) are kept; the file only fills gaps.
 */
export async function saveFitDetail(
  admin: Admin,
  activity: Record<string, unknown> & { id: string; athlete_id: string },
  fit: FitActivity,
  source: "garmin_fit" | "garmin_export_fit",
  name?: string | null,
) {
  const gaps = Object.fromEntries(
    Object.entries(present(summaryColumns(fit))).filter(([k]) => activity[k] === null || activity[k] === undefined),
  );
  if (!activity.name && name) gaps.name = name;
  if (Object.keys(gaps).length) await admin.from("activities").update(gaps).eq("id", activity.id);

  const { error } = await admin.from("activity_details").upsert(
    {
      activity_id: activity.id,
      athlete_id: activity.athlete_id,
      source,
      streams: fit.streams,
      laps: fit.laps,
      route: fit.route,
      record_fields: fit.record_fields,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "activity_id" },
  );
  if (error) throw new Error(`Saving activity detail failed: ${error.message}`);
}

/**
 * Links a completed activity to the planned workout it most likely fulfilled: same athlete,
 * same local day, same sport family, sent or approved, not deleted, not already linked.
 */
export async function linkPlannedWorkout(admin: Admin, activityId: string) {
  const { data: act } = await admin
    .from("activities")
    .select("id, athlete_id, sport, start_time, planned_workout_id")
    .eq("id", activityId)
    .maybeSingle();
  if (!act || act.planned_workout_id || !act.sport) return;

  const { data: profile } = await admin.from("profiles").select("timezone").eq("id", act.athlete_id).maybeSingle();
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: profile?.timezone ?? "America/Chicago" }).format(new Date(act.start_time));

  const { data: plans } = await admin
    .from("planned_workouts")
    .select("id, sport")
    .eq("athlete_id", act.athlete_id)
    .eq("scheduled_date", day)
    .in("status", ["approved", "sent", "completed"])
    .is("deleted_at", null);
  const candidates = (plans ?? []).filter((p) => FAMILY[p.sport]?.test(act.sport));
  if (!candidates.length) return;

  const { data: taken } = await admin
    .from("activities")
    .select("planned_workout_id")
    .in("planned_workout_id", candidates.map((p) => p.id));
  const used = new Set((taken ?? []).map((t) => t.planned_workout_id));
  const plan = candidates.find((p) => !used.has(p.id));
  if (plan) await admin.from("activities").update({ planned_workout_id: plan.id }).eq("id", act.id).is("planned_workout_id", null);
}
