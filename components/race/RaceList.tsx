import { ChevronRight, Flag } from "lucide-react";
import Link from "next/link";

import { clock } from "@/lib/activity/format";
import { daysUntil } from "@/lib/fuel/race";
import type { RaceRow } from "@/lib/fuel/race-data";

const SPORT: Record<string, string> = { run: "Run", bike: "Bike", swim: "Swim", tri: "Triathlon", other: "Race" };

export function raceDistance(km: number | null, units: "mi" | "km") {
  if (!km) return null;
  const v = units === "mi" ? km / 1.609344 : km;
  return `${v >= 100 ? Math.round(v) : Math.round(v * 10) / 10} ${units}`;
}

export function countdown(days: number) {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 0) return days === -1 ? "Yesterday" : `${-days} days ago`;
  if (days < 14) return `In ${days} days`;
  return `In ${Math.round(days / 7)} weeks`;
}

/** Races as rows: date, countdown, sport and distance, priority. */
export default function RaceList({ races, today, units, empty }: { races: RaceRow[]; today: string; units: "mi" | "km"; empty?: string }) {
  if (!races.length) return <p className="text-sm text-white/55">{empty ?? "No races yet."}</p>;
  return (
    <ul className="grid gap-2">
      {races.map((r) => {
        const d = daysUntil(r.race_date, today);
        return (
          <li key={r.id}>
            <Link href={`/races/${r.id}`} className="lift flex min-h-14 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-semibold ${r.priority === "A" ? "bg-emerald-300/20 text-emerald-100" : "bg-white/[0.06] text-white/60"}`}>{r.priority}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{r.name}</span>
                <span className="block truncate text-xs text-white/50">
                  {[new Date(`${r.race_date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }), SPORT[r.sport], raceDistance(r.distance_km, units), r.goal_seconds ? `goal ${clock(r.goal_seconds)}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <span className={`shrink-0 text-xs ${d >= 0 && d <= 10 ? "text-emerald-200" : "text-white/50"}`}>
                {d >= 0 && d <= 10 && <Flag size={12} className="mr-1 inline" aria-hidden />}
                {countdown(d)}
              </span>
              <ChevronRight size={16} className="shrink-0 text-white/35" aria-hidden />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
