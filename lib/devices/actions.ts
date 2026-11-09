"use server";

import { revalidatePath } from "next/cache";

import { createClient, requireUser } from "@/lib/supabase/server";

export type PairState = { ok: true; kind: string } | { ok: false; error: string } | null;

const ERRORS: Record<string, string> = {
  invalid: "That code doesn't match. Check the letters on your watch or TV.",
  expired: "That code has expired. Open the app again for a new one.",
  used: "That code was already used.",
  too_many: "Too many tries. Wait a few minutes and try again.",
};

/** Types a code shown on a watch or TV; the device signs in on its next check. */
export async function claimDeviceCode(_prev: PairState, form: FormData): Promise<PairState> {
  await requireUser();
  const code = String(form.get("code") ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length !== 6) return { ok: false, error: "Codes are 6 letters and numbers." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("claim_device_code", { p_code: code });
  if (error) return { ok: false, error: "Couldn't check that code. Try again." };
  if (data === "garmin_watch" || data === "apple_tv") {
    revalidatePath("/me/devices");
    return { ok: true, kind: data };
  }
  return { ok: false, error: ERRORS[String(data)] ?? ERRORS.invalid };
}

export async function removeDevice(form: FormData) {
  await requireUser();
  const id = String(form.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const supabase = await createClient();
  await supabase.from("device_links").delete().eq("id", id); // RLS: own devices only
  revalidatePath("/me/devices");
}
