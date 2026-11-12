"use server";

import { revalidatePath } from "next/cache";

import { createClient, requireUser } from "@/lib/supabase/server";

/** Keep (or drop) a finished race's poster in your collection. Your own races only. */
export async function setPosterKept(raceId: string, kept: boolean): Promise<{ ok: boolean }> {
  const me = await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(raceId)) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.from("races").update({ poster_kept: kept }).eq("id", raceId).eq("athlete_id", me.id);
  revalidatePath("/me/posters");
  return { ok: !error };
}
