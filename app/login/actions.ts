"use server";

import { createClient } from "@supabase/supabase-js";

import { siteUrl } from "@/lib/site-url";

export type LoginState = { sent: boolean; error?: string };

export async function sendLoginLink(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return { sent: false, error: "Enter a valid email address." };

  // Implicit flow: the emailed link works in any browser or mail app, not just this one.
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false },
  });
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false, // invite-only: unknown emails get no account
      emailRedirectTo: `${await siteUrl()}/auth/callback`,
    },
  });

  // Don't reveal whether an email is registered; only surface rate limits.
  if (error && error.status === 429) {
    return { sent: false, error: "Too many sign-in emails. Please wait a few minutes and try again." };
  }
  return { sent: true };
}
