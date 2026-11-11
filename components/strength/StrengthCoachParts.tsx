"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { applyStrengthSuggestion, dismissStrengthSuggestion, saveStrengthRules } from "@/lib/strength/actions";
import { BY_SLUG } from "@/lib/strength/catalog";
import { showKg, type Change, type Rules } from "@/lib/strength/workout";

const field = "w-16 rounded-xl border border-white/10 bg-white/[0.05] px-2 py-1.5 text-[16px] text-white tabular-nums focus:border-emerald-300/40 focus:outline-none";

const what = (v: Change["to"], unit: "kg" | "lb") => (v.kg ? showKg(v.kg, unit) : v.seconds ? `${v.seconds} s` : `${v.reps} reps`);

export function SuggestionRow({ id, title, changes, unit }: { id: string; title: string; changes: Change[]; unit: "kg" | "lb" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [gone, setGone] = useState<string | null>(null);
  if (gone) return <li className="text-sm text-white/55">{gone}</li>;
  return (
    <li className="rounded-2xl bg-white/[0.04] p-3">
      <p className="text-sm font-medium">{title}</p>
      <ul className="mt-1 space-y-0.5 text-sm text-white/75">
        {changes.map((c) => (
          <li key={c.slug}>
            {BY_SLUG.get(c.slug)?.name ?? c.slug}: {what(c.from, unit)} → <span className="text-emerald-100">{what(c.to, unit)}</span> <span className="text-xs text-white/45">· {c.why}</span>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex gap-2">
        <button type="button" disabled={pending} onClick={() => start(async () => { const r = await applyStrengthSuggestion(id); setGone(r.ok ? "Applied to the next session." : (r.error ?? "Couldn't apply.")); router.refresh(); })} className="min-h-10 rounded-xl border border-emerald-300/25 bg-emerald-300/15 px-3 text-sm text-emerald-50">
          Apply
        </button>
        <button type="button" disabled={pending} onClick={() => start(async () => { await dismissStrengthSuggestion(id); setGone("Kept as planned."); router.refresh(); })} className="min-h-10 rounded-xl px-3 text-sm text-white/55">
          Keep as planned
        </button>
      </div>
    </li>
  );
}

/** The coach's progression rules for one athlete, and whether to apply them without asking. */
export default function StrengthRulesForm({ athleteId, initial, auto: autoInit, approved, unit }: { athleteId: string; initial: Rules; auto: boolean; approved: boolean; unit: "kg" | "lb" }) {
  const router = useRouter();
  const [r, setR] = useState(initial);
  const [auto, setAuto] = useState(autoInit);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const lb = unit === "lb";
  const shown = (kg: number) => (lb ? Math.round(kg * 2.20462) : kg);
  const back = (v: number) => (lb ? Math.round((v / 2.20462) * 100) / 100 : v);
  return (
    <div className="mt-2 space-y-2 text-sm text-white/70">
      <p className="flex flex-wrap items-center gap-1.5">
        All reps at RPE
        <input inputMode="numeric" value={r.easy_rpe} onChange={(e) => setR({ ...r, easy_rpe: Number(e.target.value.replace(/\D/g, "")) || 7 })} className={field} aria-label="Easy RPE" />
        or easier: add
        <input inputMode="decimal" value={shown(r.upper_kg)} onChange={(e) => setR({ ...r, upper_kg: back(Number(e.target.value) || 0) })} className={field} aria-label={`Upper body increase in ${unit}`} />
        {unit} upper body,
        <input inputMode="decimal" value={shown(r.lower_kg)} onChange={(e) => setR({ ...r, lower_kg: back(Number(e.target.value) || 0) })} className={field} aria-label={`Lower body increase in ${unit}`} />
        {unit} lower body (bodyweight: more reps or longer holds).
      </p>
      <p className="flex flex-wrap items-center gap-1.5">
        Missed reps or RPE 10: drop
        <input inputMode="numeric" value={r.drop_pct} onChange={(e) => setR({ ...r, drop_pct: Number(e.target.value.replace(/\D/g, "")) || 0 })} className={field} aria-label="Drop percent" />
        %. In between: hold.
      </p>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="h-5 w-5 accent-emerald-400" />
        Apply these automatically (otherwise each one waits for you here)
      </label>
      <div className="flex items-center gap-3">
        <button type="button" disabled={pending} onClick={() => start(async () => { const x = await saveStrengthRules(athleteId, r, auto); setMsg(x.ok ? "Rules approved." : (x.error ?? "Couldn't save.")); router.refresh(); })} className="min-h-10 rounded-xl border border-emerald-300/25 bg-emerald-300/15 px-4 text-sm text-emerald-50">
          {approved ? "Save rules" : "Approve these rules"}
        </button>
        {msg && <span className="text-white/55">{msg}</span>}
      </div>
    </div>
  );
}
