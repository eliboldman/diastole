"use client";

import { useActionState } from "react";

import { claimDeviceCode, type PairState } from "@/lib/devices/actions";

const NAMES: Record<string, string> = { garmin_watch: "Your watch", garmin_field: "Your fuel field", apple_tv: "Your Apple TV" };

export default function DevicePairForm({ initialCode = "" }: { initialCode?: string }) {
  const [state, action, pending] = useActionState<PairState, FormData>(claimDeviceCode, null);
  return (
    <form action={action} className="rounded-[24px] border border-white/10 bg-white/[0.05] p-5">
      <label htmlFor="device-code" className="text-sm font-medium text-white/80">
        Code on your watch or TV
      </label>
      <div className="mt-3 flex min-w-0 flex-wrap gap-3">
        <input
          id="device-code"
          name="code"
          required
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={8}
          defaultValue={initialCode}
          placeholder="ABC234"
          className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 font-mono text-xl uppercase tracking-[0.3em] text-white placeholder:text-white/25 focus:border-emerald-300/40 focus:outline-none"
        />
        <button
          disabled={pending}
          className="inline-flex min-h-12 items-center rounded-2xl border border-emerald-300/25 bg-emerald-300/15 px-5 text-sm font-medium text-emerald-50 transition hover:bg-emerald-300/25 active:scale-95 disabled:opacity-50"
        >
          {pending ? "Checking…" : "Sign in device"}
        </button>
      </div>
      {state && (
        <p role="status" className={`mt-3 text-sm ${state.ok ? "text-emerald-200" : "text-red-200"}`}>
          {state.ok
            ? state.kind === "garmin_field"
              ? "Linked. The fuel field checks in every 5 minutes, so it can take up to 5 minutes to show your plan."
              : `${NAMES[state.kind] ?? "Your device"} will sign in within a few seconds.`
            : state.error}
        </p>
      )}
    </form>
  );
}
