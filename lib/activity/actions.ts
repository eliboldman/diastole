"use server";

import { revalidatePath } from "next/cache";

import { createClient, requireUser } from "@/lib/supabase/server";

export type ZonesState = { ok?: boolean; error?: string } | null;

/** "6:35" per mile or "4:05" per km -> metres per second. */
function paceToSpeed(text: string, units: "mi" | "km"): number | null {
  const m = /^(\d{1,2}):([0-5]\d)$/.exec(text.trim());
  if (!m) return null;
  const sec = Number(m[1]) * 60 + Number(m[2]);
  return sec > 0 ? Number(((units === "mi" ? 1609.344 : 1000) / sec).toFixed(3)) : null;
}

/** Coach sets an athlete's zones. Blank fields fall back to estimates. Row-level security enforces who may. */
export async function saveZones(_prev: ZonesState, form: FormData): Promise<ZonesState> {
  await requireUser();
  const athleteId = String(form.get("athlete_id") ?? "");
  const maxHrText = String(form.get("max_hr") ?? "").trim();
  const paceText = String(form.get("threshold_pace") ?? "").trim();
  const ftpText = String(form.get("ftp") ?? "").trim();
  const thrText = String(form.get("threshold_hr") ?? "").trim();

  const max_hr = maxHrText ? Number(maxHrText) : null;
  if (max_hr !== null && !(Number.isInteger(max_hr) && max_hr >= 120 && max_hr <= 230)) return { error: "Max heart rate should be between 120 and 230." };
  const units = form.get("units") === "km" ? "km" : "mi";
  const threshold_speed_mps = paceText ? paceToSpeed(paceText, units) : null;
  if (paceText && (threshold_speed_mps === null || threshold_speed_mps < 1 || threshold_speed_mps > 10))
    return { error: `Threshold pace should look like ${units === "mi" ? "6:35 (minutes per mile)" : "4:05 (minutes per km)"}.` };
  const ftp_w = ftpText ? Number(ftpText) : null;
  if (ftp_w !== null && !(Number.isInteger(ftp_w) && ftp_w >= 50 && ftp_w <= 600)) return { error: "FTP should be between 50 and 600 watts." };
  const threshold_hr = thrText ? Number(thrText) : null;
  if (threshold_hr !== null && !(Number.isInteger(threshold_hr) && threshold_hr >= 100 && threshold_hr <= 220)) return { error: "Threshold heart rate should be between 100 and 220." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("athlete_zones")
    .upsert({ athlete_id: athleteId, max_hr, threshold_speed_mps, ftp_w, threshold_hr, updated_at: new Date().toISOString() }, { onConflict: "athlete_id" });
  if (error) return { error: "Couldn't save zones. Only the athlete's coach can change them." };
  revalidatePath(`/athlete/${athleteId}`);
  revalidatePath(`/profile/${athleteId}`);
  revalidatePath("/activity/[id]", "page");
  return { ok: true };
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
  revalidatePath("/account");
}

export type NotifyPrefs = Partial<Record<"props" | "comments" | "messages" | "pods" | "workouts" | "coaching", boolean>>;

export async function setNotifyPrefs(prefs: NotifyPrefs) {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_notify_prefs", { p_prefs: prefs });
  if (error) throw new Error("Couldn't save notification settings.");
}
