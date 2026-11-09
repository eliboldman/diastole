"use client";

import { useActionState } from "react";

import { connectIntervals, type ConnectState } from "@/lib/intervals/actions";

export default function IntervalsConnectForm() {
  const [state, action, pending] = useActionState<ConnectState, FormData>(connectIntervals, null);
  return (
    <form action={action} className="rounded-[24px] border border-white/10 bg-white/[0.05] p-5">
      <label htmlFor="icu-key" className="text-sm font-medium text-white/80">
        intervals.icu API key
      </label>
      <div className="mt-3 flex min-w-0 flex-wrap gap-3">
        <input
          id="icu-key"
          name="api_key"
          required
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          type="password"
          placeholder="Paste your API key"
          className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 font-mono text-base text-white placeholder:text-white/30 focus:border-emerald-300/40 focus:outline-none"
        />
        <button
          disabled={pending}
          className="inline-flex min-h-12 items-center rounded-2xl border border-emerald-300/25 bg-emerald-300/15 px-5 text-sm font-medium text-emerald-50 transition hover:bg-emerald-300/25 active:scale-95 disabled:opacity-50"
        >
          {pending ? "Connecting…" : "Connect"}
        </button>
      </div>
      {state && (
        <p role="status" className={`mt-3 text-sm ${state.ok ? "text-emerald-200" : "text-red-200"}`}>
          {state.ok ? state.message : state.error}
        </p>
      )}
    </form>
  );
}
