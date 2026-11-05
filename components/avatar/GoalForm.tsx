"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setGoals } from "@/lib/avatar/actions";

type Goals = { race_name: string | null; race_date: string | null; block_name: string | null; block_ends: string | null };

const input =
  "min-h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-3 text-base text-white placeholder:text-white/35 focus:border-emerald-300/40 focus:outline-none sm:text-sm";

/** The coach's inline editor for an athlete's goal race and training block. */
export default function GoalForm({ athleteId, goals }: { athleteId: string; goals: Goals | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    race_name: goals?.race_name ?? "",
    race_date: goals?.race_date ?? "",
    block_name: goals?.block_name ?? "",
    block_ends: goals?.block_ends ?? "",
  });
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm text-emerald-200 hover:bg-white/[0.05]">
        <Pencil size={14} /> {goals?.race_name || goals?.block_name ? "Edit" : "Set goal race and block"}
      </button>
    );
  return (
    <form
      className="mt-3 grid gap-2 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await setGoals(athleteId, f);
          if (!r.ok) return setError(r.error);
          setOpen(false);
          router.refresh();
        });
      }}
    >
      <input className={input} placeholder="Goal race (e.g. Boston Marathon)" maxLength={80} value={f.race_name} onChange={(e) => setF({ ...f, race_name: e.target.value })} aria-label="Goal race" />
      <input className={input} type="date" value={f.race_date} onChange={(e) => setF({ ...f, race_date: e.target.value })} aria-label="Race date" />
      <input className={input} placeholder="Training block (e.g. Base 2)" maxLength={60} value={f.block_name} onChange={(e) => setF({ ...f, block_name: e.target.value })} aria-label="Training block" />
      <input className={input} type="date" value={f.block_ends} onChange={(e) => setF({ ...f, block_ends: e.target.value })} aria-label="Block ends" />
      <div className="flex items-center gap-2 sm:col-span-2">
        <button type="submit" disabled={pending} className="min-h-11 rounded-full bg-emerald-300 px-5 text-sm font-medium text-black disabled:opacity-60">
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-11 rounded-full px-4 text-sm text-white/60 hover:bg-white/[0.05]">
          Cancel
        </button>
        {error && <span role="alert" className="text-sm text-red-200">{error}</span>}
      </div>
    </form>
  );
}
