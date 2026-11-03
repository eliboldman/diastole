"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { localDate, refreshReadiness } from "@/lib/readiness/run";
import { createAdminClient, requireUser } from "@/lib/supabase/server";

import { BATCH_ACTIVITIES, BATCH_DAYS, cutoffDate, type HistoryBatch, type ImportRange } from "./history-types";

// Server side of the Garmin history import. The browser does the unzipping and parsing; these
// actions check who may import for whom, then store rows exactly like the live sync does,
// marked source = 'garmin_export', never overwriting days or activities the live sync has.

export type ImportResult = { ok: true; id: string; message?: string; counts?: Record<string, number> } | { ok: false; error: string };

async function authorize(athleteId: string) {
  const me = await requireUser();
  if (me.id === athleteId) return me;
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("coach_id, is_test").eq("id", athleteId).maybeSingle();
  if (me.role === "coach" && data?.coach_id === me.id) return me;
  throw new Error("You can only import history for yourself or your own athletes.");
}

export async function startImport(athleteId: string, range: ImportRange): Promise<ImportResult> {
  try {
    const me = await authorize(athleteId);
    if (range !== "12m" && range !== "all") return { ok: false, error: "Pick a range." };
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("history_imports")
      .insert({ athlete_id: athleteId, started_by: me.id, range, status: "running" })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data.id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

const num = z.number().finite().nullable().optional();
const Day = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hrv_ms: num,
  resting_hr: num,
  sleep_seconds: num,
  sleep_score: num,
  stress_avg: num,
  body_battery_high: num,
  body_battery_low: num,
  vo2_max: num,
  training_readiness: num,
});
const Activity = z.object({
  id: z.string().min(1).max(40),
  sport: z.string().max(60).nullable(),
  start_time: z.string().datetime(),
  duration_s: num,
  distance_m: num,
  avg_hr: num,
  max_hr: num,
});
const Batch = z.object({ days: z.array(Day).max(BATCH_DAYS), activities: z.array(Activity).max(BATCH_ACTIVITIES) });

const intOrNull = (v: number | null | undefined) => (v === null || v === undefined ? null : Math.round(v));

