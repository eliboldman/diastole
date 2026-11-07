"use server";

import { revalidatePath } from "next/cache";

import { createClient, requireUser } from "@/lib/supabase/server";

const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
type R = { ok: true } | { ok: false; error: string };

const refresh = (podId: string) => {
  revalidatePath(`/me/pods/${podId}`);
  revalidatePath(`/pods/${podId}`);
};

export type NewChallenge = {
  podId: string;
  title: string;
  mode: "team" | "leaderboard";
  metric: "hours" | "distance" | "sessions";
  sport: "any" | "run" | "bike" | "swim";
  goal: number | null; // hours, km or sessions (the form converts miles)
  startsOn: string;
  endsOn: string;
};

/** Start a challenge in a pod: its coach or any active member (row-level security checks). */
export async function createChallenge(c: NewChallenge): Promise<R> {
  const me = await requireUser();
  if (!UUID.test(c.podId)) return { ok: false, error: "Unknown pod." };
  const title = c.title?.trim().slice(0, 80);
  if (!title) return { ok: false, error: "Give it a name." };
  if (!["team", "leaderboard"].includes(c.mode) || !["hours", "distance", "sessions"].includes(c.metric) || !["any", "run", "bike", "swim"].includes(c.sport))
    return { ok: false, error: "Pick a type, a measure and a sport." };
  if (!DATE.test(c.startsOn) || !DATE.test(c.endsOn) || c.endsOn < c.startsOn) return { ok: false, error: "The end date must be on or after the start." };
  if ((Date.parse(c.endsOn) - Date.parse(c.startsOn)) / 86_400_000 > 92) return { ok: false, error: "Keep it to three months or less." };
  const goal = c.goal && Number.isFinite(c.goal) && c.goal > 0 ? Math.round(c.goal * 10) / 10 : null;
  if (c.mode === "team" && !goal) return { ok: false, error: "A team challenge needs a goal." };
  const supabase = await createClient();
  const { error } = await supabase.from("pod_challenges").insert({
    pod_id: c.podId,
    created_by: me.id,
    title,
    mode: c.mode,
    metric: c.metric,
    sport: c.sport,
    goal,
    starts_on: c.startsOn,
    ends_on: c.endsOn,
  });
  if (error) return { ok: false, error: "Couldn't start that challenge." };
  // The creator is in by default when they're a member (the coach organizes).
  if (me.role !== "coach") {
    const { data: row } = await supabase.from("pod_challenges").select("id").eq("pod_id", c.podId).eq("created_by", me.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (row) await supabase.from("pod_challenge_entries").insert({ challenge_id: row.id, athlete_id: me.id });
  }
  refresh(c.podId);
  return { ok: true };
}

export async function deleteChallenge(podId: string, id: string): Promise<R> {
  await requireUser();
  if (!UUID.test(podId) || !UUID.test(id)) return { ok: false, error: "Unknown challenge." };
  const supabase = await createClient();
  const { error, count } = await supabase.from("pod_challenges").delete({ count: "exact" }).eq("id", id);
  if (error || !count) return { ok: false, error: "Only whoever started it, or the coach, can delete it." };
  refresh(podId);
  return { ok: true };
}

/** Join (counts your totals and shows them to the pod) or leave a challenge. */
export async function setChallengeEntry(podId: string, id: string, join: boolean): Promise<R> {
  const me = await requireUser();
  if (!UUID.test(podId) || !UUID.test(id)) return { ok: false, error: "Unknown challenge." };
  const supabase = await createClient();
  const { error } = join
    ? await supabase.from("pod_challenge_entries").upsert({ challenge_id: id, athlete_id: me.id }, { onConflict: "challenge_id,athlete_id", ignoreDuplicates: true })
    : await supabase.from("pod_challenge_entries").delete().eq("challenge_id", id).eq("athlete_id", me.id);
  if (error) return { ok: false, error: join ? "Couldn't join. It may have ended." : "Couldn't leave." };
  refresh(podId);
  return { ok: true };
}
