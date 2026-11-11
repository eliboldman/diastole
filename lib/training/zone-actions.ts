"use server";

import { revalidatePath } from "next/cache";

import { createClient, requireCoach } from "@/lib/supabase/server";
import { ZONE_COLUMNS, type RelZones } from "@/lib/workouts/relative";
import { rescaleUpcoming } from "@/lib/workouts/rescale";

import type { ZoneKey } from "./zone-suggest";

const KEYS: ZoneKey[] = ["ftp_w", "threshold_speed_mps", "max_hr", "css_sec_per_100m"];
const LIMITS: Record<ZoneKey, [number, number]> = { ftp_w: [50, 600], threshold_speed_mps: [1, 10], max_hr: [120, 230], css_sec_per_100m: [40, 300] };
const UUID = /^[0-9a-f-]{36}$/i;

function valid(athleteId: string, key: ZoneKey, value: number) {
  return UUID.test(athleteId) && KEYS.includes(key) && Number.isFinite(value) && value >= LIMITS[key][0] && value <= LIMITS[key][1];
}

type TestOpts = { testActivityId?: string; thresholdHr?: number };

/** Marks a threshold test as settled (applied or not now), so it isn't offered again. */
async function settleTest(supabase: Awaited<ReturnType<typeof createClient>>, athleteId: string, activityId: string) {
  const { data: row } = await supabase.from("athlete_zones").select("dismissed").eq("athlete_id", athleteId).maybeSingle();
  const dismissed = { ...((row?.dismissed as Record<string, number> | null) ?? {}), [`test:${activityId}`]: 1 };
  if (row) await supabase.from("athlete_zones").update({ dismissed }).eq("athlete_id", athleteId);
  else await supabase.from("athlete_zones").insert({ athlete_id: athleteId, dismissed });
}

/** Use a suggested zone: save it, then re-work the athlete's upcoming unsent workouts to match. */
export async function applyZoneSuggestion(athleteId: string, key: ZoneKey, value: number, opts: TestOpts = {}): Promise<{ ok: boolean; message: string }> {
  await requireCoach();
  if (!valid(athleteId, key, value)) return { ok: false, message: "That number is out of range." };
  if (opts.testActivityId && !UUID.test(opts.testActivityId)) return { ok: false, message: "Unknown test." };
  const supabase = await createClient(); // row-level security: only this coach's athletes
  const { data: before } = await supabase.from("athlete_zones").select(ZONE_COLUMNS).eq("athlete_id", athleteId).maybeSingle();
  const v = key === "threshold_speed_mps" ? Math.round(value * 1000) / 1000 : key === "css_sec_per_100m" ? Math.round(value * 10) / 10 : Math.round(value);
  // A run test also gives threshold heart rate, from the same 20 minutes.
  const hr = key === "threshold_speed_mps" && opts.thresholdHr && opts.thresholdHr >= 100 && opts.thresholdHr <= 220 ? Math.round(opts.thresholdHr) : null;
  const patch: Record<string, number> = { [key]: v, ...(hr ? { threshold_hr: hr } : {}) };
  const { error } = await supabase.from("athlete_zones").upsert({ athlete_id: athleteId, ...patch, updated_at: new Date().toISOString() }, { onConflict: "athlete_id" });
  if (error) return { ok: false, message: "Couldn't save it. Try again." };
  if (opts.testActivityId) await settleTest(supabase, athleteId, opts.testActivityId);
  const after = { ...((before as RelZones) ?? {}), ...patch } as RelZones;
  const note = await rescaleUpcoming(supabase, athleteId, before as RelZones, after);
  revalidatePath(`/athlete/${athleteId}`);
  revalidatePath("/dashboard");
  return { ok: true, message: `Saved.${note ? ` ${note}` : ""}` };
}

/** Not now: remember the value, and only suggest this zone again for a higher number. */
export async function dismissZoneSuggestion(athleteId: string, key: ZoneKey, value: number, opts: TestOpts = {}): Promise<{ ok: boolean }> {
  await requireCoach();
  if (!valid(athleteId, key, value)) return { ok: false };
  const supabase = await createClient();
  if (opts.testActivityId) {
    // A test result: settle that test only; training suggestions keep their own floor.
    if (!UUID.test(opts.testActivityId)) return { ok: false };
    await settleTest(supabase, athleteId, opts.testActivityId);
    revalidatePath(`/athlete/${athleteId}`);
    revalidatePath("/dashboard");
    return { ok: true };
  }
  const { data: row } = await supabase.from("athlete_zones").select("dismissed").eq("athlete_id", athleteId).maybeSingle();
  const dismissed = { ...((row?.dismissed as Record<string, number> | null) ?? {}), [key]: value };
  const { error } = row
    ? await supabase.from("athlete_zones").update({ dismissed }).eq("athlete_id", athleteId)
    : await supabase.from("athlete_zones").insert({ athlete_id: athleteId, dismissed });
  revalidatePath(`/athlete/${athleteId}`);
  revalidatePath("/dashboard");
  return { ok: !error };
}
