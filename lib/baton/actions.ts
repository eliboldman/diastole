"use server";

import { revalidatePath } from "next/cache";

import { processBaton } from "@/lib/baton/run";
import { createAdminClient, requireUser } from "@/lib/supabase/server";

/** Join (or leave) your pod's baton. Only your own membership; leaving passes it on if you hold it. */
export async function setBaton(podId: string, on: boolean): Promise<{ ok: boolean; error?: string }> {
  const me = await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(podId)) return { ok: false, error: "Pod not found." };
  const admin = createAdminClient();
  const { data, error } = await admin.from("pod_members").update({ baton: on }).eq("pod_id", podId).eq("athlete_id", me.id).eq("status", "active").select("pod_id");
  if (error || !data?.length) return { ok: false, error: "You're not in this pod." };
  await processBaton(admin, podId).catch(() => null);
  revalidatePath(`/me/pods/${podId}`);
  return { ok: true };
}
