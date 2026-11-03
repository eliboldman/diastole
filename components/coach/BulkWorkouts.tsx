"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteWorkouts, undoDeletes } from "@/lib/workouts/actions";

import { useToast } from "./Toast";

type Row = { id: string; athlete_id: string; athleteName: string; scheduled_date: string; title: string; sport: string; status: string };

export default function BulkWorkouts({ workouts }: { workouts: Row[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const { show, element } = useToast(10000);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allOn = workouts.length > 0 && workouts.every((w) => selected.has(w.id));
  const sentCount = workouts.filter((w) => selected.has(w.id) && w.status === "sent").length;

  const remove = () =>
    start(async () => {
      const ids = [...selected];
      navigator.vibrate?.(15);
      const r = await deleteWorkouts(ids);
      setConfirming(false);
      setSelected(new Set());
      router.refresh();
      if (!r.ok) return show(r.error, { ok: false });
      show(r.message ?? "Deleted.", {
        ok: !/couldn't/.test(r.message ?? ""),
        onUndo: () =>
          start(async () => {
            const u = await undoDeletes(ids);
            router.refresh();
            show(u.ok ? (u.message ?? "Restored.") : u.error, { ok: u.ok });
          }),
      });
    });

  return (
    <section className="mt-6">
      <div className="sticky top-2 z-30 flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-white/10 bg-neutral-950/90 px-3 py-2 backdrop-blur-xl">
        <label className="flex min-h-11 items-center gap-3 px-1 text-sm text-white/70">
          <input
            type="checkbox"
            checked={allOn}
            onChange={() => setSelected(allOn ? new Set() : new Set(workouts.map((w) => w.id)))}
            className="h-5 w-5 accent-emerald-300"
          />
          {selected.size ? `${selected.size} selected` : `${workouts.length} workout${workouts.length === 1 ? "" : "s"}`}
        </label>
        <button
          disabled={!selected.size || pending}
          onClick={() => setConfirming(true)}
          className="min-h-11 rounded-2xl border border-red-300/20 bg-red-300/10 px-4 text-sm font-medium text-red-100 transition active:scale-95 disabled:opacity-30"
        >
          Delete selected
        </button>
      </div>

      {workouts.length === 0 ? (
        <p className="mt-6 text-sm text-white/40">No workouts match.</p>
      ) : (
        <ul className="mt-2">
          {workouts.map((w) => (
            <li key={w.id} className="row-in flex items-center gap-2 border-b border-white/[0.06]">
              <label className="flex h-12 w-11 shrink-0 cursor-pointer items-center justify-center">
                <input type="checkbox" checked={selected.has(w.id)} onChange={() => toggle(w.id)} className="h-5 w-5 accent-emerald-300" aria-label={`Select ${w.title}`} />
              </label>
              <Link href={`/athlete/${w.athlete_id}/workouts/${w.id}`} className="flex min-h-14 min-w-0 flex-1 items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate">{w.title}</span>
                  <span className="text-xs text-white/40">
                    {w.athleteName} ·{" "}
                    {new Date(`${w.scheduled_date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  </span>
                </span>
                <span className={`shrink-0 text-xs uppercase tracking-wider ${w.status === "sent" ? "text-emerald-200/80" : w.status === "draft" ? "text-white/40" : "text-amber-200/80"}`}>
                  {w.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {confirming && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center">
          <div className="toast-in w-full max-w-sm rounded-[28px] border border-white/10 bg-neutral-950 p-6">
            <h3 className="text-lg font-medium">
              Delete {selected.size} workout{selected.size === 1 ? "" : "s"}?
            </h3>
            {sentCount > 0 && (
              <p className="mt-2 text-sm text-amber-100/80">
                {`${sentCount} ${sentCount === 1 ? "is" : "are"} on an athlete's watch and will be removed there too.`}
              </p>
            )}
            <p className="mt-2 text-sm text-white/50">You can undo right after.</p>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setConfirming(false)} className="min-h-12 rounded-2xl px-4 text-sm text-white/60">
                Cancel
              </button>
              <button
                disabled={pending}
                onClick={remove}
                className="min-h-12 rounded-2xl border border-red-300/25 bg-red-300/15 px-5 text-sm font-medium text-red-50 active:scale-95"
              >
                {pending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
      {element}
    </section>
  );
}
