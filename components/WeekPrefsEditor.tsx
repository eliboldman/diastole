"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { saveWeekPrefs } from "@/lib/ai/plan-actions";
import { WEEK_SPORTS, WEEKDAYS, type DayKey, type WeekPrefs, type WeekSport } from "@/lib/week-prefs";

/** The athlete's preferred week: disciplines per day, time available, a short note. Coaches can edit it too. */
export default function WeekPrefsEditor({ initial, athleteId }: { initial: WeekPrefs; athleteId?: string }) {
  const router = useRouter();
  const [week, setWeek] = useState<WeekPrefs>(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();

  const change = (k: DayKey, patch: Partial<WeekPrefs[DayKey]>) => {
    setWeek((w) => ({ ...w, [k]: { ...w[k], ...patch } }));
    setDirty(true);
    setMsg(null);
  };
  const toggle = (k: DayKey, s: WeekSport) => {
    const cur = week[k].sports;
    const next = s === "rest" ? (cur.includes("rest") ? [] : ["rest" as const]) : cur.includes(s) ? cur.filter((x) => x !== s) : [...cur.filter((x) => x !== "rest"), s];
    change(k, { sports: next, ...(s === "rest" && !cur.includes("rest") ? { minutes: null } : {}) });
  };

  return (
    <div>
      <ul className="space-y-2">
        {WEEKDAYS.map(([k, label]) => {
          const d = week[k];
          const rest = d.sports.includes("rest");
          return (
            <li key={k} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-24 shrink-0 text-sm font-medium">{label}</span>
                <div className="flex flex-wrap gap-1.5">
                  {WEEK_SPORTS.map(([s, name]) => {
                    const on = d.sports.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggle(k, s)}
                        className={`min-h-9 rounded-full border px-3 text-xs ${on ? "border-emerald-300/40 bg-emerald-300/15 text-emerald-50" : "border-white/10 text-white/55"}`}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
              </div>
              {!rest && (
                <div className="mt-2 flex flex-wrap gap-2 sm:pl-[6.5rem]">
                  <label className="flex items-center gap-2 text-xs text-white/50">
                    Up to
                    <input
                      inputMode="numeric"
                      value={d.minutes ?? ""}
                      onChange={(e) => change(k, { minutes: e.target.value ? Number(e.target.value.replace(/\D/g, "").slice(0, 3)) : null })}
                      placeholder="—"
                      className="w-16 rounded-xl border border-white/10 bg-white/[0.05] px-2 py-1.5 text-[16px] text-white tabular-nums focus:border-emerald-300/40 focus:outline-none"
                      aria-label={`${label} minutes available`}
                    />
                    min
                  </label>
                  <input
                    value={d.note}
                    maxLength={80}
                    onChange={(e) => change(k, { note: e.target.value })}
                    placeholder="Note (e.g. group ride, pool before 7)"
                    className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[16px] focus:border-emerald-300/40 focus:outline-none"
                    aria-label={`${label} note`}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex items-center gap-3">
        <button
          disabled={pending || !dirty}
          onClick={() =>
            start(async () => {
              const r = await saveWeekPrefs(athleteId ?? null, week);
              setMsg(r.ok ? "Saved." : r.error);
              if (r.ok) {
                setDirty(false);
                router.refresh();
              }
            })
          }
          className="min-h-11 rounded-2xl bg-emerald-300 px-5 text-sm font-medium text-[#0d1513] disabled:opacity-40"
        >
          Save week
        </button>
        {msg && <p className="text-sm text-white/60">{msg}</p>}
      </div>
    </div>
  );
}
