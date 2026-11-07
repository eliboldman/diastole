"use server";

import { revalidatePath } from "next/cache";

import { isLayoutPage, resolveLayout, type PageLayout } from "@/lib/layout-prefs";
import { createClient, requireUser } from "@/lib/supabase/server";

/** Save one page's layout on the account (other pages' layouts are kept). */
export async function saveLayout(page: string, layout: PageLayout | null) {
  if (!isLayoutPage(page)) return { ok: false as const };
  const me = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("layout").eq("id", me.id).single();
  const all = { ...((data?.layout as Record<string, unknown>) ?? {}) };
  if (layout) all[page] = resolveLayout(page, { [page]: layout });
  else delete all[page]; // reset to the default
  const { error } = await supabase.from("profiles").update({ layout: all }).eq("id", me.id);
  if (error) return { ok: false as const };
  revalidatePath(page === "today" ? "/me" : "/account");
  return { ok: true as const };
}
