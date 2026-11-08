"use client";

import { useState, useTransition } from "react";

import { saveAdjustConditions } from "@/lib/weather-actions";

/** Opt-in: show workout targets adjusted for heat and altitude. */
export default function ConditionsToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [, start] = useTransition();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => {
        const v = !on;
        setOn(v);
        start(async () => {
          const r = await saveAdjustConditions(v);
          if (!r.ok) setOn(!v);
        });
      }}
      className="mt-4 flex min-h-12 w-full items-center justify-between gap-4 text-left"
    >
      <span>
        <span className="block text-sm">Adjust for heat and altitude</span>
        <span className="block text-xs text-white/50">Workouts show slower paces (and lower power) on hot days or up high, with a short note why</span>
      </span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition ${on ? "bg-emerald-300" : "bg-white/15"}`} aria-hidden>
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-6" : "left-1"}`} />
      </span>
    </button>
  );
}
