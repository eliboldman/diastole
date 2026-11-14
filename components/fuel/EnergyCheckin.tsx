"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { saveEnergyCheckin } from "@/lib/fuel/meal-actions";

const ITEMS = [
  ["fatigue", "Tired most days, even after easy days"],
  ["low_libido", "Lower libido than usual"],
  ["ill", "Sick or run down this week"],
  ["low_mood", "Mood lower than usual"],
] as const;
type Key = (typeof ITEMS)[number][0];

/** Weekly low-energy check-in. Private (you and your head coach). Two or more, or the same one two weeks running, turns the deficit off. */
export default function EnergyCheckin({ done }: { done: boolean }) {
  const router = useRouter();
  const [v, setV] = useState<Record<Key, boolean>>({ fatigue: false, low_libido: false, ill: false, low_mood: false });
  const [msg, setMsg] = useState<string | null>(done ? "Checked in this week." : null);
  const [pending, start] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveEnergyCheckin(v);
          setMsg(r.ok ? "Saved. Thanks." : r.error);
          if (r.ok) router.refresh();
        });
      }}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {ITEMS.map(([k, label]) => (
          <label key={k} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border px-4 text-sm ${v[k] ? "border-amber-300/30 bg-amber-300/10" : "border-white/10 bg-white/[0.04]"}`}>
            <input type="checkbox" checked={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.checked })} className="h-4 w-4 accent-amber-300" />
            {label}
          </label>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button disabled={pending} className="min-h-11 rounded-2xl border border-white/15 px-5 text-sm text-white/85 disabled:opacity-50">
          {Object.values(v).some(Boolean) ? "Save" : "None of these"}
        </button>
        {msg && <span className="text-xs text-white/55">{msg}</span>}
      </div>
    </form>
  );
}
