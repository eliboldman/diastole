"use server";

import { revalidatePath } from "next/cache";

import { createClient, requireUser } from "@/lib/supabase/server";

export type SettingsState = { ok?: boolean; error?: string };

export async function saveSettings(_prev: SettingsState, form: FormData): Promise<SettingsState> {
  const me = await requireUser();
  const fullName = String(form.get("full_name") ?? "").trim();
  const timezone = String(form.get("timezone") ?? "");
  if (!Intl.supportedValuesOf("timeZone").includes(timezone)) return { error: "Pick a valid timezone." };
  const units = form.get("units") === "km" ? "km" : "mi";

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName || null, timezone, units })
    .eq("id", me.id);
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { ok: true };
}
