"use client";

import { useActionState } from "react";

import { setPassword, type PasswordState } from "@/app/login/actions";

const input =
  "w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-base text-white placeholder:text-white/30 focus:border-emerald-300/40 focus:outline-none";

export default function SetPasswordForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<PasswordState, FormData>(setPassword, {});

  return (
    <form action={action} className="space-y-4">
      {/* Lets password managers save the new password under the right account. */}
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      <input
        name="password"
        type="password"
        required
        minLength={8}
        autoComplete="new-password"
        placeholder="New password (8+ characters)"
        className={input}
      />
      <input
        name="confirm"
        type="password"
        required
        minLength={8}
        autoComplete="new-password"
        placeholder="Type it again"
        className={input}
      />
      {state.error && <p className="text-sm text-red-300">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-2xl border border-emerald-300/25 bg-emerald-300/15 px-4 py-3.5 font-medium text-emerald-50 transition active:scale-[0.98] hover:bg-emerald-300/25 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save password"}
      </button>
    </form>
  );
}
