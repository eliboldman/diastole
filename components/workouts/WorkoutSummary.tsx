import type { Pool, Sport, Step } from "@/lib/workouts/garmin-format";
import { summarize, type Zones } from "@/lib/workouts/totals";

/**
 * A workout at a glance: what it is, total time, total distance, and time hard. Pure render, so it
 * works on server pages and updates live inside the builder. "~" marks an estimate.
 */
export default function WorkoutSummary({
  steps,
  sport,
  pool,
  units,
  zones = null,
  className = "",
}: {
  steps: Step[];
  sport: Sport | string;
  pool: Pool;
  units: "mi" | "km";
  zones?: Zones;
  className?: string;
}) {
  const s = summarize(steps, sport, pool, units, zones);
  const tiles = [
    ["Time", s.time],
    ["Distance", s.distance],
    ["Hard", s.hard],
  ].filter((t): t is [string, string] => Boolean(t[1]));
  return (
    <section aria-label="Workout summary" className={`rounded-[22px] border border-white/10 bg-white/[0.055] p-4 ${className}`}>
      <p className="text-[15px] font-medium leading-snug text-white/90">{s.structure}</p>
      {tiles.length > 0 && (
        <dl className="mt-3 grid gap-2" style={{ gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))` }}>
          {tiles.map(([label, value]) => (
            <div key={label} className="min-w-0 rounded-xl bg-white/[0.04] px-3 py-2">
              <dt className="text-[11px] uppercase tracking-[0.12em] text-white/45">{label}</dt>
              <dd className="mt-0.5 truncate text-lg font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {(s.note || s.time?.startsWith("~") || s.distance?.startsWith("~")) && (
        <p className="mt-2 text-xs text-white/45">{[s.time?.startsWith("~") || s.distance?.startsWith("~") ? "~ estimated from targets and usual pace." : null, s.note].filter(Boolean).join(" ")}</p>
      )}
    </section>
  );
}
