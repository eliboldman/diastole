"use server";

import { cookies } from "next/headers";

import { cleanEggs, EGGS_COOKIE, eggCookie, isNightSession, secretById, SECRETS, tierOf, type Eggs } from "@/lib/secrets";
import { createAdminClient, createClient, requireUser } from "@/lib/supabase/server";

const YEAR = 60 * 60 * 24 * 400;

/** Rewrite this device's egg cookie from the account (settings + secrets found and switched on). */
async function syncCookie(athleteId: string) {
  const supabase = await createClient();
  const [{ data: p }, { data: rows }] = await Promise.all([
    supabase.from("profiles").select("eggs").eq("id", athleteId).maybeSingle(),
    supabase.from("user_secrets").select("secret_id, enabled").eq("athlete_id", athleteId),
  ]);
  const found = (rows ?? []).filter((r) => r.enabled).map((r) => r.secret_id);
  (await cookies()).set(EGGS_COOKIE, eggCookie({ ...cleanEggs(p?.eggs), found }), { path: "/", maxAge: YEAR, sameSite: "lax" });
}

/** Found one. Returns whether it's new (for the little unlock moment). Opted-in pods hear about it. */
export async function foundSecret(id: string): Promise<{ isNew: boolean; name?: string; emoji?: string }> {
  const me = await requireUser();
  const s = secretById(id);
  if (!s || s.id === "night_shift") return { isNew: false }; // Night Shift is earned by data, not taps
  const supabase = await createClient();
  const { data: had } = await supabase.from("user_secrets").select("secret_id").eq("athlete_id", me.id).eq("secret_id", s.id).maybeSingle();
  if (had) return { isNew: false };
  await supabase.from("user_secrets").insert({ athlete_id: me.id, secret_id: s.id });
  await announce(me.id, s.id);
  await syncCookie(me.id);
  return { isNew: true, name: s.name, emoji: s.emoji };
}

async function announce(athleteId: string, secretId: string) {
  const supabase = await createClient();
  const { data: p } = await supabase.from("profiles").select("eggs").eq("id", athleteId).maybeSingle();
  if (cleanEggs(p?.eggs).podPosts) await createAdminClient().from("secret_posts").insert({ athlete_id: athleteId, secret_id: secretId });
}

/** Switch a found secret's effect on or off. */
export async function setSecretEnabled(id: string, on: boolean) {
  const me = await requireUser();
  if (!secretById(id)) return { ok: false as const };
  const supabase = await createClient();
  await supabase.from("user_secrets").update({ enabled: on }).eq("athlete_id", me.id).eq("secret_id", id);
  await syncCookie(me.id);
  return { ok: true as const };
}

/** Easter-egg settings (all on/off, pod posts, heartbeat style, starry sky). */
export async function saveEggs(eggs: Partial<Eggs>) {
  const me = await requireUser();
  const supabase = await createClient();
  const { data: p } = await supabase.from("profiles").select("eggs").eq("id", me.id).maybeSingle();
  const next = cleanEggs({ ...cleanEggs(p?.eggs), ...eggs });
  const { error } = await supabase.from("profiles").update({ eggs: next }).eq("id", me.id);
  if (error) return { ok: false as const };
  await syncCookie(me.id);
  return { ok: true as const };
}

/**
 * Night Shift: counts workouts started between midnight and 4 a.m. (the athlete's time), records
 * the tier, and says whether there was one today (for the starry sky).
 */
export async function checkNightShift(): Promise<{ count: number; nightToday: boolean; isNew: boolean; tierUp: number | null }> {
  const me = await requireUser();
  const supabase = await createClient();
  const { data: acts } = await supabase.from("activities").select("start_time").eq("athlete_id", me.id).gte("start_time", new Date(Date.now() - 3 * 365 * 86_400_000).toISOString()).limit(5000);
  const nights = (acts ?? []).filter((a) => isNightSession(a.start_time, me.timezone));
  const count = nights.length;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: me.timezone });
  const nightToday = nights.some((a) => new Date(a.start_time).toLocaleDateString("en-CA", { timeZone: me.timezone }) === today);
  if (!count) return { count, nightToday, isNew: false, tierUp: null };

  const s = SECRETS.find((x) => x.id === "night_shift")!;
  const { data: row } = await supabase.from("user_secrets").select("count").eq("athlete_id", me.id).eq("secret_id", "night_shift").maybeSingle();
  if (row && row.count === count) return { count, nightToday, isNew: false, tierUp: null };
  if (row) await supabase.from("user_secrets").update({ count }).eq("athlete_id", me.id).eq("secret_id", "night_shift");
  else await supabase.from("user_secrets").insert({ athlete_id: me.id, secret_id: "night_shift", count });
  if (!row) await announce(me.id, "night_shift");
  await syncCookie(me.id);
  const before = row ? tierOf(s, row.count) : 0;
  const after = tierOf(s, count);
  return { count, nightToday, isNew: !row, tierUp: row && after > before ? after : null };
}
