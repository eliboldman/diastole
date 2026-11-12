"use server";

import { revalidatePath } from "next/cache";

import { GEAR_SLOTS, HELMETS, ITEM, JERSEYS, AURAS, isConsumable, normalizeGear, type GearSlot } from "@/lib/grit/catalog";
import { planStreakDetail } from "@/lib/streaks";
import { createAdminClient, createClient, requireUser } from "@/lib/supabase/server";

export type GritResult = { ok: true; message?: string } | { ok: false; error: string };
const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Buy one item with grit. Prices come from the catalog here, never from the browser. */
export async function buyItem(itemId: string): Promise<GritResult> {
  const me = await requireUser();
  const item = ITEM[itemId];
  if (!item) return { ok: false, error: "That item isn't in the store." };
  const { data, error } = await createAdminClient().rpc("grit_buy", {
    p_athlete: me.id,
    p_item: item.id,
    p_price: item.price,
    p_consumable: isConsumable(item),
    p_max: item.max ?? 1,
  });
  if (error) return { ok: false, error: "Couldn't buy that. Try again." };
  if (data === "owned") return { ok: false, error: "You already have this." };
  if (data === "max") return { ok: false, error: `You can hold ${item.max} at a time.` };
  if (data === "short") return { ok: false, error: "Not enough grit yet. Keep stacking sessions." };
  revalidatePath("/me/grit");
  return { ok: true, message: `${item.name} is yours.` };
}

/** Put on (or take off, with null) a piece of avatar gear you own. Pods see it on your avatar. */
export async function equipGear(slot: GearSlot, key: string | null): Promise<GritResult> {
  const me = await requireUser();
  if (!GEAR_SLOTS.includes(slot)) return { ok: false, error: "That isn't gear." };
  const valid = slot === "jersey" ? JERSEYS : slot === "helmet" ? HELMETS : AURAS;
  if (key !== null && !(key in valid)) return { ok: false, error: "That isn't gear." };
  const admin = createAdminClient();
  if (key !== null) {
    const { data: owned } = await admin.from("grit_items").select("qty").eq("athlete_id", me.id).eq("item_id", `${slot}:${key}`).maybeSingle();
    if (!owned?.qty) return { ok: false, error: "Get it in the store first." };
  }
  const { data: row } = await admin.from("avatars").select("look").eq("athlete_id", me.id).maybeSingle();
  const look = ((row?.look ?? {}) as Record<string, unknown>) ?? {};
  const gear = { ...normalizeGear(look.gear) };
  if (key === null) delete gear[slot];
  else gear[slot] = key;
  const { error } = await admin.from("avatars").upsert({ athlete_id: me.id, look: { ...look, gear }, updated_at: new Date().toISOString() });
  if (error) return { ok: false, error: "Couldn't save that. Try again." };
  revalidatePath("/me/grit");
  revalidatePath("/account");
  return { ok: true };
}

/** Spend a streak shield on the missed planned day that broke the plan streak (within two weeks). */
export async function spendShield(date: string): Promise<GritResult> {
  const me = await requireUser();
  if (!DATE.test(date)) return { ok: false, error: "Pick a day." };
  const today = new Date().toLocaleDateString("en-CA", { timeZone: me.timezone });
  if (date >= today || Date.parse(`${today}T12:00:00Z`) - Date.parse(`${date}T12:00:00Z`) > 14 * 86_400_000) return { ok: false, error: "Shields cover a missed day in the last two weeks." };
  const admin = createAdminClient();
  // It has to be the day that's actually breaking the streak right now.
  const since = new Date(Date.parse(`${today}T12:00:00Z`) - 180 * 86_400_000).toISOString();
  const [{ data: plans }, { data: acts }, { data: shields }] = await Promise.all([
    admin.from("planned_workouts").select("id, scheduled_date, sport, status").eq("athlete_id", me.id).is("deleted_at", null).neq("status", "draft").gte("scheduled_date", since.slice(0, 10)).lte("scheduled_date", today),
    admin.from("activities").select("id, start_time, sport, duration_s, planned_workout_id").eq("athlete_id", me.id).gte("start_time", since).limit(3000),
    admin.from("grit_shields").select("date").eq("athlete_id", me.id),
  ]);
  const excused = new Set<string>([...(shields ?? []).map((s) => s.date as string), ...(plans ?? []).filter((p) => p.status === "skipped").map((p) => p.scheduled_date as string)]);
  const d = planStreakDetail((plans ?? []).filter((p) => p.status !== "skipped").map((p) => ({ id: p.id, date: p.scheduled_date, sport: p.sport })), acts ?? [], me.timezone, today, excused);
  if (d.brokeOn !== date) return { ok: false, error: "That day isn't breaking your streak." };
  const { data: used } = await admin.rpc("grit_use", { p_athlete: me.id, p_item: "ability:shield" });
  if (!used) return { ok: false, error: "You don't have a streak shield. Get one in the Grit store." };
  const { error } = await admin.from("grit_shields").insert({ athlete_id: me.id, date });
  if (error) return { ok: false, error: "Couldn't use the shield. Try again." };
  revalidatePath("/me");
  return { ok: true, message: "Shield up. Your streak holds." };
}

/** Kudos boost: confetti on the pod page for a day, celebrating one pod mate. */
export async function sendBoost(podId: string, toId: string): Promise<GritResult> {
  const me = await requireUser();
  if (!UUID.test(podId) || !UUID.test(toId)) return { ok: false, error: "Pick someone in your pod." };
  if (toId === me.id) return { ok: false, error: "Boost someone else. They'll boost you back." };
  const supabase = await createClient();
  const { data: inPod } = await supabase.rpc("in_pod", { p_pod: podId });
  if (!inPod) return { ok: false, error: "You're not in this pod." };
  const admin = createAdminClient();
  const { data: member } = await admin.from("pod_members").select("athlete_id").eq("pod_id", podId).eq("athlete_id", toId).eq("status", "active").maybeSingle();
  if (!member) return { ok: false, error: "They're not in this pod." };
  const { data: used } = await admin.rpc("grit_use", { p_athlete: me.id, p_item: "ability:boost" });
  if (!used) return { ok: false, error: "You don't have a kudos boost. Get one in the Grit store." };
  const { error } = await admin.from("pod_boosts").insert({ pod_id: podId, from_id: me.id, to_id: toId });
  if (error) return { ok: false, error: "Couldn't send the boost. Try again." };
  const first = me.full_name?.split(" ")[0] || "A pod mate";
  await admin.rpc("server_notify", { p_user: toId, p_kind: "pod_props", p_title: `🎉 ${first} sent you a kudos boost`, p_body: "Confetti on your pod's page for the next day.", p_href: `/me/pods/${podId}`, p_key: `boost:${podId}:${me.id}:${Date.now()}` });
  revalidatePath(`/me/pods/${podId}`);
  return { ok: true, message: "Boost sent. Confetti incoming." };
}

/** The "+12 grit" pop was shown; don't show these again. */
export async function markGritSeen(): Promise<void> {
  const me = await requireUser();
  await createAdminClient().from("profiles").update({ grit_seen_at: new Date().toISOString() }).eq("id", me.id);
}
