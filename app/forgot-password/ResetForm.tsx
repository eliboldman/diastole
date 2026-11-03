"use client";

import { useActionState } from "react";

import { sendPasswordReset, type ResetState } from "@/app/login/actions";

export default function ResetForm() {
  const [state, action, pending] = useActionState<ResetState, FormData>(sendPasswordReset, { sent: false });

  if (state.sent) {
    return (
      <div className="rounded-[28px] border border-emerald-300/20 bg-emerald-300/[0.05] p-6 text-white/70">
        <p className="font-medium text-white">Check your email.</p>
        <p className="mt-2 text-sm">
          If that address has a Diastole account, a link to set your password is on its way. It expires in one hour.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder="you@example.com"
        className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-base text-white placeholder:text-white/30 focus:border-emerald-300/40 focus:outline-none"
      />
      {state.error && <p className="text-sm text-red-300">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-2xl border border-emerald-300/25 bg-emerald-300/15 px-4 py-3.5 font-medium text-emerald-50 transition active:scale-[0.98] hover:bg-emerald-300/25 disabled:opacity-50"
      >
        {pending ? "Sending…" : "Email me a link"}
      </button>
    </form>
  );
}
