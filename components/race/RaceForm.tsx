"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { saveRace } from "@/lib/fuel/race-actions";

const field = "w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-[16px] focus:border-emerald-300/40 focus:outline-none";
const SPORTS = [
  ["run", "Run"],
  ["bike", "Bike"],
  ["swim", "Swim"],
  ["tri", "Triathlon"],
  ["other", "Other"],
] as const;

export type RaceInitial = { id: string; name: string; race_date: string; sport: string; distance_km: number | null; goal_seconds: number | null; priority: string; notes: string | null };

const goalText = (s: number | null) => {
  if (!s) return "";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};

/** Add or edit a race. A coach passes the athlete's id. */
export default function RaceForm({ athleteId, units, initial, onDone }: { athleteId?: string; units: "mi" | "km"; initial?: RaceInitial; onDone?: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({
    name: initial?.name ?? "",
    date: initial?.race_date ?? "",
    sport: initial?.sport ?? "run",
    distance: initial?.distance_km ? String(Math.round((initial.distance_km / (units === "mi" ? 1.609344 : 1)) * 100) / 100) : "",
    goal: goalText(initial?.goal_seconds ?? null),
    priority: initial?.priority ?? "A",
    notes: initial?.notes ?? "",
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveRace({ ...f, id: initial?.id, athleteId, unit: units });
          if (!r.ok) return setMsg(r.error);
          setMsg(null);
          if (!initial) setF({ name: "", date: "", sport: "run", distance: "", goal: "", priority: "A", notes: "" });
          router.refresh();
          onDone?.();
        });
      }}
      className="grid gap-3 sm:grid-cols-2"
    >
      <label className="sm:col-span-2">
        <span className="text-sm text-white/60">Race</span>
        <input value={f.name} onChange={set("name")} maxLength={80} placeholder="Lakefront Half Marathon" className={`${field} mt-1`} />
      </label>
      <label>
        <span className="text-sm text-white/60">Date</span>
        <input type="date" value={f.date} onChange={set("date")} className={`${field} mt-1`} />
      </label>
      <label>
        <span className="text-sm text-white/60">Sport</span>
        <select value={f.sport} onChange={set("sport")} className={`${field} mt-1`}>
          {SPORTS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="text-sm text-white/60">Distance ({units})</span>
        <input inputMode="decimal" value={f.distance} onChange={(e) => setF({ ...f, distance: e.target.value.replace(/[^0-9.]/g, "").slice(0, 7) })} placeholder={units === "mi" ? "13.1" : "21.1"} className={`${field} mt-1`} />
      </label>
      <label>
        <span className="text-sm text-white/60">Goal time (optional)</span>
        <input value={f.goal} onChange={(e) => setF({ ...f, goal: e.target.value.replace(/[^0-9:]/g, "").slice(0, 8) })} placeholder="1:45:00" className={`${field} mt-1`} />
      </label>
      <fieldset className="sm:col-span-2">
        <legend className="text-sm text-white/60">How important</legend>
        <div className="mt-1 flex gap-2">
          {[
            ["A", "A · goal race"],
            ["B", "B · tune-up"],
            ["C", "C · for fun"],
          ].map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => setF({ ...f, priority: v })}
              aria-pressed={f.priority === v}
              className={`min-h-11 flex-1 rounded-2xl border px-3 text-sm ${f.priority === v ? "border-emerald-300/40 bg-emerald-300/15 text-emerald-50" : "border-white/10 text-white/65"}`}
            >
              {l}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="sm:col-span-2">
        <span className="text-sm text-white/60">Notes (optional)</span>
        <textarea value={f.notes} onChange={set("notes")} maxLength={500} rows={2} placeholder="Start time, wave, aid stations…" className={`${field} mt-1`} />
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button disabled={pending || !f.name.trim() || !f.date} className="min-h-12 rounded-2xl bg-emerald-300 px-6 font-medium text-black disabled:opacity-50">
          {pending ? "Saving…" : initial ? "Save race" : "Add race"}
        </button>
        {onDone && (
          <button type="button" onClick={onDone} className="min-h-12 px-3 text-sm text-white/55">
            Cancel
          </button>
        )}
        {msg && <p className="text-sm text-red-200">{msg}</p>}
      </div>
    </form>
  );
}
