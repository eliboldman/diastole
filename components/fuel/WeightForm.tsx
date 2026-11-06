"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { saveWeight } from "@/lib/fuel/meal-actions";

/** Body weight for daily targets. Only the athlete and their coach can see it. */
export default function WeightForm({ weightKg, unit }: { weightKg: number | null; unit: "kg" | "lb" }) {
  const router = useRouter();
  const shown = weightKg ? (unit === "lb" ? Math.round(weightKg / 0.45359237) : Math.round(weightKg * 10) / 10) : "";
  const [value, setValue] = useState(String(shown));
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveWeight(Number(value), unit);
          setMsg(r.ok ? "Saved." : r.error);
          if (r.ok) router.refresh();
        });
      }}
      className="flex flex-wrap items-end gap-2"
    >
      <label className="block">
        <span className="text-sm text-white/60">Body weight</span>
        <span className="mt-1 flex items-center gap-2">
          <input
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/[^0-9.]/g, "").slice(0, 6))}
            className="w-24 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-[16px] tabular-nums focus:border-emerald-300/40 focus:outline-none"
            aria-label={`Body weight in ${unit}`}
          />
          <span className="text-sm text-white/55">{unit}</span>
        </span>
      </label>
      <button disabled={pending || !value} className="min-h-12 rounded-2xl border border-white/15 px-5 text-sm text-white/85 disabled:opacity-50">
        {weightKg ? "Update" : "Save"}
      </button>
      {msg && <p className="w-full text-xs text-white/55">{msg}</p>}
      <p className="w-full text-xs text-white/40">Used only to size your daily targets. Only you and your coach see it.</p>
    </form>
  );
}
