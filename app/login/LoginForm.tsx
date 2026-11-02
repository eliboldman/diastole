"use client";

import { useActionState } from "react";

import { sendLoginLink, type LoginState } from "./actions";

export default function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendLoginLink, { sent: false });

  if (state.sent) {
    return (
      <div className="rounded-[28px] border border-emerald-300/20 bg-emerald-300/[0.05] p-6 text-white/70">
        <p className="font-medium text-white">Check your email.</p>
        <p className="mt-2 text-sm">
          If you&apos;ve been invited to Diastole, a sign-in link is on its way. It expires in one hour.
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
        className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white placeholder:text-white/30 focus:border-emerald-300/40 focus:outline-none"
      />
      {state.error && <p className="text-sm text-red-300">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-2xl border border-emerald-300/25 bg-emerald-300/10 px-4 py-3 font-medium text-emerald-100 transition-colors hover:bg-emerald-300/20 disabled:opacity-50"
      >
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
