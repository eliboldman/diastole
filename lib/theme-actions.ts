"use server";

import { cookies } from "next/headers";

import { asTheme, THEME_COOKIE } from "@/lib/themes";
import { createClient, requireUser } from "@/lib/supabase/server";

/** Save the theme on the account and on this device (the cookie paints it before the page loads). */
export async function setTheme(theme: string) {
  const me = await requireUser();
  const t = asTheme(theme);
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ theme: t }).eq("id", me.id);
  if (error) return { ok: false as const };
  (await cookies()).set(THEME_COOKIE, t, { path: "/", maxAge: 60 * 60 * 24 * 400, sameSite: "lax" });
  return { ok: true as const };
}
