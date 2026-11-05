"use server";

import { revalidatePath } from "next/cache";

import { normalizeLook } from "@/lib/avatar/look";
import { createClient, requireUser } from "@/lib/supabase/server";

const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Coach sets an athlete's goal race and current training block (blank clears). */
export async function setGoals(athleteId: string, g: { race_name: string; race_date: string; block_name: string; block_ends: string }) {
  await requireUser();
  if (!UUID.test(athleteId)) return { ok: false as const, error: "Unknown athlete." };
  const clean = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max) || null;
  const supabase = await createClient();
  const { error } = await supabase.from("athlete_goals").upsert({
    athlete_id: athleteId,
    race_name: clean(g.race_name, 80),
    race_date: DATE.test(g.race_date) ? g.race_date : null,
    block_name: clean(g.block_name, 60),
    block_ends: DATE.test(g.block_ends) ? g.block_ends : null,
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false as const, error: "Couldn't save that." };
  revalidatePath(`/profile/${athleteId}`);
  return { ok: true as const };
}

/** Save my avatar (validated: only known part ids and clamped sliders are stored). */
export async function saveLook(raw: unknown) {
  const me = await requireUser();
  const look = normalizeLook(raw);
  const supabase = await createClient();
  const { error } = await supabase.from("avatars").upsert({ athlete_id: me.id, look, updated_at: new Date().toISOString() });
  return error ? { ok: false as const, error: "Couldn't save. Check your connection." } : { ok: true as const };
}

/**
 * Save the muscles worked for a workout (athlete or coach). Pass null to go back to the estimate.
 * "reviewed" marks it confirmed so the Today prompt stops asking.
 */
export async function saveStrain(activityId: string, strain: Record<string, number> | null, reviewed = true) {
  await requireUser();
  if (!UUID.test(activityId)) return { ok: false as const, error: "Unknown workout." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_activity_strain", { p_activity: activityId, p_custom: strain, p_reviewed: reviewed });
  if (error) return { ok: false as const, error: "Couldn't save that." };
  if (data) return { ok: false as const, error: String(data) };
  revalidatePath(`/activity/${activityId}`);
  return { ok: true as const };
}
