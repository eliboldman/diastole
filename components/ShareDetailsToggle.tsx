"use client";

import { useOptimistic, useTransition } from "react";

import { setShareWorkoutDetails } from "@/lib/activity/actions";

/** The athlete's switch for sharing full workout details (charts, laps, route) with pod mates. */
export default function ShareDetailsToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useOptimistic(initial);
  const [pending, start] = useTransition();

  const flip = () =>
    start(async () => {
      setOn(!on);
      await setShareWorkoutDetails(!on);
    });

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p id="share-details-label" className="font-medium">
          Share workout details with my pods
        </p>
        <p className="mt-1 text-sm text-white/55">
          Lets pod mates who also share open your workouts: charts, laps, zones and the route (with the start and finish hidden). Your coach can
          always see them. Off unless you turn it on.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby="share-details-label"
        onClick={flip}
        disabled={pending}
        className={`relative mt-1 inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition ${
          on ? "border-emerald-300/40 bg-emerald-300/30" : "border-white/15 bg-white/[0.08]"
        } disabled:opacity-60`}
      >
        <span className={`inline-block h-6 w-6 rounded-full bg-white shadow transition-transform ${on ? "translate-x-7" : "translate-x-1"}`} />
      </button>
    </div>
  );
}
