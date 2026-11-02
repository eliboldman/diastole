import "server-only";

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
      return { sleep_seconds: num(s.durationInSeconds), sleep_score: num(score?.value) };
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

/** Drop keys whose value is null so partial summaries don't wipe values from other summary types. */
function present(o: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined));
}

export async function ingestGarminPayload(body: Record<string, Summary[]>) {
  const admin = createAdminClient();
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

    for (let item of items) {
      const athleteId = await athleteFor(item.userId);

      // Ping mode: Garmin sends a URL to fetch the data from instead of the data itself.
      if (item.callbackURL && athleteId) {
        const url = new URL(item.callbackURL);
        const res = await garminFetch(athleteId, url.pathname + url.search);
        const fetched = res.ok ? await res.json() : [];
        await ingestGarminPayload({ [type]: (Array.isArray(fetched) ? fetched : [fetched]).map((f) => ({ ...f, userId: item.userId })) });
        continue;
      }

      await admin.from("garmin_raw").insert({ summary_type: type, garmin_user: item.userId ?? null, payload: item });

      if (type === "deregistrations") {
        if (athleteId) await forgetGarmin(athleteId);
        continue;
      }
      if (!athleteId) continue; // Unknown or disconnected Garmin user: keep raw only.

      if (type === "activities") {
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
            raw: item,
          },
          { onConflict: "source,external_id" },
        );
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
    }
  }
}
