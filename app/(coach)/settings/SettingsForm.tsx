"use client";

import { useActionState } from "react";

import { saveSettings, type SettingsState } from "./actions";

const US_ZONES = [
  ["America/New_York", "Eastern"],
  ["America/Chicago", "Central"],
  ["America/Denver", "Mountain"],
  ["America/Phoenix", "Arizona"],
  ["America/Los_Angeles", "Pacific"],
  ["America/Anchorage", "Alaska"],
  ["Pacific/Honolulu", "Hawaii"],
];

const input =
  "w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white placeholder:text-white/45 focus:border-emerald-300/40 focus:outline-none";

export default function SettingsForm({ fullName, timezone, units }: { fullName: string; timezone: string; units: "mi" | "km" }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveSettings, {});
  const zones = US_ZONES.some(([z]) => z === timezone) ? US_ZONES : [...US_ZONES, [timezone, timezone]];

  return (
    <form action={action} className="grid w-full max-w-md grid-cols-[minmax(0,1fr)] gap-4">
      <label className="grid gap-2 text-sm text-white/60">
        Name
        <input name="full_name" defaultValue={fullName} className={input} />
      </label>
      <label className="grid gap-2 text-sm text-white/60">
        Timezone
        <select name="timezone" defaultValue={timezone} className={input}>
          {zones.map(([z, label]) => (
            <option key={z} value={z} className="bg-panel">
              {label}
            </option>
          ))}
        </select>
        <span className="text-xs text-white/50">Decides which day a late-evening workout counts toward.</span>
      </label>
      <label className="grid gap-2 text-sm text-white/60">
        Units
        <select name="units" defaultValue={units} className={input}>
          <option value="mi" className="bg-panel">
            Miles (pace per mile)
          </option>
          <option value="km" className="bg-panel">
            Kilometres (pace per km)
          </option>
        </select>
      </label>
      <div className="flex items-center gap-4">
        <button
          disabled={pending}
          className="rounded-2xl border border-emerald-300/25 bg-emerald-300/10 px-5 py-3 font-medium text-emerald-100 hover:bg-emerald-300/20 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {state.ok && <span className="text-sm text-emerald-200">Saved.</span>}
        {state.error && <span className="text-sm text-red-300">{state.error}</span>}
      </div>
    </form>
  );
}
