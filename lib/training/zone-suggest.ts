// Zone update suggestions from recent best efforts. Rules only, and only upward (or filling a blank):
// a training session isn't an all-out effort, so it can show someone got fitter but never that they
// got slower. Pure module, testable with `node`.

export type ZoneKey = "ftp_w" | "threshold_speed_mps" | "max_hr" | "css_sec_per_100m";
export type CurrentZones = { ftp_w?: number | null; threshold_speed_mps?: number | null; max_hr?: number | null; css_sec_per_100m?: number | null; dismissed?: Partial<Record<string, number>> | null } | null;
export type Effort = {
  activity_id: string;
  start_time: string;
  sport?: string | null;
  bests?: { run_5k?: number; run_10k?: number; run_half?: number; power_20m?: number } | null;
  max_hr?: number | null;
};
export type Suggestion = {
  key: ZoneKey;
  current: number | null;
  suggested: number;
  why: string;
  activity_id: string;
  date: string;
  /** From a threshold test: can lower the zone, and applying or dismissing it settles this test. */
  test?: { kind: string; title: string; thresholdHr?: number };
};

// FTP is a cycling number. Running power (Garmin, Stryd) reads far higher than bike power, so a
// run must never feed an FTP suggestion, even if an old stored best has power on it.
const BIKE = /cycl|bik|ride|spin/i;
const RUN = /run|treadmill|track|trail/i;
const isRide = (sport: string | null | undefined) => BIKE.test(sport ?? "") && !RUN.test(sport ?? "");

const MIN_RAISE = 0.03; // suggest only when at least 3% above the current zone
const RIEGEL = 1.06;
const DIST = { run_5k: 5000, run_10k: 10000, run_half: 21097.5 } as const;
const LABEL = { run_5k: "5K", run_10k: "10K", run_half: "half marathon" } as const;

const clock = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.round(s % 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
};
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Speed (m/s) you could hold for an hour, from a best time over a distance (Riegel). */
export function hourSpeed(meters: number, seconds: number): number {
  const d = meters * Math.pow(3600 / seconds, 1 / RIEGEL);
  return d / 3600;
}

/** Suggestions for one athlete from their efforts of the last ~60 days. */
export function suggestZones(zones: CurrentZones, efforts: Effort[]): Suggestion[] {
  const out: Suggestion[] = [];
  const dismissed = zones?.dismissed ?? {};
  // Only suggest above both the current value and anything the coach already turned down.
  const worth = (key: ZoneKey, value: number, current: number | null) => {
    const floor = Math.max(current ?? 0, Number(dismissed[key] ?? 0));
    return floor === 0 || value >= floor * (1 + MIN_RAISE);
  };

  // FTP: 95% of the best 20-minute power.
  const p = efforts.filter((e) => isRide(e.sport) && (e.bests?.power_20m ?? 0) > 0).sort((a, b) => b.bests!.power_20m! - a.bests!.power_20m!)[0];
  if (p) {
    const ftp = Math.round(p.bests!.power_20m! * 0.95);
    const cur = zones?.ftp_w ? Number(zones.ftp_w) : null;
    if (ftp >= 50 && ftp <= 600 && worth("ftp_w", ftp, cur))
      out.push({ key: "ftp_w", current: cur, suggested: ftp, why: `Best 20 minutes: ${p.bests!.power_20m} W on ${day(p.start_time)} (FTP ≈ 95% of that).`, activity_id: p.activity_id, date: p.start_time });
  }

  // Threshold pace: the best 5K/10K/half projected to an hour's effort.
  let best: { speed: number; e: Effort; k: keyof typeof DIST; t: number } | null = null;
  for (const e of efforts)
    for (const k of Object.keys(DIST) as (keyof typeof DIST)[]) {
      const t = e.bests?.[k];
      if (!t || t <= 0) continue;
      const speed = hourSpeed(DIST[k], t);
      if (!best || speed > best.speed) best = { speed, e, k, t };
    }
  if (best) {
    const speed = Math.round(best.speed * 1000) / 1000;
    const cur = zones?.threshold_speed_mps ? Number(zones.threshold_speed_mps) : null;
    if (speed >= 1 && speed <= 10 && worth("threshold_speed_mps", speed, cur))
      out.push({
        key: "threshold_speed_mps",
        current: cur,
        suggested: speed,
        why: `Fastest ${LABEL[best.k]}: ${clock(best.t)} on ${day(best.e.start_time)} (threshold ≈ the pace you could hold for an hour).`,
        activity_id: best.e.activity_id,
        date: best.e.start_time,
      });
  }

  // Max HR: the second-highest workout max, so one sensor spike can't set it.
  const hrs = efforts.filter((e) => (e.max_hr ?? 0) >= 120 && (e.max_hr ?? 0) <= 230).sort((a, b) => b.max_hr! - a.max_hr!);
  if (hrs.length >= 2) {
    const hr = Math.round(hrs[1].max_hr!);
    const cur = zones?.max_hr ? Number(zones.max_hr) : null;
    // Heart rate moves in small steps: suggest at +2 bpm rather than +3%.
    const floor = Math.max(cur ?? 0, Number(dismissed.max_hr ?? 0));
    if (floor === 0 || hr >= floor + 2)
      out.push({ key: "max_hr", current: cur, suggested: hr, why: `Reached ${Math.round(hrs[0].max_hr!)} and ${hr} bpm in two workouts recently.`, activity_id: hrs[1].activity_id, date: hrs[1].start_time });
  }
  return out;
}

/** Plain words for a suggestion's numbers, in the coach's units. */
export function zoneText(key: ZoneKey, v: number | null, units: "mi" | "km"): string {
  if (v === null) return "not set";
  if (key === "ftp_w") return `${v} W`;
  if (key === "max_hr") return `${v} bpm`;
  if (key === "css_sec_per_100m") return units === "mi" ? `${clock(v * 0.9144)}/100 yd` : `${clock(v)}/100 m`;
  const per = units === "mi" ? 1609.344 : 1000;
  return `${clock(per / v)}/${units}`;
}
export const ZONE_LABEL: Record<ZoneKey, string> = { ftp_w: "FTP", threshold_speed_mps: "Threshold pace", max_hr: "Max HR", css_sec_per_100m: "Swim CSS" };
