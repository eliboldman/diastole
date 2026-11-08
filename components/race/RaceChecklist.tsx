"use client";

import { Check } from "lucide-react";
import { useOptimistic, useTransition } from "react";

import { toggleRaceCheck } from "@/lib/fuel/race-actions";

/** Race-week to-dos for the current phase. Ticks are saved on the race (shared with the coach). */
export default function RaceChecklist({ raceId, items, done }: { raceId: string; items: { key: string; label: string }[]; done: Record<string, boolean> }) {
  const [state, setState] = useOptimistic(done, (s, a: { key: string; v: boolean }) => ({ ...s, [a.key]: a.v }));
  const [, start] = useTransition();
  return (
    <ul className="space-y-2">
      {items.map((it) => {
        const on = Boolean(state[it.key]);
        return (
          <li key={it.key}>
            <button
              type="button"
              aria-pressed={on}
              onClick={() =>
                start(async () => {
                  setState({ key: it.key, v: !on });
                  await toggleRaceCheck(raceId, it.key, !on);
                })
              }
              className="flex min-h-12 w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-left text-sm"
            >
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border ${on ? "border-emerald-300 bg-emerald-300 text-black" : "border-white/25"}`}>{on && <Check size={15} strokeWidth={3} />}</span>
              <span className={on ? "text-white/50 line-through" : "text-white/85"}>{it.label}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
