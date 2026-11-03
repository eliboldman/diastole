"use client";

import { Copy, CalendarClock, Minus, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { adjustmentNotes, adjustSteps, describeAdjustment, type Adjustment, type AdjustScope } from "@/lib/workouts/adjust";
import { adjustWorkout, deleteWorkout, duplicateWorkout, rescheduleWorkout, retryRemoval, undoDelete } from "@/lib/workouts/actions";
import { describe } from "@/lib/workouts/describe";
import type { Step } from "@/lib/workouts/garmin-format";

import { useToast } from "./Toast";
import { removalLabel } from "./WorkoutList";

const btn =
  "flex min-h-12 items-center justify-center gap-2 rounded-2xl border px-4 text-sm font-medium transition active:scale-[0.97] disabled:opacity-50";

export default function WorkoutTools({
  workout,
  athleteId,
  athleteName,
  device,
}: {
  workout: {
    id: string;
    title: string;
    scheduledDate: string;
    steps: Step[];
    status: string;
    deletedAt: string | null;
    removalStatus: string | null;
    removalError: string | null;
  };
  athleteId: string;
  athleteName: string;
  device: "garmin" | "apple" | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { show, element } = useToast();
  const [preview, setPreview] = useState<Adjustment | null>(null);
  const [scope, setScope] = useState<AdjustScope>("intensity");
  const [moving, setMoving] = useState(false);
  const [newDate, setNewDate] = useState(workout.scheduledDate);

  const live = workout.status === "sent";
  const target = device === "garmin" ? `${athleteName}'s Garmin` : device === "apple" ? `${athleteName}'s iPhone` : null;

  const run = (fn: () => Promise<{ ok: boolean; id?: string; message?: string; error?: string }>, after?: (id?: string) => void) =>
    start(async () => {
      navigator.vibrate?.(10);
      const r = await fn();
      router.refresh();
      show(r.ok ? (r.message ?? "Done.") : (r.error ?? "Something went wrong."), { ok: r.ok });
      if (r.ok) after?.(r.id);
    });

  // ------------------------------------------------ deleted state
  if (workout.deletedAt) {
    return (
      <div className="rounded-[28px] border border-red-300/15 bg-red-300/[0.04] p-5">
        <p className="font-medium">This workout was deleted.</p>
        <p className={`mt-1 text-sm ${workout.removalStatus === "failed" ? "text-red-300" : "text-white/50"}`}>
          {removalLabel(workout.removalStatus, device)}
          {workout.removalError ? `: ${workout.removalError}` : ""}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button disabled={pending} onClick={() => run(() => undoDelete(workout.id))} className={`${btn} border-emerald-300/25 bg-emerald-300/10 text-emerald-100`}>
            Restore
          </button>
          {workout.removalStatus === "failed" && (
            <button disabled={pending} onClick={() => run(() => retryRemoval(workout.id))} className={`${btn} border-amber-300/25 bg-amber-300/10 text-amber-100`}>
              Retry removing from watch
            </button>
          )}
        </div>
        {element}
      </div>
    );
  }

  const adjusted = preview ? adjustSteps(workout.steps, preview) : null;
  const before = describe(workout.steps);
  const after = adjusted ? describe(adjusted) : [];

  return (
    <div className="grid gap-4">
      {/* Quick adjust */}
      <div className="rounded-[28px] border border-white/10 bg-white/[0.055] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-medium">Quick adjust</h2>
          <div role="radiogroup" aria-label="What to adjust" className="flex rounded-2xl border border-white/10 p-1 text-xs">
            {(["intensity", "duration", "both"] as const).map((s) => (
              <button
                key={s}
                role="radio"
                aria-checked={scope === s}
                onClick={() => setScope(s)}
                className={`min-h-9 rounded-xl px-3 capitalize transition ${scope === s ? "bg-white/10 text-white" : "text-white/50"}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {([
            ["easier", 10],
            ["easier", 5],
            ["harder", 5],
            ["harder", 10],
          ] as const).map(([direction, percent]) => (
            <button
              key={`${direction}${percent}`}
              disabled={pending}
              onClick={() => setPreview({ direction, percent, scope })}
              className={`${btn} ${direction === "harder" ? "border-amber-300/20 bg-amber-300/[0.06] text-amber-100" : "border-sky-300/20 bg-sky-300/[0.06] text-sky-100"}`}
            >
              {direction === "harder" ? <Plus size={16} /> : <Minus size={16} />}
              {direction === "harder" ? "Harder" : "Easier"} {percent}%
            </button>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <button
            disabled={pending}
            onClick={() => run(() => duplicateWorkout(workout.id), (id) => id && router.push(`/athlete/${athleteId}/workouts/${id}`))}
            className={`${btn} border-white/10 bg-white/[0.04]`}
          >
            <Copy size={16} /> Duplicate
          </button>
          <button disabled={pending} onClick={() => setMoving(true)} className={`${btn} border-white/10 bg-white/[0.04]`}>
            <CalendarClock size={16} /> Reschedule
          </button>
          <button
            disabled={pending}
            onClick={() =>
              run(
                () => deleteWorkout(workout.id),
                () =>
                  show("Workout deleted.", {
                    onUndo: () => run(() => undoDelete(workout.id)),
                  }),
              )
            }
            className={`${btn} border-red-300/15 bg-red-300/[0.05] text-red-200`}
          >
            <Trash2 size={16} /> Delete
          </button>
        </div>
      </div>

      {/* Adjust preview */}
      {preview && adjusted && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center">
          <div className="toast-in max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-[28px] border border-white/10 bg-panel p-6">
            <h3 className="text-lg font-medium capitalize">{describeAdjustment(preview)}</h3>
            <p className="mt-1 text-sm text-white/50">Only Active and Interval steps change.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs uppercase tracking-wider text-white/55">Now</p>
                <ol className="list-decimal space-y-1 pl-5 text-sm text-white/55">
                  {before.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ol>
              </div>
              <div>
                <p className="mb-1 text-xs uppercase tracking-wider text-emerald-200/70">After</p>
                <ol className="list-decimal space-y-1 pl-5 text-sm">
                  {after.map((l, i) => (
                    <li key={i} className={l !== before[i] ? "text-emerald-100" : "text-white/55"}>
                      {l}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
            {adjustmentNotes(workout.steps, preview).map((n) => (
              <p key={n} className="mt-3 text-xs text-white/60">
                {n}
              </p>
            ))}
            {live && target && <p className="mt-4 text-sm text-amber-100/80">This replaces the workout on {target}.</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setPreview(null)} className="min-h-12 rounded-2xl px-4 text-sm text-white/60">
                Cancel
              </button>
              <button
                disabled={pending || JSON.stringify(adjusted) === JSON.stringify(workout.steps)}
                onClick={() => run(() => adjustWorkout(workout.id, preview), () => setPreview(null))}
                className={`${btn} border-emerald-300/25 bg-emerald-300/15 text-emerald-50`}
              >
                {pending ? "Saving…" : live && target ? "Apply & update watch" : "Apply"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule */}
      {moving && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center">
          <div className="toast-in w-full max-w-sm rounded-[28px] border border-white/10 bg-panel p-6">
            <h3 className="text-lg font-medium">Move “{workout.title}”</h3>
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="mt-4 min-h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-base text-white"
            />
            {live && target && <p className="mt-3 text-sm text-amber-100/80">This moves it on {target} too.</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setMoving(false)} className="min-h-12 rounded-2xl px-4 text-sm text-white/60">
                Cancel
              </button>
              <button
                disabled={pending || newDate === workout.scheduledDate}
                onClick={() => run(() => rescheduleWorkout(workout.id, newDate), () => setMoving(false))}
                className={`${btn} border-emerald-300/25 bg-emerald-300/15 text-emerald-50`}
              >
                {pending ? "Moving…" : "Move"}
              </button>
            </div>
          </div>
        </div>
      )}
      {element}
    </div>
  );
}
