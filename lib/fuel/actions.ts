"use server";

import { revalidatePath } from "next/cache";

import { asFuelMode } from "@/lib/fuel/plan";
import { createClient, requireCoach } from "@/lib/supabase/server";

/** Coach sets an athlete's fueling mode. The database checks it's their athlete. */
export async function setFuelMode(athleteId: string, mode: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireCoach();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_fuel_mode", { p_athlete: athleteId, p_mode: asFuelMode(mode) });
  if (error || data) return { ok: false, error: (data as string | null) ?? "Couldn't save that." };
  revalidatePath(`/athlete/${athleteId}`);
  revalidatePath("/fuel");
  return { ok: true };
}
