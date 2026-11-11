import "server-only";

import { mergeIfDuplicate } from "@/lib/activity/merge";
import { linkPlannedWorkout, saveFitActivity } from "@/lib/activity/store";
import { forgetGarmin, garminFetch } from "@/lib/garmin/client";
import { createAdminClient } from "@/lib/supabase/server";

// Maps Garmin Health/Activity API summaries onto our tables.
// Field names follow Garmin's Health API summaries; every payload is also stored raw in
// garmin_raw so the mapping can be checked and corrected against real data.

type Summary = Record<string, unknown> & { userId?: string; callbackURL?: string };

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function wellnessFields(type: string, s: Summary): Record<string, unknown> | null {
  switch (type) {
    case "dailies":
      return {
        resting_hr: num(s.restingHeartRateInBeatsPerMinute),
        stress_avg: num(s.averageStressLevel) !== null && (s.averageStressLevel as number) >= 0 ? s.averageStressLevel : null,
      };
    case "sleeps": {
      const score = s.overallSleepScore as { value?: number } | undefined;
      // startTimeInSeconds is the sleep's start (Unix seconds, UTC): kept for bedtime consistency.
      const startSec = num(s.startTimeInSeconds);
      return { sleep_seconds: num(s.durationInSeconds), sleep_score: num(score?.value), ...(startSec ? { sleep_start: new Date(startSec * 1000).toISOString() } : {}) };
    }
    case "hrv":
      return { hrv_ms: num(s.lastNightAvg) };
    case "stressDetails": {
      const bb = Object.values((s.timeOffsetBodyBatteryValues as Record<string, number>) ?? {}).filter(
        (v) => typeof v === "number",
      );
      return bb.length ? { body_battery_high: Math.max(...bb), body_battery_low: Math.min(...bb) } : null;
    }
    default:
      return null;
  }
}

/** Remove any location fields (e.g. startingLatitudeInDegree) — the privacy policy promises no location data. */
export function stripLocation<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripLocation) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => !/latitude|longitude|polyline|geo/i.test(k))
        .map(([k, v]) => [k, stripLocation(v)]),
    ) as T;
  }
  return value;
}

/** Drop keys whose value is null so partial summaries don't wipe values from other summary types. */
function present(o: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined));
}

