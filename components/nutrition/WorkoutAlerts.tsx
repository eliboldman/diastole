"use client";

import { useState, useTransition } from "react";

import { setNotifyPrefs, type NotifyPrefs } from "@/lib/activity/actions";

/** Dietitian on/off for "athlete finished a workout" alerts (the 'fuel' notification setting). */
export default function WorkoutAlerts({ initial }: { initial: NotifyPrefs }) {
  const [prefs, setPrefs] = useState(initial);
  const [pending, start] = useTransition();
  const on = prefs.fuel !== false;
  const flip = () => {
    const before = prefs;
    const next = { ...prefs, fuel: !on };
    setPrefs(next);
    start(async () => {
      try {
        await setNotifyPrefs(next);
      } catch {
        setPrefs(before);
      }
    });
  };
  return (
    <div className="mt-6 flex max-w-2xl items-center justify-between gap-4 rounded-[24px] border border-white/10 bg-white/[0.04] px-5 py-4">
      <p className="min-w-0 text-sm text-white/80">
        Workout alerts
        <span className="block text-xs text-white/50">About 30 minutes after an athlete&apos;s workout syncs: what they did and whether they&apos;ve logged protein since.</span>
      </p>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Workout alerts"
        disabled={pending}
        onClick={flip}
        className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition active:scale-95 ${on ? "border-emerald-300/40 bg-emerald-300/30" : "border-white/15 bg-white/[0.08]"} disabled:opacity-60`}
      >
        <span className={`inline-block h-6 w-6 rounded-full bg-white shadow transition-transform ${on ? "translate-x-7" : "translate-x-1"}`} />
      </button>
    </div>
  );
}
