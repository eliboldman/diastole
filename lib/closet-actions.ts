"use server";

import { revalidatePath } from "next/cache";

import { cleanCloset } from "@/lib/closet";
import { createClient, requireUser } from "@/lib/supabase/server";

const UUID = /^[0-9a-f-]{36}$/i;

/** Save an athlete's closet. The athlete, or their coach (row-level security decides). */
export async function saveCloset(athleteId: string, raw: unknown) {
  await requireUser();
  if (!UUID.test(athleteId)) return { ok: false as const, error: "Unknown athlete." };
  const supabase = await createClient();
  const gear = cleanCloset(raw);
  const { error } = await supabase.from("athlete_gear").upsert({ athlete_id: athleteId, gear, updated_at: new Date().toISOString() }, { onConflict: "athlete_id" });
  if (error) return { ok: false as const, error: "Couldn't save your closet." };
  // No revalidatePath: the editor autosaves while typing and keeps its own state, and refreshing
  // the page under it reset the scroll on every keystroke. Other pages read the closet fresh.
  return { ok: true as const, gear };
}

/** Which shoes a run was in (null = back to the default pair). The athlete or their coach. */
export async function setActivityShoe(activityId: string, shoeId: string | null) {
  await requireUser();
  if (!UUID.test(activityId) || (shoeId !== null && !/^[\w-]{1,40}$/.test(shoeId))) return { ok: false as const };
  const supabase = await createClient();
  const { data: act } = await supabase.from("activities").select("athlete_id").eq("id", activityId).maybeSingle();
  if (!act) return { ok: false as const };
  const { error } = shoeId
    ? await supabase.from("activity_shoes").upsert({ activity_id: activityId, athlete_id: act.athlete_id, shoe_id: shoeId }, { onConflict: "activity_id" })
    : await supabase.from("activity_shoes").delete().eq("activity_id", activityId);
  if (error) return { ok: false as const };
  revalidatePath("/account");
  return { ok: true as const };
}

/** Which bike a ride was on (null = untagged). The athlete or their coach. */
export async function setActivityBike(activityId: string, bikeId: string | null) {
  await requireUser();
  if (!UUID.test(activityId) || (bikeId !== null && !/^[\w-]{1,40}$/.test(bikeId))) return { ok: false as const };
  const supabase = await createClient();
  const { data: act } = await supabase.from("activities").select("athlete_id").eq("id", activityId).maybeSingle();
  if (!act) return { ok: false as const };
  const { error } = bikeId
    ? await supabase.from("activity_bikes").upsert({ activity_id: activityId, athlete_id: act.athlete_id, bike_id: bikeId }, { onConflict: "activity_id" })
    : await supabase.from("activity_bikes").delete().eq("activity_id", activityId);
  if (error) return { ok: false as const };
  revalidatePath("/account");
  return { ok: true as const };
}
