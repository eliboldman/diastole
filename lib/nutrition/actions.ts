"use server";

import { revalidatePath } from "next/cache";

import { cleanPerKg } from "@/lib/fuel/meals";
import { createClient, requireStaff } from "@/lib/supabase/server";

export type GoalsResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * Save an athlete's nutrition goals (g/kg ranges by training day) and the note shown on their Fuel
 * page. Row-level security: only that athlete's coach or team dietitian can write.
 */
export async function saveNutritionGoals(athleteId: string, perKg: unknown, note: string): Promise<GoalsResult> {
  const me = await requireStaff();
  const clean = cleanPerKg(perKg);
  const text = note.replace(/\r\n/g, "\n").trim().slice(0, 800) || null;
  const supabase = await createClient();
  const { error } = await supabase
    .from("nutrition_goals")
    .upsert({ athlete_id: athleteId, per_kg: clean, note: text, updated_by: me.id, updated_at: new Date().toISOString() });
  if (error) return { ok: false, error: error.code === "42501" ? "You don't have access to this athlete." : error.message };
  revalidatePath(`/nutrition/${athleteId}`);
  revalidatePath("/nutrition");
  revalidatePath("/fuel");
  const changed = Object.values(clean).reduce((n, lv) => n + Object.keys(lv ?? {}).length, 0);
  return { ok: true, message: changed ? `Saved. ${changed} custom range${changed === 1 ? "" : "s"}; everything else uses the defaults.` : "Saved. Using the default ranges." };
}
