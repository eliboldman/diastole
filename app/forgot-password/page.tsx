import type { Metadata } from "next";
import Link from "next/link";

import PublicShell from "@/components/PublicShell";

import ResetForm from "./ResetForm";

export const metadata: Metadata = { title: "Reset password · Diastole" };

export default function ForgotPasswordPage() {
  return (
    <PublicShell>
      <div className="mx-auto max-w-sm pt-24">
        <h1 className="text-3xl font-medium tracking-tight">Set or reset your password</h1>
        <p className="mt-2 mb-8 text-white/50">
          We&apos;ll email you a link. Open it on any device to choose a new password.
        </p>
        <ResetForm />
        <p className="mt-6 text-center text-sm">
          <Link href="/login" className="text-white/50 underline-offset-4 hover:text-white hover:underline">
            ← Back to sign in
          </Link>
        </p>
      </div>
    </PublicShell>
  );
}
