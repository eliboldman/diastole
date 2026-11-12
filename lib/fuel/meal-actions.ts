"use server";

import { revalidatePath } from "next/cache";

import { cleanEstimate, confirmItem, SCALES, totals, type LoggedItem } from "@/lib/fuel/meals";
import { localDateOf, resolveEatenAt, type EatenAt } from "@/lib/fuel/eaten";
import { createClient, requireUser } from "@/lib/supabase/server";

type Result = { ok: true; id?: string } | { ok: false; error: string };
const UUID = /^[0-9a-f-]{36}$/i;

function refresh() {
  revalidatePath("/fuel");
  revalidatePath("/me");
}

/** Recomputes each confirmed food from its estimate range and scale, so totals can't be typed in. */
function confirmed(input: { name: string; portion: string; carbs: [number, number]; protein: [number, number]; fat: [number, number]; scale: number }[]): LoggedItem[] {
  return input.slice(0, 20).flatMap((x) => {
    const [item] = cleanEstimate([x]);
    const scale = Number(x?.scale);
    return item ? [confirmItem(item, SCALES.includes(scale as (typeof SCALES)[number]) ? scale : 1)] : [];
  });
}

/** Save a meal the athlete confirmed. Always for the signed-in athlete (row-level security too). */
export async function saveMeal(input: {
  label: string;
  items: { name: string; portion: string; carbs: [number, number]; protein: [number, number]; fat: [number, number]; scale: number }[];
  source: "photo" | "text" | "barcode";
  note?: string;
  eaten?: EatenAt; // when it was eaten, for meals logged afterwards; now when missing
}): Promise<Result> {
  const me = await requireUser();
  const items = confirmed(input.items ?? []);
  if (!items.length) return { ok: false, error: "Keep at least one food." };
  const when = resolveEatenAt(input.eaten, me.timezone, Date.now());
  if (!when.ok) return { ok: false, error: when.error };
  const t = totals(items);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meal_logs")
    .insert({
      athlete_id: me.id,
      local_date: localDateOf(when.ms, me.timezone),
      eaten_at: new Date(when.ms).toISOString(),
      label: input.label.replace(/\s+/g, " ").trim().slice(0, 60) || null,
      items,
      carbs_g: t.carbs_g,
      protein_g: t.protein_g,
      fat_g: t.fat_g,
      source: input.source === "text" || input.source === "barcode" ? input.source : "photo",
      note: input.note?.replace(/\s+/g, " ").trim().slice(0, 280) || null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: "Couldn't save that meal." };
  refresh();
  return { ok: true, id: data.id };
}

/** Log one of my earlier meals again, for today. */
export async function relogMeal(id: string): Promise<Result> {
  const me = await requireUser();
  if (!UUID.test(id)) return { ok: false, error: "Unknown meal." };
  const supabase = await createClient();
  const { data: m } = await supabase.from("meal_logs").select("label, items, carbs_g, protein_g, fat_g").eq("id", id).eq("athlete_id", me.id).maybeSingle();
  if (!m) return { ok: false, error: "Unknown meal." };
  const { data, error } = await supabase
    .from("meal_logs")
    .insert({
      athlete_id: me.id,
      local_date: new Date().toLocaleDateString("en-CA", { timeZone: me.timezone }),
      label: m.label,
      items: m.items,
      carbs_g: m.carbs_g,
      protein_g: m.protein_g,
      fat_g: m.fat_g,
      source: "repeat",
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: "Couldn't log that meal." };
  refresh();
  return { ok: true, id: data.id };
}

/** Move a logged meal to when it was actually eaten (its day follows the new time). */
export async function setMealTime(id: string, eaten: EatenAt): Promise<Result> {
  const me = await requireUser();
  if (!UUID.test(id)) return { ok: false, error: "Unknown meal." };
  const when = resolveEatenAt(eaten, me.timezone, Date.now());
  if (!when.ok) return { ok: false, error: when.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meal_logs")
    .update({ eaten_at: new Date(when.ms).toISOString(), local_date: localDateOf(when.ms, me.timezone) })
    .eq("id", id)
    .eq("athlete_id", me.id)
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "Couldn't change the time." };
  refresh();
  return { ok: true, id };
}

export async function deleteMeal(id: string): Promise<Result> {
  const me = await requireUser();
  if (!UUID.test(id)) return { ok: false, error: "Unknown meal." };
  const supabase = await createClient();
  const { error } = await supabase.from("meal_logs").delete().eq("id", id).eq("athlete_id", me.id);
  if (error) return { ok: false, error: "Couldn't remove that meal." };
  refresh();
  return { ok: true };
}

/** Body weight for targets, in the athlete's units (lb when they use miles). */
export async function saveWeight(value: number, unit: "kg" | "lb"): Promise<Result> {
  const me = await requireUser();
  const kg = unit === "lb" ? Number(value) * 0.45359237 : Number(value);
  if (!Number.isFinite(kg) || kg < 25 || kg > 250) return { ok: false, error: unit === "lb" ? "Enter a weight between 55 and 550 lb." : "Enter a weight between 25 and 250 kg." };
  const supabase = await createClient();
  const { error } = await supabase.from("athlete_body").upsert({ athlete_id: me.id, weight_kg: Math.round(kg * 10) / 10, updated_at: new Date().toISOString() });
  if (error) return { ok: false, error: "Couldn't save your weight." };
  refresh();
  return { ok: true };
}
