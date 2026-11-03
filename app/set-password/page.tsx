import type { Metadata } from "next";
import { redirect } from "next/navigation";

import PublicShell from "@/components/PublicShell";
import { createClient } from "@/lib/supabase/server";

import SetPasswordForm from "./SetPasswordForm";

export const metadata: Metadata = { title: "Choose a password · Diastole" };

// Reached from an invite or reset email (the link signs the user in first).
export default async function SetPasswordPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?error=link");

  return (
    <PublicShell>
      <div className="mx-auto max-w-sm pt-24">
        <h1 className="text-3xl font-medium tracking-tight">Choose a password</h1>
        <p className="mt-2 mb-8 text-white/50">
          For <span className="text-white/80">{data.user.email}</span>. You&apos;ll use it to sign in from now on.
        </p>
        <SetPasswordForm email={data.user.email ?? ""} />
      </div>
    </PublicShell>
  );
}
