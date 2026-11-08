"use server";

import { cookies } from "next/headers";

import { createClient, requireUser } from "@/lib/supabase/server";
import { cleanTabs, tabsCookie, type TabRole } from "@/lib/tabs";

/** Save this person's bottom tabs (for the view they're in) to the account and this device. */
export async function saveTabs(role: TabRole, ids: string[]) {
  const me = await requireUser();
  if (role !== "athlete" && role !== "coach") return { ok: false as const };
  if (role === "coach" && me.role !== "coach") return { ok: false as const };
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("tab_bar").eq("id", me.id).maybeSingle();
  const all = { ...((data?.tab_bar as Record<string, string[]> | null) ?? {}), [role]: cleanTabs(ids, role) };
  const { error } = await supabase.from("profiles").update({ tab_bar: all }).eq("id", me.id);
  if (error) return { ok: false as const };
  (await cookies()).set("d_tabs", tabsCookie(all), { path: "/", maxAge: 60 * 60 * 24 * 400, sameSite: "lax" });
  return { ok: true as const, tabs: all[role] };
}
