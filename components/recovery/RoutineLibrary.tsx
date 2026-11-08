"use client";

import { ArrowDown, ArrowUp, Minus, Play, Plus, Send, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { assignRoutine, deleteRoutine, saveRoutine } from "@/lib/recovery/actions";
import { minutesLabel, routineSeconds, type Area, type Move, type Routine, type RoutineItem } from "@/lib/recovery/catalog";

type MoveRow = Move & { hasClip: boolean };
const FILTERS: { label: string; areas: Area[] | null }[] = [
  { label: "All", areas: null },
  { label: "Calves", areas: ["calves", "soleus"] },
  { label: "Hamstrings", areas: ["hamstrings"] },
  { label: "Quads", areas: ["quads", "it band"] },
  { label: "Hips & glutes", areas: ["hips", "glutes", "piriformis", "hip flexors", "adductors"] },
  { label: "Back", areas: ["upper back"] },
  { label: "Feet", areas: ["foot arch"] },
  { label: "Breathing", areas: ["breathing"] },
];
const chip = (on: boolean) => `min-h-10 shrink-0 rounded-full border px-3 text-sm ${on ? "border-emerald-300/40 bg-emerald-300/15 text-emerald-50" : "border-white/10 text-white/65"}`;
const field = "min-h-11 w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 text-base sm:text-sm placeholder:text-white/35 focus:border-emerald-300/40 focus:outline-none";

/** Routine list, the builder, and assigning. One thing on screen at a time. */
export default function RoutineLibrary({ routines, moves, roster, today }: { routines: Routine[]; moves: MoveRow[]; roster: { id: string; name: string }[]; today: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState<{ id?: string; title: string; description: string; items: RoutineItem[] } | null>(null);
  const [assigning, setAssigning] = useState<Routine | null>(null);
  const [filter, setFilter] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [date, setDate] = useState(today);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const byslug = (s: string) => moves.find((m) => m.slug === s)!;

  const act = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      setNote(r.ok ? (r.message ? { ok: true, text: r.message } : null) : { ok: false, text: r.error ?? "Something went wrong." });
      if (r.ok) after?.();
      router.refresh();
    });

  const noteEl =
    note && <p role="status" className={`mt-4 rounded-2xl border p-3 text-sm ${note.ok ? "border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-100" : "border-amber-200/20 bg-amber-200/[0.05] text-amber-100"}`}>{note.text}</p>;

  // ---------------------------------------------------------------- builder
  if (editing) {
    const set = (items: RoutineItem[]) => setEditing({ ...editing, items });
    const f = FILTERS[filter];
    const list = moves.filter((m) => !f.areas || m.areas.some((a) => f.areas!.includes(a)));
    return (
      <div className="mt-6 space-y-5">
        {noteEl}
        <input className={`${field} text-lg`} value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="Name, e.g. 10-min post-long-run roll" maxLength={80} aria-label="Routine name" />
        <input className={field} value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="Short note for athletes (optional)" maxLength={300} aria-label="Note" />

        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm uppercase tracking-[0.15em] text-white/50">Moves</h2>
            <span className="text-sm text-white/60">{minutesLabel(routineSeconds(editing.items))} total</span>
          </div>
          {!editing.items.length ? (
            <p className="rounded-2xl border border-dashed border-white/15 p-4 text-sm text-white/50">Add moves from the list below.</p>
          ) : (
            <ul className="space-y-2">
              {editing.items.map((it, i) => {
                const m = byslug(it.slug);
                return (
                  <li key={`${it.slug}-${i}`} className="flex items-center gap-2 rounded-2xl bg-white/[0.05] p-2 pl-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{m.name}</span>
                      <span className="text-xs text-white/45">{m.perSide ? "each side" : m.pattern ? "guided" : ""}</span>
                    </span>
                    <button type="button" aria-label="Less time" onClick={() => set(editing.items.map((x, j) => (j === i ? { ...x, seconds: Math.max(10, x.seconds - 15) } : x)))} className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-white/[0.06]">
                      <Minus size={15} />
                    </button>
                    <span className="w-12 text-center text-sm tabular-nums">{it.seconds >= 60 && it.seconds % 60 === 0 ? `${it.seconds / 60}m` : `${it.seconds}s`}</span>
                    <button type="button" aria-label="More time" onClick={() => set(editing.items.map((x, j) => (j === i ? { ...x, seconds: Math.min(900, x.seconds + 15) } : x)))} className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-white/[0.06]">
                      <Plus size={15} />
                    </button>
                    <span className="flex flex-col">
                      <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => set(editing.items.map((x, j) => (j === i - 1 ? editing.items[i] : j === i ? editing.items[i - 1] : x)))} className="flex h-5 w-8 items-center justify-center text-white/50 disabled:opacity-20">
                        <ArrowUp size={13} />
                      </button>
                      <button type="button" aria-label="Move down" disabled={i === editing.items.length - 1} onClick={() => set(editing.items.map((x, j) => (j === i + 1 ? editing.items[i] : j === i ? editing.items[i + 1] : x)))} className="flex h-5 w-8 items-center justify-center text-white/50 disabled:opacity-20">
                        <ArrowDown size={13} />
                      </button>
                    </span>
                    <button type="button" aria-label={`Remove ${m.name}`} onClick={() => set(editing.items.filter((_, j) => j !== i))} className="flex h-10 w-10 items-center justify-center rounded-xl text-white/45 hover:bg-white/[0.06]">
                      <X size={15} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-sm uppercase tracking-[0.15em] text-white/50">Add a move</h2>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
            {FILTERS.map((x, i) => (
              <button key={x.label} type="button" onClick={() => setFilter(i)} className={chip(i === filter)}>
                {x.label}
              </button>
            ))}
          </div>
          <ul className="space-y-1">
            {list.map((m) => (
              <li key={m.slug}>
                <button type="button" onClick={() => set([...editing.items, { slug: m.slug, seconds: m.seconds }])} disabled={editing.items.length >= 30} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left hover:bg-white/[0.05]">
                  <Plus size={16} className="shrink-0 text-emerald-300" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm">{m.name}</span>
                  {!m.hasClip && !m.pattern && <span className="shrink-0 text-[11px] text-white/35">no video yet</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] flex gap-2 md:bottom-6">
          <button type="button" disabled={pending} onClick={() => act(() => saveRoutine(editing), () => setEditing(null))} className="min-h-12 flex-1 rounded-2xl bg-emerald-300 font-medium text-black disabled:opacity-60">
            {pending ? "Saving…" : "Save routine"}
          </button>
          <button type="button" onClick={() => setEditing(null)} className="min-h-12 rounded-2xl bg-panel px-4 text-white/70">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- assign
  if (assigning) {
    const all = picked.size === roster.length;
    return (
      <div className="mt-6 space-y-4">
        {noteEl}
        <p className="text-lg font-medium">Assign “{assigning.title}”</p>
        <label className="block">
          <span className="mb-1 block text-xs text-white/55">Day</span>
          <input type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} className={`${field} max-w-xs`} />
        </label>
        <div>
          <button type="button" onClick={() => setPicked(all ? new Set() : new Set(roster.map((r) => r.id)))} className="mb-2 min-h-10 text-sm text-emerald-200">
            {all ? "Clear all" : "Select everyone"}
          </button>
          <ul className="grid gap-1 sm:grid-cols-2">
            {roster.map((a) => (
              <li key={a.id}>
                <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-3 hover:bg-white/[0.04]">
                  <input type="checkbox" className="h-5 w-5 accent-emerald-300" checked={picked.has(a.id)} onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(a.id); else n.delete(a.id); return n; })} />
                  <span className="text-sm">{a.name}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex gap-2">
          <button type="button" disabled={pending || !picked.size} onClick={() => act(() => assignRoutine(assigning.id, [...picked], date), () => { setAssigning(null); setPicked(new Set()); })} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-300 font-medium text-black disabled:opacity-50">
            <Send size={16} /> Assign
          </button>
          <button type="button" onClick={() => setAssigning(null)} className="min-h-12 rounded-2xl px-4 text-white/70 hover:bg-white/[0.06]">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- list
  return (
    <div className="mt-6">
      {noteEl}
      <button type="button" onClick={() => { setNote(null); setEditing({ title: "", description: "", items: [] }); }} className="flex min-h-12 items-center gap-2 rounded-2xl bg-emerald-300 px-5 font-medium text-black active:scale-95">
        <Plus size={18} /> New routine
      </button>
      <ul className="mt-5 space-y-2">
        {routines.map((r) => (
          <li key={r.id} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{r.title}</p>
                <p className="text-xs text-white/50">
                  {minutesLabel(routineSeconds(r.items))} · {r.items.length} move{r.items.length === 1 ? "" : "s"}
                  {r.starter ? " · starter" : ""}
                </p>
              </div>
              <Link href={`/recovery/${r.id}?from=/lab/recovery`} aria-label={`Preview ${r.title}`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white/60 hover:bg-white/[0.06]">
                <Play size={16} />
              </Link>
              {!r.starter && (
                <button type="button" aria-label={`Delete ${r.title}`} disabled={pending} onClick={() => act(() => deleteRoutine(r.id))} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white/40 hover:bg-white/[0.06]">
                  <Trash2 size={16} />
                </button>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4">
              <button type="button" onClick={() => { setNote(null); setAssigning(r); }} className="min-h-10 text-sm text-emerald-200">
                Assign →
              </button>
              <button type="button" onClick={() => { setNote(null); setEditing({ id: r.starter ? undefined : r.id, title: r.starter ? `${r.title} (mine)` : r.title, description: r.description ?? "", items: r.items }); }} className="min-h-10 text-sm text-white/60">
                {r.starter ? "Copy and edit" : "Edit"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
