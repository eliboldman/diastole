"use server";

import { revalidatePath } from "next/cache";

import { createClient, requireCoach } from "@/lib/supabase/server";

/** The coach marks a private note as talked about, or not a concern. */
export async function decideSafetyNote(id: string, status: "talked" | "dismissed"): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireCoach();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "Note not found." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("decide_safety_note", { p_id: id, p_status: status });
  if (error || data) return { ok: false, error: (data as string | null) ?? "Couldn't save that." };
  revalidatePath("/dashboard");
  revalidatePath("/athlete/[id]", "page");
  return { ok: true };
}
