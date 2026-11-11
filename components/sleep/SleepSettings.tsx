"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { saveSleepPrefs } from "@/lib/sleep/actions";
import type { SleepPrefs } from "@/lib/sleep/bedtime";

const field = "min-h-11 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-[16px] text-white focus:border-emerald-300/40 focus:outline-none";
const hm = (min: number) => `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`;

/** Wake time, sleep goal, prep buffer, evening nudges, quiet hours and a wind-down routine. */
export default function SleepSettings({
  initial,
  goalFromData,
  dataGoalMin,
  routines,
  athleteId,
}: {
  initial: SleepPrefs;
  goalFromData: boolean;
  dataGoalMin: number;
  routines: { id: string; title: string }[];
  athleteId?: string;
}) {
  const router = useRouter();
  const [p, setP] = useState(initial);
  const [ownGoal, setOwnGoal] = useState(!goalFromData);
  const [goal, setGoal] = useState(initial.sleep_goal_min ?? dataGoalMin);
  const [msg, setMsg] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const set = (patch: Partial<SleepPrefs>) => {
    setP((x) => ({ ...x, ...patch }));
    setDirty(true);
    setMsg(null);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-white/65">
          Usual wake time
          <input type="time" value={p.wake_time ?? ""} onChange={(e) => set({ wake_time: e.target.value || null })} className={`mt-1.5 w-full ${field}`} />
          <span className="mt-1 block text-xs text-white/40">Used on nights with no early session.</span>
        </label>
        <div className="text-sm text-white/65">
          Sleep goal
          <div className="mt-1.5 flex items-center gap-2">
            <input
              type="range"
              min={390}
              max={600}
              step={15}
              value={ownGoal ? goal : dataGoalMin}
              onChange={(e) => {
                setOwnGoal(true);
                setGoal(Number(e.target.value));
                setDirty(true);
                setMsg(null);
              }}
              aria-label="Sleep goal"
              className="min-w-0 flex-1 accent-emerald-400"
            />
            <span className="w-24 shrink-0 text-right tabular-nums text-white">{hm(ownGoal ? goal : dataGoalMin)}</span>
          </div>
          <span className="mt-1 block text-xs text-white/40">
            {ownGoal ? (
              <button type="button" onClick={() => { setOwnGoal(false); setDirty(true); }} className="text-emerald-200/80 hover:underline">
                Use my sleep data instead ({hm(dataGoalMin)})
              </button>
            ) : (
              "From your last 30 nights. Slide to set your own."
            )}
          </span>
        </div>
        <label className="text-sm text-white/65">
          Time to get ready and travel
          <select value={p.buffer_min} onChange={(e) => set({ buffer_min: Number(e.target.value) })} className={`mt-1.5 w-full ${field} bg-panel`}>
            {[15, 30, 45, 60, 75, 90, 120].map((m) => (
              <option key={m} value={m}>
                {m} min before a session
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-white/65">
          Wind-down routine (optional)
          <select value={p.wind_down ?? ""} onChange={(e) => set({ wind_down: e.target.value || null })} className={`mt-1.5 w-full ${field} bg-panel`}>
            <option value="">None</option>
            {routines.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="rounded-2xl bg-white/[0.04] p-3">
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>
            Evening nudges in the iPhone app
            <span className="block text-xs text-white/45">Up to two each evening (wind down, lights out). “Not tonight” on any of them.</span>
          </span>
          <input type="checkbox" checked={p.nudges} onChange={(e) => set({ nudges: e.target.checked })} className="h-6 w-6 shrink-0 accent-emerald-400" />
        </label>
        {p.nudges && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-white/65">
            Quiet hours
            <input type="time" value={p.quiet_start} onChange={(e) => set({ quiet_start: e.target.value })} aria-label="Quiet hours start" className={field} />
            to
            <input type="time" value={p.quiet_end} onChange={(e) => set({ quiet_end: e.target.value })} aria-label="Quiet hours end" className={field} />
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending || !dirty}
          onClick={() =>
            start(async () => {
              const r = await saveSleepPrefs(athleteId ?? null, { ...p, sleep_goal_min: ownGoal ? goal : null });
              setMsg(r.ok ? "Saved." : r.error);
              if (r.ok) {
                setDirty(false);
                router.refresh();
              }
            })
          }
          className="min-h-11 rounded-2xl bg-emerald-300 px-5 text-sm font-medium text-black disabled:opacity-40"
        >
          Save sleep settings
        </button>
        {msg && <p className="text-sm text-white/60">{msg}</p>}
      </div>
    </div>
  );
}
