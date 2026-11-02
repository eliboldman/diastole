"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient, createClient, requireCoach } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site-url";

export type InviteState = { ok?: string; error?: string };

export async function inviteAthlete(_prev: InviteState, form: FormData): Promise<InviteState> {
  const coach = await requireCoach();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const fullName = String(form.get("full_name") ?? "").trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter a valid email address." };

  // Record the invite first (as the coach, so row-level security applies);
  // the sign-up trigger uses it to attach the new athlete to this coach.
  const supabase = await createClient();
  const { data: invite, error: inviteError } = await supabase
    .from("invites")
    .insert({ coach_id: coach.id, email })
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
  return { ok: `Invite sent to ${email}.` };
}
