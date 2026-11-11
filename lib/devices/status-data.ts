import type { SupabaseClient } from "@supabase/supabase-js";

import { watchStatus, type DeviceRow, type WatchStatus, type WorkoutRow } from "./status";

/** Watch status for each athlete (row-level security limits this to the coach's own athletes). */
export async function getWatchStatuses(supabase: SupabaseClient, athleteIds: string[]): Promise<Map<string, WatchStatus>> {
  const out = new Map<string, WatchStatus>();
  if (!athleteIds.length) return out;
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [{ data: devices }, { data: upcoming }, { data: stuck }, { data: icu }] = await Promise.all([
    supabase.from("device_connections").select("athlete_id, source, connected_at, last_synced_at").in("athlete_id", athleteIds),
    supabase
      .from("planned_workouts")
      .select("athlete_id, scheduled_date, status, external_id, sent_at, deleted_at, removal_status")
      .in("athlete_id", athleteIds)
      .neq("sport", "strength") // strength isn't sent to watches the same way (Apple: in-app only)
      .is("deleted_at", null)
      .in("status", ["approved", "sent"])
      .gte("scheduled_date", today),
    supabase
      .from("planned_workouts")
      .select("athlete_id, scheduled_date, status, external_id, sent_at, deleted_at, removal_status")
      .in("athlete_id", athleteIds)
      .eq("removal_status", "failed")
      .gte("deleted_at", monthAgo),
    supabase.from("intervals_connections").select("athlete_id, last_error, dirty_at, pushed_at").in("athlete_id", athleteIds),
  ]);
  for (const id of athleteIds) {
    const d = (devices ?? []).find((x) => x.athlete_id === id);
    const device: DeviceRow = d ? { source: d.source as "garmin" | "apple", connected_at: d.connected_at, last_synced_at: d.last_synced_at } : null;
    const workouts = [...(upcoming ?? []), ...(stuck ?? [])].filter((w) => w.athlete_id === id) as (WorkoutRow & { athlete_id: string })[];
    const intervals = (icu ?? []).find((x) => x.athlete_id === id) ?? null;
    out.set(id, watchStatus({ device, workouts, intervals, today }));
  }
  return out;
}
