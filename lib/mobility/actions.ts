"use server";

import { revalidatePath } from "next/cache";

import { cleanAnswers, overall, score } from "@/lib/mobility/screen";
import { createClient, requireUser } from "@/lib/supabase/server";

type Result = { ok: true; id: string } | { ok: false; error: string };

/** Save a finished mobility screen for the signed-in athlete. */
export async function saveScreen(raw: unknown): Promise<Result> {
  const me = await requireUser();
  const answers = cleanAnswers(raw);
  if (!answers) return { ok: false, error: "Finish every test first." };
  const today = new Date().toLocaleDateString("en-CA", { timeZone: me.timezone });
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mobility_screens")
    .insert({ athlete_id: me.id, taken_on: today, answers, score: overall(score(answers)) })
    .select("id")
    .single();
  if (error) return { ok: false, error: "Couldn't save your results." };
  revalidatePath("/recovery");
  revalidatePath("/recovery/mobility");
  return { ok: true, id: data.id };
}

/** Delete one of the athlete's own screens (a mistaken entry). */
export async function deleteScreen(id: string): Promise<{ ok: boolean }> {
  await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.from("mobility_screens").delete().eq("id", id);
  revalidatePath("/recovery/mobility");
  return { ok: !error };
}
