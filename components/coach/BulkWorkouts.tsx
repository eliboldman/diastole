"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { approveAndSendMany } from "@/app/(coach)/athlete/[id]/workouts/actions";
import { copyWorkoutsToAthletes, deleteWorkouts, undoDeletes } from "@/lib/workouts/actions";

import { useToast } from "./Toast";

type Row = { id: string; athlete_id: string; athleteName: string; scheduled_date: string; title: string; sport: string; status: string };

export default function BulkWorkouts({ workouts, athletes = [] }: { workouts: Row[]; athletes?: { id: string; name: string }[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [approving, setApproving] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [to, setTo] = useState<Set<string>>(new Set());
  const [keepDates, setKeepDates] = useState(true);
  const [onDate, setOnDate] = useState("");
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
  const drafts = workouts.filter((w) => w.status === "draft");
  const pickedDrafts = drafts.filter((w) => selected.has(w.id));
  const pickedAthletes = new Set(pickedDrafts.map((w) => w.athleteName)).size;
  const today = new Date().toLocaleDateString("en-CA");
  const pastDrafts = pickedDrafts.filter((w) => w.scheduled_date < today).length;

  const picked = workouts.filter((w) => selected.has(w.id));
  const fromIds = new Set(picked.map((w) => w.athlete_id));
  const assign = () =>
    start(async () => {
      const r = await copyWorkoutsToAthletes([...selected], [...to], keepDates ? undefined : onDate);
      setAssigning(false);
      setTo(new Set());
      setSelected(new Set());
      router.refresh();
      show(r.ok ? (r.message ?? "Assigned.") : r.error, { ok: r.ok });
    });

  const approve = () =>
    start(async () => {
      navigator.vibrate?.(15);
      const r = await approveAndSendMany(pickedDrafts.map((w) => w.id));
      setApproving(false);
      setSelected(new Set());
      router.refresh();
      show(r.ok ? r.message : r.error, { ok: r.ok && !/didn't send/.test(r.message) });
    });

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
      <div className="sticky top-[calc(env(safe-area-inset-top)+3.5rem)] z-30 flex min-h-14 md:top-2 items-center justify-between gap-3 rounded-2xl border border-white/10 bg-canvas/90 px-3 py-2 backdrop-blur-xl">
        <label className="flex min-h-11 items-center gap-3 px-1 text-sm text-white/70">
          <input
            type="checkbox"
            checked={allOn}
            onChange={() => setSelected(allOn ? new Set() : new Set(workouts.map((w) => w.id)))}
            className="h-5 w-5 accent-emerald-300"
          />
          {selected.size ? `${selected.size} selected` : `${workouts.length} workout${workouts.length === 1 ? "" : "s"}`}
        </label>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            disabled={!pickedDrafts.length || pending}
            onClick={() => setApproving(true)}
            className="min-h-11 rounded-2xl bg-emerald-300 px-4 text-sm font-medium text-black transition active:scale-95 disabled:opacity-30"
          >
            {pickedDrafts.length ? `Approve & send ${pickedDrafts.length}` : "Approve & send"}
          </button>
          {athletes.length > 0 && (
            <button
              disabled={!selected.size || pending}
              onClick={() => setAssigning(true)}
              className="min-h-11 rounded-2xl border border-white/15 bg-white/[0.06] px-4 text-sm font-medium text-white/90 transition active:scale-95 disabled:opacity-30"
            >
              Assign
            </button>
          )}
          <button
            disabled={!selected.size || pending}
            onClick={() => setConfirming(true)}
            className="min-h-11 rounded-2xl border border-red-300/20 bg-red-300/10 px-4 text-sm font-medium text-red-100 transition active:scale-95 disabled:opacity-30"
          >
            Delete
          </button>
        </div>
      </div>
      {drafts.length > 0 && pickedDrafts.length < drafts.length && (
        <button type="button" onClick={() => setSelected(new Set(drafts.map((w) => w.id)))} className="mt-1 min-h-11 px-2 text-sm text-emerald-200 hover:underline">
          Select all {drafts.length} draft{drafts.length === 1 ? "" : "s"}
        </button>
      )}

      {workouts.length === 0 ? (
        <p className="mt-6 text-sm text-white/55">
          No workouts here.{" "}
          <Link href="/endurance-lab" className="text-emerald-200 hover:underline">
            Build one in the Endurance Lab →
          </Link>
        </p>
      ) : (
        <ul className="mt-2">
          {workouts.map((w) => (
            <li key={w.id} className="row-in flex items-center gap-2 border-b border-white/[0.09]">
              <label className="flex h-12 w-11 shrink-0 cursor-pointer items-center justify-center">
                <input type="checkbox" checked={selected.has(w.id)} onChange={() => toggle(w.id)} className="h-5 w-5 accent-emerald-300" aria-label={`Select ${w.title}`} />
              </label>
              <Link href={`/athlete/${w.athlete_id}/workouts/${w.id}`} className="flex min-h-14 min-w-0 flex-1 items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate">{w.title}</span>
                  <span className="text-xs text-white/55">
                    {w.athleteName} ·{" "}
                    {new Date(`${w.scheduled_date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  </span>
                </span>
                <span className={`shrink-0 text-xs uppercase tracking-wider ${w.status === "sent" ? "text-emerald-200/80" : w.status === "completed" ? "text-white/45" : w.status === "draft" ? "text-white/55" : "text-amber-200/80"}`}>
                  {w.status === "completed" ? "done" : w.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {assigning && (
        <div role="dialog" aria-modal="true" aria-labelledby="assign-title" className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center">
          <div className="toast-in flex max-h-[85dvh] w-full max-w-sm flex-col rounded-[28px] border border-white/10 bg-panel p-6">
            <h3 id="assign-title" className="text-lg font-medium">
              Assign {selected.size} workout{selected.size === 1 ? "" : "s"} to…
            </h3>
            <p className="mt-1 text-sm text-white/55">Each athlete gets a copy as a draft, with targets from their own zones.</p>
            <ul className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {athletes.map((a) => {
                const only = fromIds.size === 1 && fromIds.has(a.id);
                return (
                  <li key={a.id}>
                    <label className={`flex min-h-12 items-center gap-3 text-sm ${only ? "text-white/35" : ""}`}>
                      <input
                        type="checkbox"
                        disabled={only}
                        checked={to.has(a.id)}
                        onChange={() =>
                          setTo((s) => {
                            const n = new Set(s);
                            if (n.has(a.id)) n.delete(a.id);
                            else n.add(a.id);
                            return n;
                          })
                        }
                        className="h-5 w-5 accent-emerald-300"
                      />
                      <span className="min-w-0 flex-1 truncate">{a.name}</span>
                      {only && <span className="text-xs">already theirs</span>}
                    </label>
                  </li>
                );
              })}
            </ul>
            <fieldset className="mt-3 grid gap-1 border-t border-white/10 pt-3 text-sm">
              <label className="flex min-h-11 items-center gap-3">
                <input type="radio" name="assign-date" checked={keepDates} onChange={() => setKeepDates(true)} className="h-5 w-5 accent-emerald-300" />
                Same date{selected.size === 1 ? "" : "s"} as now
              </label>
              <label className="flex min-h-11 items-center gap-3">
                <input type="radio" name="assign-date" checked={!keepDates} onChange={() => setKeepDates(false)} className="h-5 w-5 accent-emerald-300" />
                On
                <input
                  type="date"
                  value={onDate}
                  onChange={(e) => {
                    setOnDate(e.target.value);
                    setKeepDates(false);
                  }}
                  aria-label="Date"
                  className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-base text-white"
                />
              </label>
            </fieldset>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setAssigning(false)} className="min-h-12 rounded-2xl px-4 text-sm text-white/60">
                Cancel
              </button>
              <button
                disabled={pending || !to.size || (!keepDates && !onDate)}
                onClick={assign}
                className="min-h-12 rounded-2xl bg-emerald-300 px-5 text-sm font-medium text-black active:scale-95 disabled:opacity-40"
              >
                {pending ? "Assigning…" : to.size ? `Assign to ${to.size}` : "Assign"}
              </button>
            </div>
          </div>
        </div>
      )}

      {approving && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center">
          <div className="toast-in w-full max-w-sm rounded-[28px] border border-white/10 bg-panel p-6">
            <h3 className="text-lg font-medium">
              Approve and send {pickedDrafts.length} workout{pickedDrafts.length === 1 ? "" : "s"}?
            </h3>
            <p className="mt-2 text-sm text-white/60">
              {pickedAthletes === 1 ? `For ${pickedDrafts[0]?.athleteName}.` : `Across ${pickedAthletes} athletes.`}{" "}Each goes to that athlete&apos;s watch (Garmin) or their Diastole app (Apple Watch), and they&apos;re notified.
            </p>
            {pastDrafts > 0 && <p className="mt-2 text-sm text-amber-100/80">{`${pastDrafts} ${pastDrafts === 1 ? "is" : "are"} dated in the past.`}</p>}
            {selected.size > pickedDrafts.length && <p className="mt-2 text-sm text-white/50">{`${selected.size - pickedDrafts.length} selected ${selected.size - pickedDrafts.length === 1 ? "isn't a draft" : "aren't drafts"} and will be left as is.`}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setApproving(false)} className="min-h-12 rounded-2xl px-4 text-sm text-white/60">
                Cancel
              </button>
              <button disabled={pending} onClick={approve} className="min-h-12 rounded-2xl bg-emerald-300 px-5 text-sm font-medium text-black active:scale-95 disabled:opacity-50">
                {pending ? "Sending…" : "Approve & send"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirming && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center">
          <div className="toast-in w-full max-w-sm rounded-[28px] border border-white/10 bg-panel p-6">
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
