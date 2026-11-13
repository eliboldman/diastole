"use client";

import { ArrowLeftRight } from "lucide-react";

import type { View } from "@/lib/view";

/**
 * Coaches only: flips the whole app between the coach menu (team, lab, athletes) and the athlete
 * menu (your own Today, training, fuel, grit). Navigation only, never a permission change.
 */
export default function ViewSwitch({ view, onSwitch, compact = false }: { view: View; onSwitch: (next: View) => void; compact?: boolean }) {
  const next: View = view === "coach" ? "athlete" : "coach";
  if (compact) {
    return (
      <button
        type="button"
        onClick={() => onSwitch(next)}
        aria-label={`You're in ${view} view. Switch to ${next} view`}
        className={`flex h-9 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold transition active:scale-95 ${
          view === "athlete" ? "border-sky-300/30 bg-sky-300/[0.12] text-sky-100" : "border-emerald-300/30 bg-emerald-300/[0.12] text-emerald-100"
        }`}
      >
        <ArrowLeftRight size={13} aria-hidden />
        {view === "coach" ? "Coach" : "Athlete"}
      </button>
    );
  }
  return (
    <div role="radiogroup" aria-label="View" className="flex h-10 items-center rounded-xl border border-white/10 bg-white/[0.04] p-0.5 text-xs font-semibold">
      {(["coach", "athlete"] as const).map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={view === v}
          onClick={() => view !== v && onSwitch(v)}
          className={`h-full rounded-[10px] px-3 transition ${view === v ? (v === "athlete" ? "bg-sky-300/20 text-sky-100" : "bg-emerald-300/20 text-emerald-100") : "text-white/55 hover:text-white"}`}
        >
          {v === "coach" ? "Coach" : "Athlete"}
        </button>
      ))}
    </div>
  );
}
