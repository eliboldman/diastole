"use server";

import { revalidatePath } from "next/cache";

import { createClient, requireCoach, requireUser } from "@/lib/supabase/server";

export type Result = { ok: true; message?: string } | { ok: false; error: string };

const refresh = () => {
  revalidatePath("/pods", "layout");
  revalidatePath("/me", "layout");
};

// ---------------------------------------------------------------- coach

export async function createPod(name: string): Promise<Result> {
  const coach = await requireCoach();
  const clean = name.trim();
  if (!clean) return { ok: false, error: "Give the pod a name." };
  const supabase = await createClient();
  const { error } = await supabase.from("pods").insert({ coach_id: coach.id, name: clean.slice(0, 60) });
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export async function deletePod(podId: string): Promise<Result> {
  await requireCoach();
  const supabase = await createClient();
  const { error } = await supabase.from("pods").delete().eq("id", podId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

/** Invites athletes to a pod. Row-level security only allows the coach's own athletes. */
export async function inviteToPod(podId: string, athleteIds: string[]): Promise<Result> {
  await requireCoach();
  if (!athleteIds.length) return { ok: false, error: "Pick at least one athlete." };
  const supabase = await createClient();

  const { data: existing } = await supabase.from("pod_members").select("athlete_id, status").eq("pod_id", podId);
  const byId = new Map((existing ?? []).map((m) => [m.athlete_id, m.status]));

  const fresh = athleteIds.filter((id) => !byId.has(id));
  if (fresh.length) {
    const { error } = await supabase.from("pod_members").insert(fresh.map((athlete_id) => ({ pod_id: podId, athlete_id })));
    if (error) return { ok: false, error: error.message };
  }
  for (const id of athleteIds.filter((id) => ["declined", "left"].includes(byId.get(id) ?? ""))) {
    await supabase.rpc("reinvite_to_pod", { p_pod: podId, p_athlete: id });
  }
  refresh();
  return { ok: true, message: "Invited. Each athlete sees the invite on their Diastole home page." };
}

export async function removeFromPod(podId: string, athleteId: string): Promise<Result> {
  await requireCoach();
  const supabase = await createClient();
  const { error } = await supabase.from("pod_members").delete().eq("pod_id", podId).eq("athlete_id", athleteId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------- athlete

export async function respondToPod(podId: string, action: "accept" | "decline" | "leave"): Promise<Result> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("respond_to_pod", { p_pod: podId, p_action: action });
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "That change isn't possible right now. Try refreshing." };
  refresh();
  return { ok: true };
}