/** Stores a Garmin push payload. Returns the athletes whose data changed. */
export async function ingestGarminPayload(body: Record<string, Summary[]>): Promise<Set<string>> {
  const admin = createAdminClient();
  const touched = new Set<string>();
  const athleteCache = new Map<string, string | null>();

  async function athleteFor(garminUser?: string) {
    if (!garminUser) return null;
    if (!athleteCache.has(garminUser)) {
      const { data } = await admin
        .from("device_connections")
        .select("athlete_id")
        .eq("source", "garmin")
        .eq("external_user_id", garminUser)
        .maybeSingle();
      athleteCache.set(garminUser, data?.athlete_id ?? null);
    }
    return athleteCache.get(garminUser)!;
  }

  for (const [type, items] of Object.entries(body)) {
    if (!Array.isArray(items)) continue;

    for (const rawItem of items) {
      let item = stripLocation(rawItem);
      const athleteId = await athleteFor(item.userId);

      // Activity files: the watch's original FIT file, fetched from the callback URL. Gives the
      // second-by-second streams, laps and route behind the activity view.
      if (type === "activityFiles") {
        await admin.from("garmin_raw").insert({ summary_type: type, garmin_user: item.userId ?? null, payload: item });
        if (!athleteId || !item.callbackURL || String(item.fileType ?? "").toUpperCase() !== "FIT") continue;
        const externalId = String(item.activityId ?? "");
        if (!externalId) continue;
        const url = new URL(item.callbackURL);
        const res = await garminFetch(athleteId, url.pathname + url.search);
        if (res.status >= 500) throw new Error(`Garmin activity file download failed: ${res.status}`); // retry later
        if (!res.ok) {
          console.warn("Garmin activity file not available", res.status, externalId);
          continue;
        }
        try {
          await saveFitActivity(admin, {
            athleteId,
            source: "garmin",
            externalId,
            bytes: new Uint8Array(await res.arrayBuffer()),
            name: typeof item.activityName === "string" ? item.activityName.slice(0, 200) : null,
          });
        } catch (e) {
          // A file we can't read won't improve on retry; the summary still stands.
          console.error("Garmin activity file could not be parsed", externalId, e);
          continue;
        }
        touched.add(athleteId);
        continue;
      }

      // Ping mode: Garmin sends a URL to fetch the data from instead of the data itself.
      if (item.callbackURL && athleteId) {
        const url = new URL(item.callbackURL);
        const res = await garminFetch(athleteId, url.pathname + url.search);
        const fetched = res.ok ? await res.json() : [];
        const sub = await ingestGarminPayload({ [type]: (Array.isArray(fetched) ? fetched : [fetched]).map((f) => ({ ...f, userId: item.userId })) });
        sub.forEach((id) => touched.add(id));
        continue;
      }

      await admin.from("garmin_raw").insert({ summary_type: type, garmin_user: item.userId ?? null, payload: item });

      if (type === "deregistrations") {
        if (athleteId) await forgetGarmin(athleteId);
        continue;
      }
      if (!athleteId) continue; // Unknown or disconnected Garmin user: keep raw only.

      // An activity edited in Garmin Connect arrives as manuallyUpdatedActivities with the same fields.
      if (type === "activities" || type === "manuallyUpdatedActivities") {
        item = item as Summary;
        const start = num(item.startTimeInSeconds);
        const externalId = String(item.summaryId ?? item.activityId ?? "");
        if (!start || !externalId) continue;
        await admin.from("activities").upsert(
          {
            athlete_id: athleteId,
            source: "garmin",
            external_id: externalId,
            sport: typeof item.activityType === "string" ? item.activityType.toLowerCase() : null,
            start_time: new Date(start * 1000).toISOString(),
            duration_s: num(item.durationInSeconds),
            distance_m: num(item.distanceInMeters),
            avg_hr: num(item.averageHeartRateInBeatsPerMinute),
            max_hr: num(item.maxHeartRateInBeatsPerMinute),
            ...present({
              name: typeof item.activityName === "string" ? item.activityName.slice(0, 200) : null,
              calories: num(item.activeKilocalories),
              elevation_gain_m: num(item.totalElevationGainInMeters),
              elevation_loss_m: num(item.totalElevationLossInMeters),
              avg_speed_mps: num(item.averageSpeedInMetersPerSecond),
              max_speed_mps: num(item.maxSpeedInMetersPerSecond),
              avg_power: num(item.averagePowerInWatts),
              max_power: num(item.maxPowerInWatts),
              avg_cadence: num(item.averageRunCadenceInStepsPerMinute) ?? num(item.averageBikeCadenceInRoundsPerMinute),
              device: typeof item.deviceName === "string" ? item.deviceName.slice(0, 100) : null,
            }),
            raw: item,
          },
          { onConflict: "source,external_id" },
        );
        const { data: saved } = await admin.from("activities").select("id").eq("source", "garmin").eq("external_id", externalId).maybeSingle();
        // The same session from the Apple Watch (or elsewhere): merge into one record.
        const keptId = saved ? await mergeIfDuplicate(admin, saved.id).catch(() => saved.id) : null;
        if (keptId) await linkPlannedWorkout(admin, keptId);
      } else {
        const fields = wellnessFields(type, item);
        const date = typeof item.calendarDate === "string" ? item.calendarDate : null;
        if (!fields || !date || !Object.keys(present(fields)).length) continue;
        await admin.from("daily_wellness").upsert(
          { athlete_id: athleteId, date, source: "garmin", ...present(fields) },
          { onConflict: "athlete_id,date,source" },
        );
      }

      await admin
        .from("device_connections")
        .update({ last_synced_at: new Date().toISOString() })
        .eq("athlete_id", athleteId)
        .eq("source", "garmin");
      touched.add(athleteId);
    }
  }
  return touched;
}
