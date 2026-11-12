"use server";

import { STORE_STICKERS, type Sticker } from "@/lib/pod-stickers";
import { createClient, requireUser } from "@/lib/supabase/server";

/** The Grit store stickers the signed-in person owns (for their sticker sheet). */
export async function myStoreStickers(): Promise<Sticker[]> {
  const me = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase.from("grit_items").select("item_id").eq("athlete_id", me.id).like("item_id", "sticker:%");
  const owned = new Set((data ?? []).map((r) => String(r.item_id).slice(8)));
  return STORE_STICKERS.filter((s) => owned.has(s.key));
}
