import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { asPlace, getDayWeather, type DayWeather, type Place } from "@/lib/weather";

/** An athlete's forecast for one day at their saved town (their timezone). Null outside 16 days or with no town. */
export async function athleteWeather(supabase: SupabaseClient, athleteId: string, date: string): Promise<{ place: Place | null; day: DayWeather | null }> {
  const { data: p } = await supabase.from("profiles").select("weather_location, timezone").eq("id", athleteId).maybeSingle();
  const place = asPlace(p?.weather_location);
  if (!place) return { place: null, day: null };
  return { place, day: await getDayWeather(place, date, p?.timezone || "America/Chicago") };
}
