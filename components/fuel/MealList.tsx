"use client";

import { Loader2, RotateCcw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { MealRow } from "@/lib/fuel/data";
import EatenPicker from "@/components/fuel/EatenPicker";
import { localDateOf, type EatenAt } from "@/lib/fuel/eaten";
import { deleteMeal, relogMeal, setMealTime } from "@/lib/fuel/meal-actions";
import { SLOT_LABEL, type Slot } from "@/lib/fuel/meals";

const time = (iso: string, timeZone: string) => new Date(iso).toLocaleTimeString("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
const foods = (m: MealRow) => m.items.map((i) => i.name).join(", ");
const macros = (m: MealRow) => `${Math.round(m.carbs_g)} C · ${Math.round(m.protein_g)} P · ${Math.round(m.fat_g)} F · ${Math.round(m.kcal)} kcal`;

function useAct() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const run = (id: string, fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(id);
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Something went wrong.");
      setBusy(null);
      router.refresh();
    });
  };
  return { busy, error, run };
}

/** Today's meals (athlete can remove one), then their usual meals and recents to log again in one tap. */
export default function MealList({
  meals,
  usual,
  recent,
  timeZone,
  numbers = true,
  editable = true,
}: {
  meals: MealRow[];
  usual: { meal: MealRow; times: number; slot: Slot }[];
  recent: MealRow[];
  timeZone: string;
  numbers?: boolean;
  editable?: boolean;
}) {
  const { busy, error, run } = useAct();
  const [editing, setEditing] = useState<string | null>(null);
  // Starts as "Other time" so the picker opens on the meal's current day and time.
  const [when, setWhen] = useState<EatenAt>({ date: "", time: "" });
  return (
    <div className="space-y-5">
      {meals.length > 0 && (
        <ul className="space-y-2">
          {meals.map((m) => (
            <li key={m.id} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">{m.label || "Meal"}</span>
                  {editable ? (
                    <button
                      type="button"
                      onClick={() => {
                        const at = m.eaten_at ?? m.created_at;
                        setEditing(editing === m.id ? null : m.id);
                        setWhen({ date: localDateOf(Date.parse(at), timeZone), time: new Date(at).toLocaleTimeString("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }) });
                      }}
                      className="text-xs text-white/50 underline decoration-dotted underline-offset-2 hover:text-white/80"
                      aria-label={`Change when you ate ${m.label || "this meal"}`}
                    >
                      {time(m.eaten_at ?? m.created_at, timeZone)}
                    </button>
                  ) : (
                    <span className="text-xs text-white/40">{time(m.eaten_at ?? m.created_at, timeZone)}</span>
                  )}
                </p>
                <p className="truncate text-sm text-white/55">{foods(m)}</p>
                {numbers && <p className="mt-0.5 text-xs tabular-nums text-white/45">{macros(m)}</p>}
                {editing === m.id && (
                  <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3">
                    <p className="mb-2 text-sm text-white/60">When did you eat it?</p>
                    <EatenPicker timeZone={timeZone} value={when} onChange={setWhen} initial={m.eaten_at ?? m.created_at} />
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => run(m.id, async () => {
                          const r = await setMealTime(m.id, when);
                          if (r.ok) setEditing(null);
                          return r;
                        })}
                        className="min-h-10 rounded-xl bg-emerald-300 px-4 text-sm font-medium text-emerald-950 disabled:opacity-50"
                      >
                        {busy === m.id ? "Saving…" : "Save time"}
                      </button>
                      <button type="button" onClick={() => setEditing(null)} className="min-h-10 rounded-xl px-3 text-sm text-white/60 hover:bg-white/[0.06]">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {editable && (
                <button
                  onClick={() => run(m.id, () => deleteMeal(m.id))}
                  className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/40 hover:bg-white/[0.08]"
                  aria-label={`Remove ${m.label || "meal"}`}
                >
                  {busy === m.id ? <Loader2 size={15} className="animate-spin" /> : <X size={15} />}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {editable && (usual.length > 0 || recent.length > 0) && (
        <div>
          <h3 className="text-sm font-medium text-white/70">Log again</h3>
          <ul className="mt-2 space-y-2">
            {usual.map(({ meal, slot }) => (
              <li key={meal.id}>
                <button
                  onClick={() => run(meal.id, () => relogMeal(meal.id))}
                  className="lift flex min-h-14 w-full items-center gap-3 rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.05] px-4 py-2 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{`Your usual ${SLOT_LABEL[slot].toLowerCase()}?`}</span>
                    <span className="block truncate text-xs text-white/55">{meal.label || foods(meal)}</span>
                  </span>
                  {busy === meal.id ? <Loader2 size={16} className="animate-spin text-emerald-200" /> : <RotateCcw size={16} className="shrink-0 text-emerald-200" aria-hidden />}
                </button>
              </li>
            ))}
            {recent.map((meal) => (
              <li key={meal.id}>
                <button
                  onClick={() => run(meal.id, () => relogMeal(meal.id))}
                  className="lift flex min-h-12 w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{meal.label || "Meal"}</span>
                    <span className="block truncate text-xs text-white/45">{foods(meal)}</span>
                  </span>
                  {busy === meal.id ? <Loader2 size={16} className="animate-spin text-white/50" /> : <RotateCcw size={15} className="shrink-0 text-white/40" aria-hidden />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && <p className="text-sm text-amber-100/90">{error}</p>}
    </div>
  );
}
