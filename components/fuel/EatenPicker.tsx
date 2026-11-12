"use client";

import { useState } from "react";

import { AGO_CHOICES, localDateOf, MAX_DAYS_BACK, type EatenAt } from "@/lib/fuel/eaten";

const chip = (on: boolean) =>
  `min-h-10 rounded-full border px-3 text-sm transition-colors ${on ? "border-emerald-300/50 bg-emerald-300/15 text-emerald-100" : "border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.08]"}`;

const field = "rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-[16px] text-white focus:border-emerald-300/40 focus:outline-none [color-scheme:dark]";

/** The athlete's local days to choose from (today first) and the current local clock time. */
function nowParts(timeZone: string) {
  const now = Date.now();
  const days = Array.from({ length: MAX_DAYS_BACK + 1 }, (_, i) => {
    const date = localDateOf(now - i * 86_400_000, timeZone);
    const label = i === 0 ? "Today" : i === 1 ? "Yesterday" : new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
    return { date, label };
  });
  const time = new Date(now).toLocaleTimeString("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false });
  return { days, time };
}

/**
 * "When did you eat it?": quick choices (just now, 30 min, 1 h, 2 h ago) or any clock time on
 * today or the last few days, in the athlete's own timezone.
 */
export default function EatenPicker({ timeZone, value, onChange, initial }: { timeZone: string; value: EatenAt; onChange: (v: EatenAt) => void; initial?: string }) {
  const [{ days, time: nowTime }] = useState(() => nowParts(timeZone));
  // A meal being moved starts from its current day and time.
  const start = initial
    ? { date: localDateOf(Date.parse(initial), timeZone), time: new Date(initial).toLocaleTimeString("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }) }
    : { date: days[0].date, time: nowTime };
  const [custom, setCustom] = useState<{ date: string; time: string }>(start);
  const isCustom = !("ago" in value);

  return (
    <div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="When did you eat it?">
        {AGO_CHOICES.map((c) => (
          <button key={c.ago} type="button" className={chip("ago" in value && value.ago === c.ago)} onClick={() => onChange({ ago: c.ago })}>
            {c.label}
          </button>
        ))}
        <button type="button" className={chip(isCustom)} onClick={() => onChange(custom)}>
          Other time
        </button>
      </div>
      {isCustom && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            aria-label="Day"
            className={field}
            value={custom.date}
            onChange={(e) => {
              const next = { ...custom, date: e.target.value };
              setCustom(next);
              onChange(next);
            }}
          >
            {days.map((d) => (
              <option key={d.date} value={d.date}>
                {d.label}
              </option>
            ))}
          </select>
          <input
            type="time"
            aria-label="Time"
            className={field}
            value={custom.time}
            onChange={(e) => {
              const next = { ...custom, time: e.target.value };
              setCustom(next);
              if (e.target.value) onChange(next);
            }}
          />
        </div>
      )}
    </div>
  );
}
