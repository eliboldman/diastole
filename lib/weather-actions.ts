"use server";

import { requireUser, createClient } from "@/lib/supabase/server";
import { asPlace, searchPlaces, type Place } from "@/lib/weather";

/** Town search for the weather setting. */
export async function findPlaces(q: string): Promise<Place[]> {
  await requireUser();
  return searchPlaces(String(q ?? ""));
}

/** Save (or clear) where you usually train. */
export async function saveWeatherLocation(raw: unknown) {
  const me = await requireUser();
  const place = raw === null ? null : asPlace(raw);
  if (raw !== null && !place) return { ok: false as const };
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ weather_location: place }).eq("id", me.id);
  return error ? { ok: false as const } : { ok: true as const };
}

/** The heat/altitude opt-in. */
export async function saveAdjustConditions(on: boolean) {
  const me = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ adjust_conditions: on === true }).eq("id", me.id);
  return error ? { ok: false as const } : { ok: true as const };
}
