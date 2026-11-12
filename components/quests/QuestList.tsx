"use client";

import { Check, Watch } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { GritMark } from "@/components/grit/Art";
import { completeQuest, undoQuest } from "@/lib/quests/actions";
import type { TodayQuest } from "@/lib/quests/data";
import { haptic } from "@/lib/haptics";

/** Tap to tick off (grit lands right away); tap again the same day to undo. Watch-counted ones stay ticked. */
export default function QuestList({ quests }: { quests: TodayQuest[] }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [done, setDone] = useState<Record<string, boolean>>(() => Object.fromEntries(quests.map((q) => [q.key, q.done])));
  const [popped, setPopped] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = (q: TodayQuest) => {
    if (q.byWatch) return;
    const next = !done[q.key];
    setDone((d) => ({ ...d, [q.key]: next }));
    setError(null);
    if (next) {
      setPopped(q.key);
      haptic("success");
    }
    start(async () => {
      const r = next ? await completeQuest(q.key) : await undoQuest(q.key);
      if (!r.ok) {
        setDone((d) => ({ ...d, [q.key]: !next }));
        setError(r.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <>
      <ul className="mt-3 grid gap-2">
        {quests.map((q) => {
          const on = done[q.key];
          return (
            <li key={q.key} className="relative">
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(q)}
                className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition active:scale-[0.99] ${on ? "border-emerald-300/35 bg-emerald-300/[0.10]" : "border-white/10 bg-white/[0.04] hover:bg-white/[0.07]"}`}
              >
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition ${on ? "border-emerald-300 bg-emerald-300 text-black" : "border-white/25"} ${popped === q.key && on ? "success-pop" : ""}`}>
                  {on && <Check size={15} strokeWidth={3} aria-hidden />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm font-medium ${on ? "text-emerald-50" : ""}`}>
                    {q.title}
                    {q.coach && <span className="ml-2 rounded-full border border-emerald-300/25 px-1.5 text-[10px] uppercase tracking-wider text-emerald-200/80">Coach</span>}
                  </span>
                  <span className="block text-xs text-white/55">{q.byWatch ? (q.auto === "walk" ? "Counted from your watch." : "Counted from your recovery routine.") : q.blurb}</span>
                </span>
                <span className={`flex shrink-0 items-center gap-1 text-xs tabular-nums ${on ? "text-emerald-200" : "text-white/45"}`}>
                  {q.byWatch && <Watch size={12} aria-hidden />}
                  <GritMark size={12} /> {q.grit}
                </span>
              </button>
              {popped === q.key && on && (
                <span aria-hidden className="grit-float pointer-events-none absolute right-6 top-0 text-sm font-bold text-emerald-200">
                  +{q.grit}
                </span>
              )}
              {q.href && !on && (
                <Link href={q.href} className="mt-1 inline-flex min-h-9 items-center pl-13 text-xs text-emerald-200 hover:underline">
                  Pick a routine →
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-200">
          {error}
        </p>
      )}
    </>
  );
}
