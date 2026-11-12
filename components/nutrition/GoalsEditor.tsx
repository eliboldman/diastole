"use client";

import { useState, useTransition } from "react";

import { PER_KG_LIMITS, type Macro, type PerKg } from "@/lib/fuel/meals";
import type { FuelDay } from "@/lib/fuel/plan";
import { saveNutritionGoals } from "@/lib/nutrition/actions";

const DAYS: { key: FuelDay; label: string }[] = [
  { key: "low", label: "Low (rest, easy)" },
  { key: "medium", label: "Medium" },
  { key: "high", label: "High (long, hard, race)" },
];
const MACROS: Macro[] = ["carbs", "protein", "fat"];
const KCAL: Record<Macro, number> = { carbs: 4, protein: 4, fat: 9 };

type Grid = Record<FuelDay, Record<Macro, [string, string]>>;

const input =
  "w-16 rounded-xl border border-white/10 bg-white/[0.04] px-2 py-2 text-center tabular-nums text-white focus:border-emerald-300/40 focus:outline-none";

/** g/kg ranges per training day, plus a note to the athlete. Shows grams for their weight as you type. */
export default function GoalsEditor({
  athleteId,
  firstName,
  weightKg,
  defaults,
  custom,
  note: initialNote,
}: {
  athleteId: string;
  firstName: string;
  weightKg: number | null;
  defaults: Record<FuelDay, Record<Macro, [number, number]>>;
  custom: PerKg;
  note: string;
}) {
  const start = (): Grid =>
    Object.fromEntries(
      DAYS.map(({ key }) => [key, Object.fromEntries(MACROS.map((m) => [m, (custom[key]?.[m] ?? defaults[key][m]).map(String) as [string, string]]))]),
    ) as Grid;
  const [grid, setGrid] = useState<Grid>(start);
  const [note, setNote] = useState(initialNote);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const set = (d: FuelDay, m: Macro, i: 0 | 1, v: string) => {
    setMsg(null);
    setGrid((g) => {
      const pair = [...g[d][m]] as [string, string];
      pair[i] = v;
      return { ...g, [d]: { ...g[d], [m]: pair } };
    });
  };
  const num = (d: FuelDay, m: Macro) => grid[d][m].map(Number) as [number, number];
  const isDefault = (d: FuelDay, m: Macro) => num(d, m)[0] === defaults[d][m][0] && num(d, m)[1] === defaults[d][m][1];
  const grams = (d: FuelDay, m: Macro) => {
    const [a, b] = num(d, m);
    return weightKg && Number.isFinite(a) && Number.isFinite(b) ? `${Math.round((a * weightKg) / 5) * 5}–${Math.round((b * weightKg) / 5) * 5} g` : "";
  };
  const kcal = (d: FuelDay) => {
    if (!weightKg) return "";
    const lo = MACROS.reduce((t, m) => t + num(d, m)[0] * weightKg * KCAL[m], 0);
    const hi = MACROS.reduce((t, m) => t + num(d, m)[1] * weightKg * KCAL[m], 0);
    return Number.isFinite(lo + hi) ? `≈ ${Math.round(lo / 50) * 50}–${Math.round(hi / 50) * 50} kcal` : "";
  };

  const problem = (): string | null => {
    for (const { key, label } of DAYS)
      for (const m of MACROS) {
        const [a, b] = num(key, m);
        const [lo, hi] = PER_KG_LIMITS[m];
        if (!Number.isFinite(a) || !Number.isFinite(b) || grid[key][m].some((v) => v.trim() === "")) return `${label}: enter both ${m} numbers.`;
        if (a > b) return `${label}: the low ${m} number is above the high one.`;
        if (a < lo || b > hi) return `${label}: ${m} must be between ${lo} and ${hi} g/kg.`;
      }
    return null;
  };

  const save = () =>
    startTransition(async () => {
      const bad = problem();
      if (bad) return setMsg({ ok: false, text: bad });
      const perKg = Object.fromEntries(DAYS.map(({ key }) => [key, Object.fromEntries(MACROS.map((m) => [m, num(key, m)]))]));
      const r = await saveNutritionGoals(athleteId, perKg, note);
      setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
    });

  return (
    <div className="mt-5">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-left text-xs text-white/45">
              <th className="pb-2 font-normal">Training day</th>
              {MACROS.map((m) => (
                <th key={m} className="pb-2 font-normal capitalize">
                  {m} (g/kg)
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAYS.map(({ key, label }) => (
              <tr key={key} className="border-t border-white/[0.06] align-top">
                <td className="py-3 pr-3">
                  <span className="text-white/85">{label}</span>
                  {kcal(key) && <span className="block text-xs text-white/45">{kcal(key)}</span>}
                </td>
                {MACROS.map((m) => (
                  <td key={m} className="py-3 pr-3">
                    <div className="flex items-center gap-1">
                      <input aria-label={`${label} ${m} low`} inputMode="decimal" className={input} value={grid[key][m][0]} onChange={(e) => set(key, m, 0, e.target.value)} />
                      <span className="text-white/40">–</span>
                      <input aria-label={`${label} ${m} high`} inputMode="decimal" className={input} value={grid[key][m][1]} onChange={(e) => set(key, m, 1, e.target.value)} />
                    </div>
                    <span className={`mt-1 block text-xs ${isDefault(key, m) ? "text-white/40" : "text-emerald-200/80"}`}>
                      {isDefault(key, m) ? "Default" : "Custom"}
                      {grams(key, m) ? ` · ${grams(key, m)}` : ""}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!weightKg && <p className="mt-2 text-sm text-amber-200/90">{firstName} hasn&apos;t entered a body weight, so their Fuel page can&apos;t show gram targets yet.</p>}

      <label className="mt-6 block">
        <span className="text-sm text-white/70">Note to {firstName}</span>
        <span className="block text-xs text-white/45">Shown at the top of their Fuel page, with your name. Leave empty for none.</span>
        <textarea
          value={note}
          maxLength={800}
          rows={4}
          onChange={(e) => {
            setMsg(null);
            setNote(e.target.value);
          }}
          placeholder="e.g. Aim for protein at breakfast, and a recovery snack with carbs within an hour of hard sessions."
          className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white placeholder:text-white/35 focus:border-emerald-300/40 focus:outline-none"
        />
      </label>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-2xl border border-emerald-300/25 bg-emerald-300/10 px-5 py-3 font-medium text-emerald-100 transition-colors hover:bg-emerald-300/20 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save goals"}
        </button>
        <button
          type="button"
          onClick={() => {
            setMsg(null);
            setGrid(Object.fromEntries(DAYS.map(({ key }) => [key, Object.fromEntries(MACROS.map((m) => [m, defaults[key][m].map(String)]))])) as Grid);
          }}
          className="rounded-2xl border border-white/10 px-4 py-3 text-sm text-white/65 hover:bg-white/[0.05]"
        >
          Reset to defaults
        </button>
        {msg && (
          <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-emerald-200" : "text-red-300"}`}>
            {msg.text}
          </p>
        )}
      </div>
    </div>
  );
}
