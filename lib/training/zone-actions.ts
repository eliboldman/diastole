"use server";

import { revalidatePath } from "next/cache";

import { createClient, requireCoach } from "@/lib/supabase/server";
import { ZONE_COLUMNS, type RelZones } from "@/lib/workouts/relative";
import { rescaleUpcoming } from "@/lib/workouts/rescale";

import type { ZoneKey } from "./zone-suggest";

const KEYS: ZoneKey[] = ["ftp_w", "threshold_speed_mps", "max_hr"];
const LIMITS: Record<ZoneKey, [number, number]> = { ftp_w: [50, 600], threshold_speed_mps: [1, 10], max_hr: [120, 230] };
const UUID = /^[0-9a-f-]{36}$/i;

function valid(athleteId: string, key: ZoneKey, value: number) {
  return UUID.test(athleteId) && KEYS.includes(key) && Number.isFinite(value) && value >= LIMITS[key][0] && value <= LIMITS[key][1];
}

/** Use a suggested zone: save it, then re-work the athlete's upcoming unsent workouts to match. */
export async function applyZoneSuggestion(athleteId: string, key: ZoneKey, value: number): Promise<{ ok: boolean; message: string }> {
  await requireCoach();
  if (!valid(athleteId, key, value)) return { ok: false, message: "That number is out of range." };
  const supabase = await createClient(); // row-level security: only this coach's athletes
  const { data: before } = await supabase.from("athlete_zones").select(ZONE_COLUMNS).eq("athlete_id", athleteId).maybeSingle();
  const v = key === "threshold_speed_mps" ? Math.round(value * 1000) / 1000 : Math.round(value);
  const { error } = await supabase.from("athlete_zones").upsert({ athlete_id: athleteId, [key]: v, updated_at: new Date().toISOString() }, { onConflict: "athlete_id" });
  if (error) return { ok: false, message: "Couldn't save it. Try again." };
  const after = { ...((before as RelZones) ?? {}), [key]: v } as RelZones;
  const note = await rescaleUpcoming(supabase, athleteId, before as RelZones, after);
  revalidatePath(`/athlete/${athleteId}`);
  revalidatePath("/dashboard");
  return { ok: true, message: `Saved.${note ? ` ${note}` : ""}` };
}

/** Not now: remember the value, and only suggest this zone again for a higher number. */
export async function dismissZoneSuggestion(athleteId: string, key: ZoneKey, value: number): Promise<{ ok: boolean }> {
  await requireCoach();
  if (!valid(athleteId, key, value)) return { ok: false };
  const supabase = await createClient();
  const { data: row } = await supabase.from("athlete_zones").select("dismissed").eq("athlete_id", athleteId).maybeSingle();
  const dismissed = { ...((row?.dismissed as Record<string, number> | null) ?? {}), [key]: value };
  const { error } = row
    ? await supabase.from("athlete_zones").update({ dismissed }).eq("athlete_id", athleteId)
    : await supabase.from("athlete_zones").insert({ athlete_id: athleteId, dismissed });
  revalidatePath(`/athlete/${athleteId}`);
  revalidatePath("/dashboard");
  return { ok: !error };
}
