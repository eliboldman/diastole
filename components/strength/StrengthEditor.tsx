"use client";

import { ArrowDown, ArrowUp, Play, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";

import { BY_SLUG, EXERCISES } from "@/lib/strength/catalog";
import type { StrengthItem } from "@/lib/strength/workout";

const KG_LB = 2.20462;
const field = "rounded-xl border border-white/10 bg-white/[0.05] px-2 py-1.5 text-[16px] text-white tabular-nums focus:border-emerald-300/40 focus:outline-none";
const GROUPS: [string, (s: (typeof EXERCISES)[number]) => boolean][] = [
  ["Lower body", (e) => e.legs],
  ["Core", (e) => !e.legs && ["plank", "core", "chop", "carry"].includes(e.category)],
  ["Upper body", (e) => !e.legs && !["plank", "core", "chop", "carry"].includes(e.category)],
];

/** Exercises with sets, reps or a hold, load, tempo and rest. Weights typed in the coach's unit, stored in kg. */
export default function StrengthEditor({ items, setItems, unit, editable, demos }: { items: StrengthItem[]; setItems: (i: StrengthItem[]) => void; unit: "kg" | "lb"; editable: boolean; demos: string[] }) {
  const [adding, setAdding] = useState("");
  const demoSet = useMemo(() => new Set(demos), [demos]);
  const put = (i: number, patch: Partial<StrengthItem>) => setItems(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: -1 | 1) => {
    const n = [...items];
    [n[i], n[i + d]] = [n[i + d], n[i]];
    setItems(n);
  };
  const add = (slug: string) => {
    const ex = BY_SLUG.get(slug);
    if (!ex) return;
    setItems([...items, { slug, sets: 3, reps: ex.hold ? null : ex.legs ? 8 : 10, seconds: ex.hold ? 30 : null, kg: null, tempo: null, rest_s: ex.heavy ? 120 : 60, note: null }]);
    setAdding("");
  };
  const showWeight = (kg: number | null) => (kg === null ? "" : unit === "lb" ? String(Math.round(kg * KG_LB)) : String(Math.round(kg * 10) / 10));

  return (
    <fieldset disabled={!editable} className="grid gap-3">
      {items.map((it, i) => {
        const ex = BY_SLUG.get(it.slug);
        if (!ex) return null;
        return (
          <div key={`${it.slug}-${i}`} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1">
                <span className="block font-medium leading-snug">{ex.name}</span>
                <span className="block truncate text-xs text-white/45">
                  {ex.perSide ? "Each side · " : ""}
                  {ex.cue}
                </span>
              </span>
              {demoSet.has(it.slug) && (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-300/10 px-2 py-0.5 text-[11px] text-emerald-100" title="Has a demo clip">
                  <Play size={10} aria-hidden /> Demo
                </span>
              )}
              <button type="button" aria-label={`Move ${ex.name} up`} disabled={i === 0} onClick={() => move(i, -1)} className="flex h-9 w-9 items-center justify-center rounded-lg text-white/50 disabled:opacity-20">
                <ArrowUp size={14} />
              </button>
              <button type="button" aria-label={`Move ${ex.name} down`} disabled={i === items.length - 1} onClick={() => move(i, 1)} className="flex h-9 w-9 items-center justify-center rounded-lg text-white/50 disabled:opacity-20">
                <ArrowDown size={14} />
              </button>
              <button type="button" aria-label={`Remove ${ex.name}`} onClick={() => setItems(items.filter((_, j) => j !== i))} className="flex h-9 w-9 items-center justify-center rounded-lg text-white/45 hover:text-red-300">
                <X size={14} />
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-white/55">
              <label className="flex items-center gap-1.5">
                <input inputMode="numeric" value={it.sets} onChange={(e) => put(i, { sets: Math.min(10, Number(e.target.value.replace(/\D/g, "")) || 1) })} className={`${field} w-12`} aria-label={`${ex.name} sets`} />
                sets ×
              </label>
              {ex.hold ? (
                <label className="flex items-center gap-1.5">
                  <input inputMode="numeric" value={it.seconds ?? ""} onChange={(e) => put(i, { seconds: Number(e.target.value.replace(/\D/g, "")) || null })} className={`${field} w-14`} aria-label={`${ex.name} seconds`} />
                  sec
                </label>
              ) : (
                <label className="flex items-center gap-1.5">
                  <input inputMode="numeric" value={it.reps ?? ""} onChange={(e) => put(i, { reps: Number(e.target.value.replace(/\D/g, "")) || null })} className={`${field} w-12`} aria-label={`${ex.name} reps`} />
                  reps
                </label>
              )}
              {ex.load !== "band" && (
                <label className="flex items-center gap-1.5">
                  @
                  <input
                    inputMode="decimal"
                    value={showWeight(it.kg)}
                    placeholder={ex.load === "bodyweight" ? "BW" : "—"}
                    onChange={(e) => {
                      const v = Number(e.target.value.replace(/[^\d.]/g, ""));
                      put(i, { kg: v > 0 ? Math.round((unit === "lb" ? v / KG_LB : v) * 100) / 100 : null });
                    }}
                    className={`${field} w-16`}
                    aria-label={`${ex.name} weight in ${unit}`}
                  />
                  {unit}
                </label>
              )}
              <label className="flex items-center gap-1.5">
                rest
                <select value={it.rest_s} onChange={(e) => put(i, { rest_s: Number(e.target.value) })} className={`${field} bg-panel`} aria-label={`${ex.name} rest`}>
                  {[0, 30, 45, 60, 90, 120, 150, 180, 240].map((s) => (
                    <option key={s} value={s}>
                      {s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : "none"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1.5">
                tempo
                <input value={it.tempo ?? ""} placeholder="3-1-1" maxLength={7} onChange={(e) => put(i, { tempo: e.target.value || null })} className={`${field} w-16`} aria-label={`${ex.name} tempo`} />
              </label>
              <input value={it.note ?? ""} placeholder="Note" maxLength={120} onChange={(e) => put(i, { note: e.target.value || null })} className={`${field} min-w-0 flex-1 basis-40`} aria-label={`${ex.name} note`} />
            </div>
          </div>
        );
      })}
      <label className="flex items-center gap-2">
        <Plus size={15} className="text-emerald-200" aria-hidden />
        <select value={adding} onChange={(e) => add(e.target.value)} className={`${field} min-w-0 flex-1 bg-panel`} aria-label="Add an exercise">
          <option value="">Add an exercise…</option>
          {GROUPS.map(([label, fn]) => (
            <optgroup key={label} label={label}>
              {EXERCISES.filter(fn).map((e) => (
                <option key={e.slug} value={e.slug}>
                  {e.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
    </fieldset>
  );
}
