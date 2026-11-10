"use client";

import {
  Bike,
  Footprints,
  MoveRight,
  Pencil,
  Plus,
  Trash2,
  Waves,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  addLibraryWorkout,
  deleteTemplate,
  deleteTemplateWorkout,
  moveTemplateWorkout,
  updateTemplate,
} from "@/lib/plans/actions";

export type EditorWorkout = {
  id: string;
  week: number;
  day: number;
  title: string;
  sport: string;
  summary: string;
};
type Plan = {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  weeks: number;
  raceWeek: boolean;
  weekNotes: Record<string, string>;
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const ICON: Record<string, typeof Bike> = {
  run: Footprints,
  bike: Bike,
  swim: Waves,
};
const field =
  "w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/35 focus:border-emerald-300/40 focus:outline-none";
const sel = `${field} bg-panel`;

/** A plan template: name, tags, notes per week, and its sessions by week and day. */
export default function TemplateEditor({
  plan,
  workouts,
  library,
}: {
  plan: Plan;
  workouts: EditorWorkout[];
  library: { id: string; title: string; sport: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [name, setName] = useState(plan.name);
  const [tags, setTags] = useState(plan.tags.join(", "));
  const [desc, setDesc] = useState(plan.description ?? "");
  const [moving, setMoving] = useState<string | null>(null);
  const [adding, setAdding] = useState<number | null>(null);

  const act = (
    fn: () => Promise<{ ok: boolean; error?: string }>,
    ok?: string,
  ) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? (ok ?? null) : (r.error ?? "Something went wrong."));
      if (r.ok) router.refresh();
    });
  const saveMeta = () =>
    act(
      () =>
        updateTemplate(plan.id, {
          name,
          description: desc,
          tags: tags.split(","),
        }),
      "Saved.",
    );

  const weeks = Math.max(plan.weeks, ...workouts.map((w) => w.week));
  return (
    <div className="mt-4">
      <p className="text-sm uppercase tracking-[0.25em] text-white/50">Plan</p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() !== plan.name && saveMeta()}
        aria-label="Plan name"
        maxLength={120}
        className="mt-2 w-full bg-transparent text-2xl font-bold tracking-tight outline-none focus:underline sm:text-4xl"
      />
      <div className="mt-3 grid gap-2 sm:grid-cols-[2fr_1fr]">
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onBlur={() => desc !== (plan.description ?? "") && saveMeta()}
          rows={2}
          placeholder="What this plan is for (only you see this)"
          className={field}
        />
        <div>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            onBlur={() => tags !== plan.tags.join(", ") && saveMeta()}
            placeholder="Tags: 70.3, intermediate, 16 weeks"
            aria-label="Tags"
            className={field}
          />
          <label className="mt-2 flex items-center gap-2 text-xs text-white/60">
            <input
              type="checkbox"
              defaultChecked={plan.raceWeek}
              onChange={(e) =>
                act(() =>
                  updateTemplate(plan.id, { raceWeek: e.target.checked }),
                )
              }
              className="h-4 w-4 accent-emerald-400"
            />
            The last week is race week
          </label>
        </div>
      </div>
      {msg && (
        <p className="mt-2 text-sm text-white/65" aria-live="polite">
          {msg}
        </p>
      )}

      <ol className="mt-6 space-y-3">
        {Array.from({ length: weeks }, (_, k) => k + 1).map((week) => {
          const list = workouts
            .filter((w) => w.week === week)
            .sort((a, b) => a.day - b.day);
          return (
            <li
              key={week}
              className="rounded-[24px] border border-white/10 bg-white/[0.045] p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-medium">Week {week}</h2>
                <input
                  defaultValue={plan.weekNotes[String(week)] ?? ""}
                  onBlur={(e) => {
                    if (
                      (e.target.value || "") ===
                      (plan.weekNotes[String(week)] ?? "")
                    )
                      return;
                    act(() =>
                      updateTemplate(plan.id, {
                        weekNotes: {
                          ...plan.weekNotes,
                          [String(week)]: e.target.value,
                        },
                      }),
                    );
                  }}
                  placeholder={
                    week === weeks && plan.raceWeek
                      ? "Race week"
                      : "Note for this week (e.g. recovery week)"
                  }
                  aria-label={`Week ${week} note`}
                  maxLength={300}
                  className="min-w-0 flex-1 rounded-lg bg-transparent px-2 py-1 text-sm text-white/70 placeholder:text-white/30 focus:bg-white/[0.04] focus:outline-none"
                />
              </div>
              {list.length === 0 ? (
                <p className="mt-2 text-sm text-white/40">
                  Rest week, or nothing added yet.
                </p>
              ) : (
                <ul className="mt-2 divide-y divide-white/[0.07]">
                  {list.map((w) => {
                    const Icon = ICON[w.sport] ?? Footprints;
                    return (
                      <li key={w.id} className="py-2">
                        <div className="flex flex-wrap items-center gap-x-3">
                          <span className="w-9 shrink-0 text-xs uppercase tracking-wide text-white/45">
                            {DAYS[w.day]}
                          </span>
                          <Icon
                            size={15}
                            className="shrink-0 text-emerald-200"
                            aria-hidden
                          />
                          {/* On phones the buttons wrap under the title rather than squeezing it. */}
                          <span className="min-w-0 flex-1 basis-44">
                            <span className="block truncate text-sm font-medium">
                              {w.title}
                            </span>
                            <span className="block truncate text-xs text-white/50">
                              {w.summary}
                            </span>
                          </span>
                          <span className="ml-auto flex shrink-0">
                            <Link
                              href={`/library/plans/${plan.id}/workouts/${w.id}`}
                              aria-label={`Edit ${w.title}`}
                              className="flex h-10 w-10 items-center justify-center rounded-xl text-white/55 hover:bg-white/[0.06]"
                            >
                              <Pencil size={15} />
                            </Link>
                            <button
                              type="button"
                              onClick={() =>
                                setMoving(moving === w.id ? null : w.id)
                              }
                              aria-label={`Move ${w.title}`}
                              className="flex h-10 w-10 items-center justify-center rounded-xl text-white/55 hover:bg-white/[0.06]"
                            >
                              <MoveRight size={15} />
                            </button>
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() =>
                                act(() => deleteTemplateWorkout(w.id))
                              }
                              aria-label={`Remove ${w.title}`}
                              className="flex h-10 w-10 items-center justify-center rounded-xl text-white/45 hover:bg-white/[0.06] hover:text-red-300"
                            >
                              <Trash2 size={15} />
                            </button>
                          </span>
                        </div>
                        {moving === w.id && (
                          <MoveRow
                            weeks={weeks}
                            week={w.week}
                            day={w.day}
                            onMove={(wk, d) =>
                              act(
                                () => moveTemplateWorkout(w.id, wk, d),
                                "Moved.",
                              )
                            }
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {adding === week ? (
                <AddRow
                  library={library}
                  onAdd={(lib, day) =>
                    act(
                      () => addLibraryWorkout(plan.id, lib, week, day),
                      "Added.",
                    )
                  }
                  newHref={(day) =>
                    `/library/plans/${plan.id}/workouts/new?week=${week}&day=${day}`
                  }
                  onClose={() => setAdding(null)}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setAdding(week)}
                  className="mt-2 flex min-h-10 items-center gap-1.5 text-sm text-emerald-200/80 hover:underline"
                >
                  <Plus size={14} aria-hidden /> Add a session
                </button>
              )}
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        onClick={() => setAdding(weeks + 1)}
        className="mt-3 flex min-h-10 items-center gap-1.5 text-sm text-white/60 hover:text-white"
      >
        <Plus size={14} aria-hidden /> Add week {weeks + 1}
      </button>
      {adding === weeks + 1 && (
        <AddRow
          library={library}
          onAdd={(lib, day) =>
            act(() => addLibraryWorkout(plan.id, lib, weeks + 1, day), "Added.")
          }
          newHref={(day) =>
            `/library/plans/${plan.id}/workouts/new?week=${weeks + 1}&day=${day}`
          }
          onClose={() => setAdding(null)}
        />
      )}

      <DeletePlan id={plan.id} />
    </div>
  );
}

function MoveRow({
  weeks,
  week,
  day,
  onMove,
}: {
  weeks: number;
  week: number;
  day: number;
  onMove: (week: number, day: number) => void;
}) {
  const [wk, setWk] = useState(week);
  const [d, setD] = useState(day);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 pl-12">
      <select
        value={wk}
        onChange={(e) => setWk(Number(e.target.value))}
        aria-label="Week"
        className={`${sel} w-auto`}
      >
        {Array.from({ length: Math.min(52, weeks + 1) }, (_, i) => (
          <option key={i} value={i + 1}>
            Week {i + 1}
          </option>
        ))}
      </select>
      <select
        value={d}
        onChange={(e) => setD(Number(e.target.value))}
        aria-label="Day"
        className={`${sel} w-auto`}
      >
        {DAYS.map((x, i) => (
          <option key={x} value={i}>
            {x}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => onMove(wk, d)}
        className="min-h-10 rounded-xl border border-emerald-300/25 bg-emerald-300/10 px-3 text-sm text-emerald-100"
      >
        Move
      </button>
    </div>
  );
}

function AddRow({
  library,
  onAdd,
  newHref,
  onClose,
}: {
  library: { id: string; title: string; sport: string }[];
  onAdd: (libraryId: string, day: number) => void;
  newHref: (day: number) => string;
  onClose: () => void;
}) {
  const [day, setDay] = useState(1);
  const [lib, setLib] = useState("");
  return (
    <div className="mt-2 grid gap-2 rounded-2xl bg-white/[0.03] p-3 sm:grid-cols-[auto_1fr_auto_auto]">
      <select
        value={day}
        onChange={(e) => setDay(Number(e.target.value))}
        aria-label="Day"
        className={`${sel} sm:w-auto`}
      >
        {DAYS.map((x, i) => (
          <option key={x} value={i}>
            {x}
          </option>
        ))}
      </select>
      <select
        value={lib}
        onChange={(e) => setLib(e.target.value)}
        aria-label="Library workout"
        className={sel}
      >
        <option value="">From your library…</option>
        {library.map((l) => (
          <option key={l.id} value={l.id}>
            {l.title} ({l.sport})
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!lib}
        onClick={() => onAdd(lib, day)}
        className="min-h-10 rounded-xl border border-emerald-300/25 bg-emerald-300/10 px-3 text-sm text-emerald-100 disabled:opacity-40"
      >
        Add
      </button>
      <span className="flex items-center gap-3 text-sm">
        <Link
          href={newHref(day)}
          className="text-emerald-200/80 hover:underline"
        >
          Build new
        </Link>
        <button
          type="button"
          onClick={onClose}
          className="text-white/45 hover:text-white"
        >
          Cancel
        </button>
      </span>
    </div>
  );
}

function DeletePlan({ id }: { id: string }) {
  const router = useRouter();
  const [sure, setSure] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="mt-8 border-t border-white/[0.08] pt-4 text-sm">
      {sure ? (
        <span className="flex flex-wrap items-center gap-3">
          <span className="text-white/65">
            Delete this plan? Athletes already on it keep their workouts.
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await deleteTemplate(id);
                if (r.ok) router.push("/library");
              })
            }
            className="min-h-10 rounded-xl border border-red-300/30 px-3 text-red-200"
          >
            Delete plan
          </button>
          <button
            type="button"
            onClick={() => setSure(false)}
            className="text-white/50"
          >
            Keep it
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setSure(true)}
          className="min-h-10 text-white/45 hover:text-red-300"
        >
          Delete plan…
        </button>
      )}
    </div>
  );
}
