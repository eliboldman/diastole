import type { ReactNode } from "react";

import { FLAG_STYLE } from "@/components/coach/Flags";
import Sparkline, { fmt, lastNDays } from "@/components/coach/Sparkline";
import Explain from "@/components/Explain";
import { explain } from "@/lib/explain";
import type { ReadinessRow, WellnessPoint } from "@/lib/coach-data";
import type { Flag } from "@/lib/readiness/engine";

// The readiness breakdown and 14-day trends, shared by the coach's athlete page and the athlete's
// own Readiness page so both see the same numbers. Wording is neutral because either may read it.

const AREAS = ["recovery", "sleep", "stress", "load"] as const;

/** The latest value and the average of the days before it, for "Explain this". */
function latestVsUsual(points: { value: number | null }[]) {
  const xs = points.map((p) => p.value).filter((p): p is number => p !== null && Number.isFinite(p));
  if (xs.length < 4) return {};
  const before = xs.slice(0, -1);
  return { value: xs[xs.length - 1], baseline: before.reduce((a, b) => a + b, 0) / before.length };
}

const AREA_HELP: Record<(typeof AREAS)[number], string> = {
  recovery: "HRV and resting heart rate vs. the last 28 days",
  sleep: "Sleep duration (and Garmin sleep score) vs. baseline and minimums",
  stress: "Garmin all-day stress and Body Battery peak",
  load: "Last 7 days of training vs. the usual week (HR-weighted minutes)",
};

function detailLine(key: (typeof AREAS)[number], d: Record<string, unknown> | null | undefined) {
  if (!d) return null;
  const v = d as Record<string, Record<string, number> | number | undefined>;
  switch (key) {
    case "recovery": {
      const parts = [];
      if (v.hrv && typeof v.hrv === "object") parts.push(`HRV ${v.hrv.today} ms (baseline ${v.hrv.baseline}, ${v.hrv.pct > 0 ? "+" : ""}${v.hrv.pct}%)`);
      if (v.resting_hr && typeof v.resting_hr === "object") parts.push(`RHR ${v.resting_hr.today} bpm (baseline ${v.resting_hr.baseline})`);
      return parts.join(" · ") || null;
    }
    case "sleep":
      return v.sleep && typeof v.sleep === "object"
        ? `${v.sleep.hours} h${v.sleep.baseline_hours ? ` (usual ${v.sleep.baseline_hours} h)` : ""}${typeof v.sleep_score === "number" ? ` · score ${v.sleep_score}` : ""}`
        : null;
    case "stress": {
      const parts = [];
      if (v.stress && typeof v.stress === "object") parts.push(`stress ${v.stress.today} (usual ${v.stress.baseline})`);
      if (typeof v.body_battery_high === "number") parts.push(`Body Battery peak ${v.body_battery_high}`);
      return parts.join(" · ") || null;
    }
    case "load":
      return v.load && typeof v.load === "object" ? `7-day load ${v.load.acute} vs usual ${v.load.chronic_weekly} (×${v.load.ratio})` : null;
  }
}

/** Today's note (or a `title` in its place) plus the four areas, each with its numbers and what it compares. */
export function ReadinessAreas({ today, title }: { today: ReadinessRow | undefined; title?: ReactNode }) {
  return (
    <section className="mt-8 rounded-[28px] border border-white/10 bg-white/[0.05] p-6 backdrop-blur-xl">
      {title ?? <p className="text-lg leading-relaxed text-white/80">{today?.note ?? "No readiness yet — waiting for data."}</p>}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {AREAS.map((key) => {
          const flag: Flag = today?.[key] ?? "unknown";
          return (
            <div key={key} className="rounded-2xl border border-white/[0.09] bg-white/[0.05] p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium capitalize">{key}</p>
                <span className={`inline-flex items-center gap-2 text-sm ${FLAG_STYLE[flag].text}`}>
                  <span className={`h-2 w-2 rounded-full ${FLAG_STYLE[flag].dot}`} aria-hidden />
                  {FLAG_STYLE[flag].label}
                </span>
              </div>
              <p className="mt-1 text-sm text-white/60">{detailLine(key, today?.details) ?? "—"}</p>
              <p className="mt-2 text-xs text-white/45">{AREA_HELP[key]}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** HRV, resting HR, sleep and stress over 14 days, plus one dot per day for the overall flag. */
export function ReadinessTrend({ trend, readiness }: { trend: WellnessPoint[]; readiness: ReadinessRow[] }) {
  return (
    <section className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-6">
      <h2 className="text-lg font-medium">Last 14 days</h2>
      <div className="mt-4 grid grid-cols-2 gap-6 sm:grid-cols-4">
        {(
          [
            ["HRV", "hrv_ms", fmt.hrv, "hrv"],
            ["Resting HR", "resting_hr", fmt.rhr, "resting_hr"],
            ["Sleep", "sleep_seconds", fmt.sleep, "sleep"],
            ["Stress", "stress_avg", fmt.stress, "stress"],
          ] as const
        ).map(([label, field, format, key]) => {
          const points = lastNDays(trend, field);
          return (
            <div key={field} className="relative">
              <Sparkline label={label} points={points} format={format} width={150} height={40} />
              <span className="absolute right-0 top-0">
                <Explain label={label} text={explain(key, latestVsUsual(points))} />
              </span>
            </div>
          );
        })}
      </div>
      {readiness.length > 1 && (
        <div className="mt-6 flex flex-wrap gap-1.5" aria-label="Daily overall flags, oldest to newest">
          {[...readiness].reverse().map((r) => (
            <span key={r.date} title={`${r.date}: ${FLAG_STYLE[r.overall].label}`} className={`h-3 w-3 rounded-full ${FLAG_STYLE[r.overall].dot}`} />
          ))}
        </div>
      )}
    </section>
  );
}
