import type { Metadata } from "next";
import { redirect } from "next/navigation";

import PublicShell from "@/components/PublicShell";
import { getProfile } from "@/lib/supabase/server";

import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "Sign in · Diastole" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const profile = await getProfile();
  if (profile) redirect(profile.role === "coach" ? "/dashboard" : "/me");

  const { error } = await searchParams;

  return (
    <PublicShell>
      <div className="mx-auto max-w-sm pt-24">
        <h1 className="text-3xl font-medium tracking-tight">Sign in</h1>
        <p className="mt-2 mb-8 text-white/50">Diastole is invite-only. Use the email your coach invited.</p>
        {error && (
          <p className="mb-4 rounded-2xl border border-red-300/20 bg-red-300/[0.06] p-3 text-sm text-red-200">
            That link has expired or was already used. Request a new one below.
          </p>
        )}
        <LoginForm />
      </div>
    </PublicShell>
  );
}
