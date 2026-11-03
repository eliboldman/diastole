"use client";

import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";

import { deleteWorkout, retryRemoval, undoDelete } from "@/lib/workouts/actions";

import { useToast } from "./Toast";

export type WorkoutRowLite = { id: string; scheduled_date: string; title: string; status: string };
export type RemovedRow = WorkoutRowLite & { removal_status: string | null; removal_error: string | null; deleted_at: string };

const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

export function removalLabel(status: string | null, device: string | null) {
  if (status === "failed") return "Couldn't remove from watch";
  if (status === "pending_sync")
    return device === "apple" ? "Removed · waiting for iPhone sync" : "Removed · waiting for watch sync";
  return "Removed";
}

export default function WorkoutList({
  athleteId,
  workouts,
  removed,
  device,
}: {
  athleteId: string;
  workouts: WorkoutRowLite[];
  removed: RemovedRow[];
  device: string | null;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const { show, element } = useToast();
  // Hide a row the instant it's tapped; the server confirms in the background.
  const [visible, hide] = useOptimistic(workouts, (list, id: string) => list.filter((w) => w.id !== id));

  const remove = (w: WorkoutRowLite) =>
    start(async () => {
      hide(w.id);
      navigator.vibrate?.(10);
      const r = await deleteWorkout(w.id);
      router.refresh();
      if (!r.ok) return show(r.error, { ok: false });
      show(r.message?.startsWith("Deleted here") ? r.message : `Deleted “${w.title}”.`, {
        ok: !r.message?.startsWith("Deleted here"),
        onUndo: () =>
          start(async () => {
            const u = await undoDelete(w.id);
            router.refresh();
            show(u.ok ? (u.message ?? "Restored.") : u.error, { ok: u.ok && !/failed/.test(u.message ?? "") });
          }),
      });
    });

  return (
    <>
      {visible.length === 0 ? (
        <p className="mt-3 text-sm text-white/55">Nothing scheduled.</p>
      ) : (
        <ul className="mt-3 space-y-1 text-sm">
          {visible.map((w) => (
            <li key={w.id} className="row-in flex items-center gap-1 border-t border-white/[0.09]">
              <Link
                href={`/athlete/${athleteId}/workouts/${w.id}`}
                className="flex min-h-12 min-w-0 flex-1 items-center justify-between gap-3 rounded-xl px-2 py-2 transition active:scale-[0.99] hover:bg-white/[0.04]"
              >
                <span className="min-w-0 truncate">
                  <span className="text-white/50">{day(w.scheduled_date)}</span> {w.title}
                </span>
                <span
                  className={`shrink-0 text-xs uppercase tracking-wider ${
                    w.status === "sent" ? "text-emerald-200/80" : w.status === "draft" ? "text-white/55" : "text-amber-200/80"
                  }`}
                >
                  {w.status}
                </span>
              </Link>
              <button
                onClick={() => remove(w)}
                aria-label={`Delete ${w.title}`}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white/50 transition active:scale-90 hover:bg-red-400/10 hover:text-red-300"
              >
                <Trash2 size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {removed.length > 0 && (
        <details className="mt-5 text-sm">
          <summary className="cursor-pointer select-none py-2 text-white/60 hover:text-white/70">
            Recently removed ({removed.length})
          </summary>
          <ul className="mt-1 space-y-1">
            {removed.map((w) => (
              <li key={w.id} className="flex min-h-11 items-center justify-between gap-3 border-t border-white/[0.09] px-2 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-white/50 line-through decoration-white/20">
                    {day(w.scheduled_date)} {w.title}
                  </span>
                  <span className={`text-xs ${w.removal_status === "failed" ? "text-red-300" : "text-white/50"}`}>
                    {removalLabel(w.removal_status, device)}
                    {w.removal_error ? `: ${w.removal_error}` : ""}
                  </span>
                </span>
                <span className="flex shrink-0 gap-1">
                  {w.removal_status === "failed" && (
                    <button
                      onClick={() =>
                        start(async () => {
                          const r = await retryRemoval(w.id);
                          router.refresh();
                          show(r.ok ? (r.message ?? "Removed.") : r.error, { ok: r.ok });
                        })
                      }
                      className="min-h-11 rounded-xl px-3 text-amber-200 active:scale-95"
                    >
                      Retry
                    </button>
                  )}
                  <button
                    onClick={() =>
                      start(async () => {
                        const r = await undoDelete(w.id);
                        router.refresh();
                        show(r.ok ? (r.message ?? "Restored.") : r.error, { ok: r.ok });
                      })
                    }
                    className="min-h-11 rounded-xl px-3 text-emerald-200 active:scale-95"
                  >
                    Restore
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {element}
    </>
  );
}
