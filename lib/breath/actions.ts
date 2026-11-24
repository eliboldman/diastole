"use server";

import { revalidatePath } from "next/cache";

import { insertBreath, insertHold, type BreathInput, type SaveResult } from "@/lib/breath/save";
import { createClient, requireUser } from "@/lib/supabase/server";

/** Save a finished breathing session (or a pace finder, which also sets the athlete's pace). */
export async function saveBreath(input: BreathInput): Promise<SaveResult> {
  const me = await requireUser();
  const res = await insertBreath(await createClient(), me.id, me.timezone, input);
  if (res.ok) revalidatePath("/recovery/breathe");
  return res;
}

/** Save a seated CO2 hold check. */
export async function saveHold(seconds: number): Promise<SaveResult> {
  const me = await requireUser();
  const res = await insertHold(await createClient(), me.id, me.timezone, seconds);
  if (res.ok) revalidatePath("/recovery/breathe");
  return res;
}

/** Delete one of the athlete's own holds (a mistaken entry). */
export async function deleteHold(id: string): Promise<{ ok: boolean }> {
  await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.from("breath_holds").delete().eq("id", id);
  revalidatePath("/recovery/breathe");
  return { ok: !error };
}
