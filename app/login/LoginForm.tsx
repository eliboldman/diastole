"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signInWithPassword, signInWithProvider, type LoginState } from "./actions";

const input =
  "w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-base text-white placeholder:text-white/45 focus:border-emerald-300/40 focus:outline-none";

// Providers appear once they're configured in Supabase: NEXT_PUBLIC_AUTH_PROVIDERS="google,apple".
const providers = (process.env.NEXT_PUBLIC_AUTH_PROVIDERS ?? "")
  .split(",")
  .map((p) => p.trim())
  .filter((p): p is "google" | "apple" => p === "google" || p === "apple");

const providerLabel = { google: "Continue with Google", apple: "Continue with Apple" };

export default function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(signInWithPassword, {});

  return (
    <div className="space-y-6">
      {providers.length > 0 && (
        <>
          <form action={signInWithProvider} className="space-y-3">
            {providers.map((p) => (
              <button
                key={p}
                type="submit"
                name="provider"
                value={p}
                className="w-full rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-3.5 font-medium text-white transition active:scale-[0.98] hover:bg-white/[0.1]"
              >
                {providerLabel[p]}
              </button>
            ))}
          </form>
          <div className="flex items-center gap-3 text-xs uppercase tracking-widest text-white/45">
            <span className="h-px flex-1 bg-white/10" />
            or
            <span className="h-px flex-1 bg-white/10" />
          </div>
        </>
      )}

      <form action={action} className="space-y-4">
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          defaultValue={state.email}
          className={input}
        />
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="Password"
          className={input}
        />
        {state.error && <p className="text-sm text-red-300">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-2xl border border-emerald-300/25 bg-emerald-300/15 px-4 py-3.5 font-medium text-emerald-50 transition active:scale-[0.98] hover:bg-emerald-300/25 disabled:opacity-50"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="text-center text-sm">
        <Link href="/forgot-password" className="text-emerald-200/80 underline-offset-4 hover:underline">
          Forgot password, or first time signing in?
        </Link>
      </p>
    </div>
  );
}
