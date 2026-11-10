"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { assignFromLibrary, deleteLibraryItem, updateLibraryItem } from "@/lib/workouts/actions";
import WorkoutSummary from "@/components/workouts/WorkoutSummary";
import { describe } from "@/lib/workouts/describe";
import type { PoolUnit, Step } from "@/lib/workouts/garmin-format";

import { useToast } from "./Toast";

type Item = {
  id: string;
  title: string;
  sport: string;
  workout_type: string;
  tags: string[];
  description: string | null;
  steps: Step[];
  pool_length?: number | null;
  pool_unit?: PoolUnit | null;
  use_count: number;
  last_used_at: string | null;
};

const TYPES = ["easy", "long", "tempo", "threshold", "intervals", "recovery", "race", "other"];
const chip = "min-h-10 rounded-full border px-3 text-sm capitalize transition active:scale-95";
const tomorrow = () => new Date(Date.now() + 86400_000).toLocaleDateString("en-CA");

export default function Library({
  items,
  athletes,
  units = "mi",
  initialQuery = "",
}: {
  initialQuery?: string;
  items: Item[];
  athletes: { id: string; name: string }[];
  units?: "mi" | "km";
}) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);
  const [sport, setSport] = useState<string>("");
  const [type, setType] = useState<string>("");
  const [open, setOpen] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<Item | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [date, setDate] = useState(tomorrow);
  const [pending, start] = useTransition();
  const { show, element } = useToast();

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return items.filter(
      (i) =>
        (!sport || i.sport === sport) &&
        (!type || i.workout_type === type) &&
        (!t || i.title.toLowerCase().includes(t) || i.tags.some((g) => g.includes(t)) || (i.description ?? "").toLowerCase().includes(t)),
    );
  }, [items, q, sport, type]);

  const save = (id: string, patch: Parameters<typeof updateLibraryItem>[1]) =>
    start(async () => {
      const r = await updateLibraryItem(id, patch);
      router.refresh();
      if (!r.ok) show(r.error, { ok: false });
    });

  return (
    <div className="mt-6">
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/45" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search titles and tags"
          className="min-h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] pl-11 pr-4 text-base placeholder:text-white/45 focus:border-emerald-300/40 focus:outline-none"
        />
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {["", "run", "bike", "swim"].map((s) => (
          <button key={s || "all"} onClick={() => setSport(s)} className={`${chip} shrink-0 ${sport === s ? "border-emerald-300/30 bg-emerald-300/15 text-emerald-50" : "border-white/10 text-white/55"}`}>
            {s || "All sports"}
          </button>
        ))}
        <span className="mx-1 w-px shrink-0 bg-white/10" />
        {["", ...TYPES].map((t) => (
          <button key={t || "any"} onClick={() => setType(t)} className={`${chip} shrink-0 ${type === t ? "border-emerald-300/30 bg-emerald-300/15 text-emerald-50" : "border-white/10 text-white/55"}`}>
            {t || "Any type"}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="mt-8 text-sm text-white/55">
          {items.length ? "Nothing matches." : "Your library is empty. Workouts you build in the Endurance Lab show up here automatically, or import them from Garmin Connect."}
        </p>
      ) : (
        <ul className="mt-4 grid gap-3 lg:grid-cols-2">
          {shown.map((i) => (
            <li key={i.id} className="row-in rounded-[24px] border border-white/10 bg-white/[0.055] p-4">
              <div className="flex items-start justify-between gap-3">
                <button onClick={() => setOpen(open === i.id ? null : i.id)} className="min-w-0 text-left">
                  <p className="truncate font-medium">{i.title}</p>
                  <p className="mt-0.5 text-xs text-white/55">
                    <span className="capitalize">{i.sport}</span> · <span className="capitalize">{i.workout_type}</span>
                    {i.use_count ? ` · used ${i.use_count}×` : ""}
                  </p>
                </button>
                <button
                  onClick={() => {
                    setAssigning(i);
                    setPicked(new Set());
                    setDate(tomorrow());
                  }}
                  className="min-h-11 shrink-0 rounded-2xl border border-emerald-300/25 bg-emerald-300/10 px-4 text-sm font-medium text-emerald-100 transition active:scale-95"
                >
                  Assign
                </button>
              </div>
              {i.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {i.tags.map((t) => (
                    <span key={t} className="rounded-full bg-white/[0.06] px-2 py-0.5 text-xs text-white/60">
                      #{t}
                    </span>
                  ))}
                </div>
              )}
              {open === i.id && (
                <div className="mt-4 grid gap-3 border-t border-white/[0.09] pt-4 text-sm">
                  <WorkoutSummary steps={i.steps} sport={i.sport} pool={i.pool_length && i.pool_unit ? { length: Number(i.pool_length), unit: i.pool_unit } : null} units={units} />
                  <ol className="list-decimal space-y-0.5 pl-5 text-white/60">
                    {describe(i.steps, units, i.pool_length && i.pool_unit ? { length: Number(i.pool_length), unit: i.pool_unit } : null, i.sport === "swim").map((l, k) => (
                      <li key={k}>{l}</li>
                    ))}
                  </ol>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <select
                      defaultValue={i.workout_type}
                      onChange={(e) => save(i.id, { workout_type: e.target.value })}
                      aria-label="Workout type"
                      className="min-h-11 rounded-2xl border border-white/10 bg-panel px-3 capitalize"
                    >
                      {TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <input
                      defaultValue={i.tags.join(", ")}
                      placeholder="Tags, comma separated"
                      onBlur={(e) => {
                        const tags = e.target.value.split(",");
                        if (tags.join(",").trim() !== i.tags.join(",")) save(i.id, { tags });
                      }}
                      className="min-h-11 rounded-2xl border border-white/10 bg-white/[0.04] px-3 placeholder:text-white/45"
                    />
                  </div>
                  <button
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const r = await deleteLibraryItem(i.id);
                        router.refresh();
                        show(r.ok ? "Removed from library." : r.error, { ok: r.ok });
                      })
                    }
                    className="min-h-11 justify-self-start text-sm text-white/50 hover:text-red-300"
                  >
                    Remove from library
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {assigning && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center">
          <div className="toast-in max-h-[85vh] w-full max-w-md overflow-y-auto rounded-[28px] border border-white/10 bg-panel p-6">
            <h3 className="text-lg font-medium">Assign “{assigning.title}”</h3>
            <p className="mt-1 text-sm text-white/50">Creates a draft for each athlete. Nothing is sent until you approve it.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {athletes.map((a) => {
                const on = picked.has(a.id);
                return (
                  <button
                    key={a.id}
                    onClick={() =>
                      setPicked((s) => {
                        const n = new Set(s);
                        if (on) n.delete(a.id);
                        else n.add(a.id);
                        return n;
                      })
                    }
                    className={`${chip} normal-case ${on ? "border-emerald-300/40 bg-emerald-300/20 text-emerald-50" : "border-white/10 text-white/60"}`}
                  >
                    {a.name}
                  </button>
                );
              })}
            </div>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-4 min-h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-base"
            />
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setAssigning(null)} className="min-h-12 rounded-2xl px-4 text-sm text-white/60">
                Cancel
              </button>
              <button
                disabled={pending || !picked.size}
                onClick={() =>
                  start(async () => {
                    navigator.vibrate?.(10);
                    const r = await assignFromLibrary(assigning.id, [...picked], date);
                    router.refresh();
                    show(r.ok ? (r.message ?? "Assigned.") : r.error, { ok: r.ok });
                    if (r.ok) {
                      setAssigning(null);
                      if (r.ids?.length === 1 && picked.size === 1) router.push(`/athlete/${[...picked][0]}/workouts/${r.ids[0]}`);
                    }
                  })
                }
                className="min-h-12 rounded-2xl border border-emerald-300/25 bg-emerald-300/15 px-5 text-sm font-medium text-emerald-50 active:scale-95 disabled:opacity-40"
              >
                {pending ? "Assigning…" : picked.size > 1 ? `Assign to ${picked.size}` : "Assign"}
              </button>
            </div>
          </div>
        </div>
      )}
      {element}
    </div>
  );
}