export async function importBatch(importId: string, athleteId: string, batch: HistoryBatch): Promise<ImportResult> {
  try {
    await authorize(athleteId);
    const parsed = Batch.safeParse(batch);
    if (!parsed.success) return { ok: false, error: "That export has data in a format Diastole doesn't recognise." };
    const admin = createAdminClient();
    const { data: job } = await admin.from("history_imports").select("id, athlete_id, range, status, counts").eq("id", importId).single();
    if (!job || job.athlete_id !== athleteId || job.status !== "running") return { ok: false, error: "This import is no longer running." };

    const cutoff = cutoffDate(job.range as ImportRange);
    const days = parsed.data.days.filter((d) => !cutoff || d.date >= cutoff);
    const acts = parsed.data.activities.filter((a) => !cutoff || a.start_time.slice(0, 10) >= cutoff);
    const counts: Record<string, number> = { ...(job.counts as Record<string, number>) };
    const bump = (k: string, n: number) => (counts[k] = (counts[k] ?? 0) + n);

    // ---- wellness days: skip any date the live sync already has
    if (days.length) {
      const dates = days.map((d) => d.date);
      const { data: live } = await admin
        .from("daily_wellness")
        .select("date")
        .eq("athlete_id", athleteId)
        .eq("source", "garmin")
        .in("date", dates);
      const covered = new Set((live ?? []).map((r) => r.date));
      // Merge partial rows for the same date (sleep and daily summaries come from different files).
      const merged = new Map<string, Record<string, unknown>>();
      for (const d of days) {
        if (covered.has(d.date)) continue;
        const row = merged.get(d.date) ?? { athlete_id: athleteId, date: d.date, source: "garmin_export" };
        for (const [k, v] of Object.entries(d)) if (k !== "date" && v !== null && v !== undefined) row[k] = v;
        merged.set(d.date, row);
      }
      const rows: Record<string, unknown>[] = [...merged.values()].map((r) => ({
        ...r,
        sleep_seconds: intOrNull(r.sleep_seconds as number),
        sleep_score: intOrNull(r.sleep_score as number),
        stress_avg: intOrNull(r.stress_avg as number),
        body_battery_high: intOrNull(r.body_battery_high as number),
        body_battery_low: intOrNull(r.body_battery_low as number),
        training_readiness: intOrNull(r.training_readiness as number),
        updated_at: new Date().toISOString(),
      }));
      if (rows.length) {
        // Upsert merges with partial rows from earlier batches of this same import.
        const { data: existing } = await admin
          .from("daily_wellness")
          .select("*")
          .eq("athlete_id", athleteId)
          .eq("source", "garmin_export")
          .in("date", rows.map((r) => r.date as string));
        const prior = new Map((existing ?? []).map((e) => [e.date, e]));
        const final = rows.map((r) => {
          const p = prior.get(r.date as string);
          if (!p) return r;
          const out: Record<string, unknown> = { ...p };
          for (const [k, v] of Object.entries(r)) if (v !== null && v !== undefined) out[k] = v;
          return out;
        });
        const { error } = await admin.from("daily_wellness").upsert(final, { onConflict: "athlete_id,date,source" });
        if (error) return { ok: false, error: `Saving days failed: ${error.message}` };
        bump("wellness_days", final.filter((r) => !prior.has(r.date as string)).length);
        bump("sleep_nights", rows.filter((r) => r.sleep_seconds).length);
        bump("hrv_days", rows.filter((r) => r.hrv_ms).length);
      }
      bump("days_skipped_live", covered.size);
    }

    // ---- activities: skip anything the live sync stored (same id, or same start within a minute)
    if (acts.length) {
      const { data: existing } = await admin
        .from("activities")
        .select("external_id, start_time")
        .eq("athlete_id", athleteId)
        .gte("start_time", acts.reduce((m, a) => (a.start_time < m ? a.start_time : m), acts[0].start_time))
        .lte("start_time", acts.reduce((m, a) => (a.start_time > m ? a.start_time : m), acts[0].start_time));
      const ids = new Set((existing ?? []).map((e) => e.external_id));
      const starts = (existing ?? []).map((e) => new Date(e.start_time).getTime());
      const fresh = acts.filter(
        (a) => !ids.has(a.id) && !starts.some((t) => Math.abs(t - new Date(a.start_time).getTime()) < 60_000),
      );
      if (fresh.length) {
        const { error } = await admin.from("activities").upsert(
          fresh.map((a) => ({
            athlete_id: athleteId,
            source: "garmin_export",
            external_id: a.id,
            sport: a.sport,
            start_time: a.start_time,
            duration_s: intOrNull(a.duration_s),
            distance_m: a.distance_m,
            avg_hr: a.avg_hr,
            max_hr: a.max_hr,
          })),
          { onConflict: "source,external_id", ignoreDuplicates: true },
        );
        if (error) return { ok: false, error: `Saving activities failed: ${error.message}` };
      }
      bump("activities", fresh.length);
      bump("activities_skipped", acts.length - fresh.length);
    }

    await admin.from("history_imports").update({ counts }).eq("id", importId);
    return { ok: true, id: importId, counts };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Close the import and recompute readiness so baselines use the history straight away. */
export async function finishImport(importId: string, athleteId: string, failure?: string): Promise<ImportResult> {
  try {
    await authorize(athleteId);
    const admin = createAdminClient();
    if (failure) {
      await admin.from("history_imports").update({ status: "failed", error: failure.slice(0, 500), finished_at: new Date().toISOString() }).eq("id", importId);
      return { ok: true, id: importId };
    }
    const { data: profile } = await admin.from("profiles").select("timezone").eq("id", athleteId).single();
    const today = localDate(new Date(), profile?.timezone ?? "America/Los_Angeles");
    // Today plus the last two weeks, so trend dots on the athlete page reflect the new baselines.
    for (let i = 13; i >= 0; i--) {
      const d = new Date(`${today}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() - i);
      await refreshReadiness(athleteId, d.toISOString().slice(0, 10)).catch(() => null);
    }
    const { data: job } = await admin
      .from("history_imports")
      .update({ status: "done", finished_at: new Date().toISOString() })
      .eq("id", importId)
      .select("counts")
      .single();
    revalidatePath("/me");
    revalidatePath(`/athlete/${athleteId}`);
    revalidatePath("/dashboard");
    return { ok: true, id: importId, counts: (job?.counts ?? {}) as Record<string, number> };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
