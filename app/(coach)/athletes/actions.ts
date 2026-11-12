"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient, createClient, requireCoach } from "@/lib/supabase/server";
import { disconnectGarmin } from "@/lib/garmin/client";
import { removeWorkoutFromGarmin } from "@/lib/garmin/training";
import { siteUrl } from "@/lib/site-url";

export type InviteState = { ok?: string; error?: string };

export async function inviteAthlete(_prev: InviteState, form: FormData): Promise<InviteState> {
  const coach = await requireCoach();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const fullName = String(form.get("full_name") ?? "").trim();
  const role = form.get("role") === "coach" ? "coach" : "athlete";
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter a valid email address." };

  // Record the invite first (as the coach, so row-level security applies); the sign-up trigger
  // uses it to attach a new athlete to this coach, or to make an invited coach a coach with their own roster.
  const supabase = await createClient();
  const { data: invite, error: inviteError } = await supabase
    .from("invites")
    .insert({ coach_id: coach.id, email, role })
    .select("id")
    .single();
  if (inviteError) {
    return { error: inviteError.code === "23505" ? "That email already has a pending invite." : inviteError.message };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: fullName ? { full_name: fullName } : undefined,
    redirectTo: `${await siteUrl()}/auth/callback`,
  });

  if (error) {
    await supabase.from("invites").delete().eq("id", invite.id);
    if (error.status === 422 || /already been registered/i.test(error.message)) {
      return { error: "That email already has a Diastole account. They can sign in at /login." };
    }
    if (error.status === 429) {
      return { error: "Email limit reached (free tier sends ~2 emails/hour). Try again later." };
    }
    return { error: error.message };
  }

  revalidatePath("/athletes");
  return { ok: role === "coach" ? `Coach invite sent to ${email}. They'll get their own roster.` : `Invite sent to ${email}.` };
}

export type RemoveState = { ok: true; message: string } | { ok: false; error: string };

/**
 * Permanently remove an athlete: take Diastole's workouts off their Garmin calendar, disconnect Garmin,
 * then delete their account, which cascades to all of their data (wellness, activities, workouts, pods).
 */
export async function removeAthlete(athleteId: string, typedName: string): Promise<RemoveState> {
  const coach = await requireCoach();
  if (athleteId === coach.id) return { ok: false, error: "You can't remove yourself." };

  const admin = createAdminClient();
  const { data: athlete } = await admin
    .from("profiles")
    .select("id, coach_id, role, full_name, email")
    .eq("id", athleteId)
    .maybeSingle();
  if (!athlete || athlete.coach_id !== coach.id) return { ok: false, error: "Athlete not found." };
  if (athlete.role !== "athlete") return { ok: false, error: "Only athletes can be removed here." };

  const name = (athlete.full_name || athlete.email || "").trim();
  const expected = name.split(/\s+/)[0]?.toLowerCase() ?? "";
  if (!expected || typedName.trim().toLowerCase() !== expected) {
    return { ok: false, error: `Type “${name.split(/\s+/)[0]}” to confirm.` };
  }

  const notes: string[] = [];
  const { data: device } = await admin.from("device_connections").select("source").eq("athlete_id", athleteId).maybeSingle();
  if (device?.source === "garmin") {
    const { data: sent } = await admin
      .from("planned_workouts")
      .select("id")
      .eq("athlete_id", athleteId)
      .not("external_id", "is", null)
      .is("deleted_at", null);
    let failed = 0;
    for (const w of sent ?? []) await removeWorkoutFromGarmin(w.id).catch(() => (failed += 1));
    if (sent?.length) notes.push(failed ? `${failed} workout(s) couldn't be removed from their Garmin calendar.` : "Removed Diastole workouts from their Garmin calendar.");
    await disconnectGarmin(athleteId);
    notes.push("Disconnected Garmin.");
  }

  // Invites are stored lowercased (see inviteAthlete); exact match, no pattern wildcards.
  if (athlete.email) await admin.from("invites").delete().eq("coach_id", coach.id).eq("email", athlete.email.toLowerCase());
  const { error } = await admin.auth.admin.deleteUser(athleteId);
  if (error) return { ok: false, error: `Couldn't delete the account: ${error.message}` };

  revalidatePath("/athletes");
  revalidatePath("/dashboard");
  return { ok: true, message: [`Removed ${name} and all of their data.`, ...notes].join(" ") };
}
