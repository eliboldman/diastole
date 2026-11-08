import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { fillsFor, isDuplicate, type ActLite } from "@/lib/activity/dupes";

// Merging the same session from two sources into one record. Runs with the service role right
// after a new activity is stored. The record kept is the better source (Garmin > Apple/history >
// upload), unless the other one already has a check-in or comments, which are never thrown away.
// Gaps on the kept record are filled from the other; the other is set aside in activity_merges
// so the athlete can undo.

const RANK: Record<string, number> = { garmin: 3, apple: 2, garmin_export: 2, upload: 1 };

async function hasSocial(admin: SupabaseClient, id: string) {
  const [{ count: c }, { count: p }] = await Promise.all([
    admin.from("workout_checkins").select("activity_id", { count: "exact", head: true }).eq("activity_id", id),
    admin.from("pod_props").select("id", { count: "exact", head: true }).eq("activity_id", id),
  ]);
  return (c ?? 0) + (p ?? 0) > 0;
}

/** Merge a just-stored activity if it duplicates another. Returns the id that remains. */
export async function mergeIfDuplicate(admin: SupabaseClient, newId: string): Promise<string> {
  const { data: fresh } = await admin.from("activities").select("*").eq("id", newId).maybeSingle();
  if (!fresh) return newId;

  // Seen before: a set-aside copy re-synced (drop it again), or the athlete chose to keep both.
  const { data: prior } = await admin.from("activity_merges").select("kept_id, undone_at").eq("source", fresh.source).eq("external_id", fresh.external_id).maybeSingle();
  if (prior?.undone_at) return newId;
  if (prior) {
    await admin.from("activities").delete().eq("id", newId);
    return prior.kept_id;
  }

  const t = Date.parse(fresh.start_time);
  const { data: near } = await admin
    .from("activities")
    .select("*")
    .eq("athlete_id", fresh.athlete_id)
    .neq("id", newId)
    .gte("start_time", new Date(t - 3 * 60_000).toISOString())
    .lte("start_time", new Date(t + 3 * 60_000).toISOString())
    .limit(5);
  const other = (near ?? []).find((o) => isDuplicate(fresh as ActLite, o as ActLite));
  if (!other) return newId;

  // Which one stays.
  let keep = other;
  let drop = fresh;
  if ((RANK[fresh.source] ?? 0) > (RANK[other.source] ?? 0) && !(await hasSocial(admin, other.id))) {
    keep = fresh;
    drop = other;
  }
  if (keep.id !== fresh.id && drop.id !== fresh.id) return newId;

  const fills = fillsFor(keep, drop);
  const previous = Object.fromEntries(Object.keys(fills).map((k) => [k, keep[k] ?? null]));
  const [{ data: keepDetail }, { data: dropDetail }] = await Promise.all([
    admin.from("activity_details").select("activity_id").eq("activity_id", keep.id).maybeSingle(),
    admin.from("activity_details").select("activity_id").eq("activity_id", drop.id).maybeSingle(),
  ]);
  const moveDetails = Boolean(dropDetail && !keepDetail);

  const { error } = await admin.from("activity_merges").insert({
    athlete_id: keep.athlete_id,
    kept_id: keep.id,
    source: drop.source,
    external_id: drop.external_id,
    row: drop,
    filled: previous,
    moved_details: moveDetails,
  });
  if (error) return newId; // e.g. a race with another sync: leave both
  if (moveDetails) await admin.from("activity_details").update({ activity_id: keep.id }).eq("activity_id", drop.id);
  if (Object.keys(fills).length) await admin.from("activities").update(fills).eq("id", keep.id);
  // A planned-workout link moves over too.
  if (!keep.planned_workout_id && drop.planned_workout_id) await admin.from("activities").update({ planned_workout_id: drop.planned_workout_id }).eq("id", keep.id);
  await admin.from("activities").delete().eq("id", drop.id);
  return keep.id;
}

/** Put a set-aside copy back as its own activity and undo what the merge filled in. */
export async function restoreMerge(admin: SupabaseClient, m: { id: string; kept_id: string; row: Record<string, unknown>; filled: Record<string, unknown>; moved_details: boolean }) {
  const { error } = await admin.from("activities").insert(m.row);
  if (error) return error.message;
  if (m.moved_details) await admin.from("activity_details").update({ activity_id: m.row.id as string }).eq("activity_id", m.kept_id);
  if (Object.keys(m.filled).length) await admin.from("activities").update(m.filled).eq("id", m.kept_id);
  await admin.from("activity_merges").update({ undone_at: new Date().toISOString() }).eq("id", m.id);
  return null;
}
