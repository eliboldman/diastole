"use client";

import { Check } from "lucide-react";
import { useState, useTransition } from "react";

import { setPodSharing, type PodSharing as Sharing } from "@/lib/activity/actions";

const RUNGS = [
  { id: "avatar", title: "Avatar and name", sub: "Pod mates see who you are. Nothing else." },
  { id: "readiness", title: "+ Readiness", sub: "Today's flag and note, and which muscles are still recovering." },
  { id: "training", title: "+ Training and performance", sub: "Your workouts in the pod feed (so they can give props), FTP, threshold pace, PRs and goal race." },
  { id: "details", title: "+ Workout details", sub: "Charts, laps, zones and the route (start and finish hidden), with pod mates who share theirs too." },
] as const;

const HEALTH = [
  { id: "hrv", label: "HRV and resting heart rate" },
  { id: "sleep", label: "Sleep" },
  { id: "stress", label: "Stress" },
] as const;

function Switch({ on, onFlip, label, disabled }: { on: boolean; onFlip: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onFlip}
      disabled={disabled}
      className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition active:scale-95 ${on ? "border-emerald-300/40 bg-emerald-300/30" : "border-white/15 bg-white/[0.08]"} disabled:opacity-60`}
    >
      <span className={`inline-block h-6 w-6 rounded-full bg-white shadow transition-transform ${on ? "translate-x-7" : "translate-x-1"}`} />
    </button>
  );
}

/** What pod mates see of me: a ladder of levels, plus health items that are always a separate yes. */
export default function PodSharing({ initial }: { initial: Sharing }) {
  const [s, setS] = useState(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);
  const rung = s.details ? 3 : s.level;

  const save = (next: Sharing) => {
    const prev = s;
    setS(next);
    navigator.vibrate?.(5);
    start(async () => {
      try {
        await setPodSharing(next);
        setError(false);
      } catch {
        setS(prev);
        setError(true);
      }
    });
  };
  const pick = (i: number) => save({ ...s, level: (Math.min(i, 2) as 0 | 1 | 2), details: i === 3 });

  return (
    <div>
      <p className="font-medium">What your pods see</p>
      <p className="mt-1 text-sm text-white/55">Your coach always sees everything. Pod mates see only what you choose here.</p>
      <ol className="mt-3 grid gap-1.5" role="radiogroup" aria-label="Pod sharing level">
        {RUNGS.map((r, i) => {
          const on = i <= rung;
          return (
            <li key={r.id}>
              <button
                type="button"
                role="radio"
                aria-checked={i === rung}
                disabled={pending}
                onClick={() => pick(i)}
                className={`flex w-full items-start gap-3 rounded-2xl border px-3 py-2.5 text-left transition active:scale-[0.99] ${
                  i === rung ? "border-emerald-300/40 bg-emerald-300/[0.08]" : on ? "border-emerald-300/15 bg-emerald-300/[0.03]" : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
                }`}
              >
                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${on ? "border-emerald-300 bg-emerald-300 text-black" : "border-white/25"}`}>
                  {on && <Check size={12} strokeWidth={3} />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{r.title}</span>
                  <span className="block text-xs text-white/50">{r.sub}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <p className="mt-5 text-sm font-medium">Health data</p>
      <p className="mt-0.5 text-xs text-white/50">Never shared unless you turn on that specific item.</p>
      <ul className="mt-2 grid gap-2">
        {HEALTH.map((h) => (
          <li key={h.id} className="flex min-h-11 items-center justify-between gap-3">
            <span className="text-sm text-white/80">{h.label}</span>
            <Switch on={s[h.id]} onFlip={() => save({ ...s, [h.id]: !s[h.id] })} label={`Share ${h.label} with my pods`} disabled={pending} />
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-200">
          Couldn&apos;t save. Try again.
        </p>
      )}
    </div>
  );
}
