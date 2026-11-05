"use client";

import { useActionState } from "react";

import { saveZones, type ZonesState } from "@/lib/activity/actions";

const input =
  "w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-base text-white placeholder:text-white/35 focus:border-emerald-300/40 focus:outline-none";

export default function ZonesForm({
  athleteId,
  maxHr,
  thresholdPace,
  ftp,
  thresholdHr = null,
  estimatedMaxHr,
  units = "mi",
}: {
  units?: "mi" | "km";
  athleteId: string;
  maxHr: number | null;
  thresholdPace: string | null; // "7:15" per mile or km
  ftp: number | null;
  thresholdHr?: number | null;
  estimatedMaxHr: number | null;
}) {
  const [state, action, pending] = useActionState<ZonesState, FormData>(saveZones, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="athlete_id" value={athleteId} />
      <input type="hidden" name="units" value={units} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block min-w-0 text-sm text-white/65">
          Max heart rate
          <input name="max_hr" inputMode="numeric" defaultValue={maxHr ?? ""} placeholder={estimatedMaxHr ? `~${estimatedMaxHr} estimated` : "e.g. 195"} className={`mt-1.5 ${input}`} />
        </label>
        <label className="block min-w-0 text-sm text-white/65">
          Threshold pace (min/{units})
          <input name="threshold_pace" inputMode="numeric" defaultValue={thresholdPace ?? ""} placeholder={units === "mi" ? "e.g. 6:35" : "e.g. 4:05"} className={`mt-1.5 ${input}`} />
        </label>
        <label className="block min-w-0 text-sm text-white/65">
          FTP (watts)
          <input name="ftp" inputMode="numeric" defaultValue={ftp ?? ""} placeholder="e.g. 250" className={`mt-1.5 ${input}`} />
        </label>
        <label className="block min-w-0 text-sm text-white/65">
          Threshold heart rate
          <input name="threshold_hr" inputMode="numeric" defaultValue={thresholdHr ?? ""} placeholder="e.g. 172" className={`mt-1.5 ${input}`} />
        </label>
      </div>
      <p className="text-xs text-white/45">Leave a field blank to use an estimate (max HR) or skip that zone chart.</p>
      {state?.error && <p className="text-sm text-red-300">{state.error}</p>}
      {state?.ok && <p className="text-sm text-emerald-200">Zones saved.</p>}
      <button
        type="submit"
        disabled={pending}
        className="flex min-h-11 items-center rounded-xl border border-emerald-300/25 bg-emerald-300/10 px-4 text-sm text-emerald-100 transition active:scale-95 hover:bg-emerald-300/20 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save zones"}
      </button>
    </form>
  );
}
