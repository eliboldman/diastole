"use server";

import { createClient as createPlainClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { siteUrl } from "@/lib/site-url";
import { asTheme, THEME_COOKIE } from "@/lib/themes";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string; email?: string };

const EMAIL = /^\S+@\S+\.\S+$/;

/** Email + password sign-in. Supabase stores the session in cookies; /login then routes by role. */
export async function signInWithPassword(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!EMAIL.test(email)) return { error: "Enter a valid email address.", email };
  if (!password) return { error: "Enter your password.", email };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.status === 429) return { error: "Too many attempts. Wait a few minutes and try again.", email };
    // Same message for unknown email and wrong password, so accounts can't be probed.
    return {
      error: "Email or password is incorrect. First time here, or never set a password? Use “Forgot password” below.",
      email,
    };
  }
  // Paint this account's theme on this device from the first page.
  const { data: auth } = await supabase.auth.getUser();
  if (auth.user) {
    const { data: p } = await supabase.from("profiles").select("theme").eq("id", auth.user.id).maybeSingle();
    (await cookies()).set(THEME_COOKIE, asTheme(p?.theme), { path: "/", maxAge: 60 * 60 * 24 * 400, sameSite: "lax" });
  }
  redirect("/login");
}

export type ResetState = { sent: boolean; error?: string };

/** Emails a link that signs the user in and lands on /set-password. Also how existing link-only accounts get a password. */
export async function sendPasswordReset(_prev: ResetState, form: FormData): Promise<ResetState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL.test(email)) return { sent: false, error: "Enter a valid email address." };

  // Implicit flow: the emailed link works in any browser or mail app, not just the one that asked.
  const supabase = createPlainClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false },
  });
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await siteUrl()}/auth/callback`, // the link carries type=recovery, which routes to /set-password
  });
  // Don't reveal whether an email is registered; only surface rate limits.
  if (error && error.status === 429) {
    return { sent: false, error: "Too many reset emails. Please wait a few minutes and try again." };
  }
  return { sent: true };
}

export type PasswordState = { error?: string };

export async function setPassword(_prev: PasswordState, form: FormData): Promise<PasswordState> {
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  if (password.length < 8) return { error: "Use at least 8 characters." };
  if (password !== confirm) return { error: "The two passwords don't match." };

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: "Your reset link expired. Request a new one from the sign-in page." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (/different from the old/i.test(error.message)) return { error: "Choose a password different from your current one." };
    if (error.code === "weak_password") return { error: "That password is too easy to guess. Try a longer one." };
    return { error: error.message };
  }
  redirect((await needsOnboarding(data.user.id)) ? "/connect" : "/login");
}

/** Starts Google or Apple sign-in. Invite-only still applies: Supabase refuses emails with no existing account. */
export async function signInWithProvider(form: FormData) {
  const provider = String(form.get("provider"));
  if (provider !== "google" && provider !== "apple") redirect("/login");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${await siteUrl()}/auth/callback` },
  });
  if (error || !data.url) redirect("/login?error=provider");
  redirect(data.url);
}

/** Athletes without a connected watch are still setting up. Coaches never are. */
async function needsOnboarding(userId: string) {
  const supabase = await createClient();
  const [{ data: profile }, { data: device }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", userId).maybeSingle(),
    supabase.from("device_connections").select("source").eq("athlete_id", userId).limit(1).maybeSingle(),
  ]);
  return profile?.role === "athlete" && !device;
}
