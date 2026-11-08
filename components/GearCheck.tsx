import { cleanCloset, defaultShoe, INDOOR_RIDE } from "@/lib/closet";
import { createClient } from "@/lib/supabase/server";

import Spotlight from "@/components/Spotlight";
import { TIPS } from "@/lib/discovery";
import GearCheckList, { type GearAsk } from "@/components/GearCheckList";

const RUN = /run|treadmill|trail|track/i;
const RIDE = /cycl|bik|ride/i;

/**
 * "Which shoes?" on Today: the last week's runs (and outdoor rides) that aren't tagged yet, when the
 * athlete has more than one pair (or bike) to choose from. One tap tags each. Hidden otherwise.
 */
export default async function GearCheck({ athleteId, today, tipSeen = true }: { athleteId: string; today: string; tipSeen?: boolean }) {
  const supabase = await createClient();
  const { data: gearRow } = await supabase.from("athlete_gear").select("gear").eq("athlete_id", athleteId).maybeSingle();
  const closet = cleanCloset(gearRow?.gear);
  const shoes = closet.shoes.filter((s) => !s.retired);
  const bikes = closet.bikes;
  if (shoes.length < 2 && bikes.length < 2) return null;

  const since = new Date(Date.parse(`${today}T12:00:00Z`) - 7 * 86_400_000).toISOString();
  const [{ data: acts }, { data: shoePicks }, { data: bikePicks }] = await Promise.all([
    supabase.from("activities").select("id, name, sport, start_time, distance_m").eq("athlete_id", athleteId).gte("start_time", since).order("start_time", { ascending: false }).limit(40),
    supabase.from("activity_shoes").select("activity_id").eq("athlete_id", athleteId).gte("created_at", since),
    supabase.from("activity_bikes").select("activity_id").eq("athlete_id", athleteId).gte("created_at", since),
  ]);
  const tagged = new Set([...(shoePicks ?? []), ...(bikePicks ?? [])].map((p) => p.activity_id));
  const def = defaultShoe(closet);

  const asks: GearAsk[] = [];
  for (const a of acts ?? []) {
    if (tagged.has(a.id) || !(Number(a.distance_m) > 0)) continue;
    const sport = a.sport ?? "";
    if (RUN.test(sport) && shoes.length >= 2) {
      asks.push({ id: a.id, gear: "shoe", name: a.name || "Run", start: a.start_time, km: Number(a.distance_m) / 1000, options: shoes.map((s) => ({ id: s.id, model: s.model, isDefault: s.id === def?.id })) });
    } else if (RIDE.test(sport) && !INDOOR_RIDE.test(sport) && bikes.length >= 2) {
      asks.push({ id: a.id, gear: "bike", name: a.name || "Ride", start: a.start_time, km: Number(a.distance_m) / 1000, options: bikes.map((b) => ({ id: b.id, model: b.model, isDefault: false })) });
    }
    if (asks.length >= 3) break;
  }
  if (!asks.length) return null;
  return (
    <>
      {!tipSeen && <Spotlight tip={TIPS.gear} seen={false} />}
      <GearCheckList asks={asks} />
    </>
  );
}
