"use server";

import { ZONE_COLUMNS, type RelZones } from "@/lib/workouts/relative";
import { rescaleUpcoming } from "@/lib/workouts/rescale";
import { revalidatePath } from "next/cache";

import { createClient, requireUser } from "@/lib/supabase/server";
import { parsePace, wholeNumber } from "@/lib/activity/pace-input";

export type ZonesState = { ok?: boolean; error?: string; note?: string } | null;

/** A typed pace ("6:35", "635", "6.35"…) per mile or km -> metres per second. */
function paceToSpeed(text: string, units: "mi" | "km"): number | null {
  const sec = parsePace(text);
  return sec ? Number(((units === "mi" ? 1609.344 : 1000) / sec).toFixed(3)) : null;
}

/** An athlete sets their own zones, or a coach sets an athlete's. Blank fields fall back to estimates. Row-level security enforces who may. */
export async function saveZones(_prev: ZonesState, form: FormData): Promise<ZonesState> {
  await requireUser();
  const athleteId = String(form.get("athlete_id") ?? "");
  const maxHrText = String(form.get("max_hr") ?? "").trim();
  const paceText = String(form.get("threshold_pace") ?? "").trim();
  const ftpText = String(form.get("ftp") ?? "").trim();
  const thrText = String(form.get("threshold_hr") ?? "").trim();

  const max_hr = maxHrText ? wholeNumber(maxHrText) : null;
  if (maxHrText && (max_hr === null || max_hr < 120 || max_hr > 230)) return { error: "Max heart rate should be a number between 120 and 230." };
  const units = form.get("units") === "km" ? "km" : "mi";
  const threshold_speed_mps = paceText ? paceToSpeed(paceText, units) : null;
  if (paceText && (threshold_speed_mps === null || threshold_speed_mps < 1 || threshold_speed_mps > 10))
    return { error: `Threshold pace should be minutes and seconds per ${units === "mi" ? "mile, like 6:35 (or type 635)" : "km, like 4:05 (or type 405)"}.` };
  const ftp_w = ftpText ? wholeNumber(ftpText) : null;
  if (ftpText && (ftp_w === null || ftp_w < 50 || ftp_w > 600)) return { error: "FTP should be a number of watts between 50 and 600." };
  const threshold_hr = thrText ? wholeNumber(thrText) : null;
  if (thrText && (threshold_hr === null || threshold_hr < 100 || threshold_hr > 220)) return { error: "Threshold heart rate should be a number between 100 and 220." };

  const supabase = await createClient();
  const { data: before } = await supabase.from("athlete_zones").select(ZONE_COLUMNS).eq("athlete_id", athleteId).maybeSingle();
  const { error } = await supabase
    .from("athlete_zones")
    .upsert({ athlete_id: athleteId, max_hr, threshold_speed_mps, ftp_w, threshold_hr, updated_at: new Date().toISOString() }, { onConflict: "athlete_id" });
  if (error) {
    console.error("saveZones failed", error.code, error.message);
    return { error: "Couldn't save those numbers. Try again." };
  }
  const note = await rescaleUpcoming(supabase, athleteId, before as RelZones, { max_hr, threshold_speed_mps, ftp_w, threshold_hr });
  revalidatePath(`/athlete/${athleteId}`);
  revalidatePath(`/profile/${athleteId}`);
  revalidatePath("/account");
  revalidatePath("/activity/[id]", "page");
  return { ok: true, note };
}


export type PodSharing = { level: 0 | 1 | 2; details: boolean; hrv: boolean; sleep: boolean; stress: boolean };

/** What my pod mates may see. Enforced by the database (pod_can_see); this only saves the choice. */
export async function setPodSharing(s: PodSharing) {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_pod_sharing", {
    p_level: s.level,
    p_hrv: s.hrv,
    p_sleep: s.sleep,
    p_stress: s.stress,
    p_details: s.details,
  });
  if (error) throw new Error("Couldn't update sharing.");
  revalidatePath("/me/pods");
  revalidatePath("/account/settings");
}

export type NotifyPrefs = Partial<Record<"props" | "comments" | "messages" | "pods" | "workouts" | "coaching", boolean>>;

export async function setNotifyPrefs(prefs: NotifyPrefs) {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_notify_prefs", { p_prefs: prefs });
  if (error) throw new Error("Couldn't save notification settings.");
}

/** Which sound a group of push notifications plays on the iPhone app. */
export async function setPushSound(group: string, sound: string) {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_push_sound", { p_group: group, p_sound: sound });
  if (error || data) throw new Error((data as string | null) ?? "Couldn't save that sound.");
}

/** The welcome tour was finished or skipped: don't show it again. */
export async function markWelcomed() {
  await requireUser();
  const supabase = await createClient();
  await supabase.rpc("mark_welcomed");
}
