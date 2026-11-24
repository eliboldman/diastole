import { redirect } from "next/navigation";

import { createClient, requireUser } from "@/lib/supabase/server";

/** Quick action "Check in": your latest workout that still needs a check-in, else your latest workout. */
export default async function GoCheckin() {
  const me = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("activities")
    .select("id, workout_checkins(activity_id)")
    .eq("athlete_id", me.id)
    .gte("start_time", new Date(Date.now() - 3 * 86_400_000).toISOString())
    .gte("duration_s", 300)
    .order("start_time", { ascending: false })
    .limit(5);
  const open = (data ?? []).find((a) => !(Array.isArray(a.workout_checkins) && a.workout_checkins.length));
  const pick = open ?? data?.[0];
  redirect(pick ? `/activity/${pick.id}#checkin` : "/me");
}
