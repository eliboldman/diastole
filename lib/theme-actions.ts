"use server";

import { cookies } from "next/headers";

import { asLook, LOOK_COOKIE, lookCookie } from "@/lib/appearance";
import { asTheme, THEME_COOKIE } from "@/lib/themes";
import { createClient, requireUser } from "@/lib/supabase/server";

const YEAR = 60 * 60 * 24 * 400;

/** Save the theme on the account and on this device (the cookie paints it before the page loads). */
export async function setTheme(theme: string) {
  return saveAppearance(theme, undefined);
}

/** Save the color theme and the rest of the appearance settings, on the account and this device. */
export async function saveAppearance(theme: string, look: unknown) {
  const me = await requireUser();
  const t = asTheme(theme);
  const l = look === undefined ? undefined : asLook(look);
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update(l ? { theme: t, appearance: l } : { theme: t })
    .eq("id", me.id);
  if (error) return { ok: false as const };
  const jar = await cookies();
  jar.set(THEME_COOKIE, t, { path: "/", maxAge: YEAR, sameSite: "lax" });
  if (l) jar.set(LOOK_COOKIE, lookCookie(l), { path: "/", maxAge: YEAR, sameSite: "lax" });
  return { ok: true as const };
}
