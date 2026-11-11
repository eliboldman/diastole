import type { SupabaseClient } from "@supabase/supabase-js";

import { cleanCloset, packFor } from "@/lib/closet";
import { getRaceTools, planFor, type RaceRow } from "@/lib/fuel/race-data";
import { createAdminClient } from "@/lib/supabase/server";
import { athleteWeather } from "@/lib/weather-data";

import { cleanMaster, cleanPackState, packList, timeline, type Item, type Reminder, type Travel } from "./pack";

const DAY = 86_400_000;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);

export type PackView = {
  items: Item[];
  checked: Record<string, boolean>;
  travel: Travel;
  waterC: number | null;
  reminders: (Reminder & { date: string })[];
  weatherKnown: boolean;
};

/** One race's packing list. The caller has already loaded the race (row-level security). */
export async function getPackView(supabase: SupabaseClient, race: RaceRow & { pack?: unknown }, units: "mi" | "km"): Promise<PackView> {
  const state = cleanPackState(race.pack);
  const admin = createAdminClient();
  const [{ data: gearRow }, weather, tools, { data: prof }] = await Promise.all([
    supabase.from("athlete_gear").select("gear").eq("athlete_id", race.athlete_id).maybeSingle(),
    athleteWeather(supabase, race.athlete_id, race.race_date),
    getRaceTools(race.athlete_id),
    admin.from("profiles").select("coach_id").eq("id", race.athlete_id).maybeSingle(),
  ]);
  const { data: master } = prof?.coach_id ? await admin.from("coach_pack_lists").select("items").eq("coach_id", prof.coach_id).maybeSingle() : { data: null };
  const closet = cleanCloset(gearRow?.gear);
  const tri = race.sport === "tri";
  const legs: ("bike" | "run")[] = tri ? ["bike", "run"] : race.sport === "bike" ? ["bike"] : race.sport === "run" || race.sport === "other" ? ["run"] : [];
  const gear = legs.flatMap((leg) => packFor({ sport: leg, title: `${race.name} race day`, description: leg === "bike" && (tri || /\btt\b|time trial/i.test(race.name)) ? "race pace" : "race" }, closet, {}).map((item) => ({ leg, item })));
  const fuel = planFor(race, tools);
  const items = packList({ sport: race.sport, distanceKm: race.distance_km ? Number(race.distance_km) : null, minutes: fuel?.minutes ?? (race.goal_seconds ? race.goal_seconds / 60 : null), weather: weather.day, waterC: state.waterC, travel: state.travel, gear, fuel, master: cleanMaster(master?.items), extra: state.extra, units });
  return {
    items,
    checked: state.checked,
    travel: state.travel,
    waterC: state.waterC,
    reminders: timeline(race.sport, state.travel).map((r) => ({ ...r, date: addDays(race.race_date, -r.daysOut) })),
    weatherKnown: Boolean(weather.day),
  };
}
