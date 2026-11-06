import type { FuelDay, Session } from "@/lib/fuel/plan";

// Calm colors only: no red, no "over/under".
export const LEVEL_STYLE: Record<FuelDay, { pill: string; dot: string; short: string }> = {
  high: { pill: "border-amber-200/30 bg-amber-200/10 text-amber-100", dot: "bg-amber-200", short: "High" },
  medium: { pill: "border-emerald-300/30 bg-emerald-300/10 text-emerald-100", dot: "bg-emerald-300", short: "Med" },
  low: { pill: "border-sky-200/30 bg-sky-200/10 text-sky-100", dot: "bg-sky-200", short: "Low" },
};

/** "about 50 min", "about 1 h 30 min"; null when the length isn't known. */
export function sessionLength(s: Session) {
  if (!s.minutes) return null;
  if (s.minutes < 90) return `about ${s.minutes} min`;
  const m = s.minutes % 60;
  return `about ${Math.floor(s.minutes / 60)} h${m ? ` ${m} min` : ""}`;
}
