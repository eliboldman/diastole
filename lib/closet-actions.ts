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
  revalidatePath("/account");
  revalidatePath(`/athlete/${athleteId}`);
  return { ok: true as const, gear };
}
