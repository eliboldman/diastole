// Is a new activity the same session as one already stored (another source: watch, phone, bike
// computer, a hand upload)? Same athlete, start within 3 minutes, similar length, same kind of
// sport. Pure, for tests.

export type ActLite = { id: string; athlete_id: string; source: string; external_id: string; sport: string | null; start_time: string; duration_s: number | null };

const family = (s: string | null) => {
  const t = (s ?? "").toLowerCase();
  if (/swim/.test(t)) return "swim";
  if (/run|treadmill|track|trail/.test(t)) return "run";
  if (/cycl|bik|ride|spin/.test(t)) return "bike";
  if (/walk|hik/.test(t)) return "walk";
  return t ? "other" : "unknown";
};

export function isDuplicate(a: ActLite, b: ActLite) {
  if (a.id === b.id || a.athlete_id !== b.athlete_id) return false;
  if (a.source === b.source && a.external_id === b.external_id) return false;
  if (Math.abs(Date.parse(a.start_time) - Date.parse(b.start_time)) > 3 * 60_000) return false;
  const fa = family(a.sport);
  const fb = family(b.sport);
  if (fa !== fb && fa !== "unknown" && fb !== "unknown" && fa !== "other" && fb !== "other") return false;
  if (a.duration_s && b.duration_s) {
    const r = Math.min(a.duration_s, b.duration_s) / Math.max(a.duration_s, b.duration_s);
    if (r < 0.85) return false;
  }
  return true;
}

/** Summary fields a merge fills on the kept record when it's missing them. */
export const FILL_FIELDS = [
  "duration_s", "distance_m", "avg_hr", "max_hr", "calories", "elevation_gain_m", "elevation_loss_m",
  "avg_speed_mps", "max_speed_mps", "avg_power", "max_power", "avg_cadence", "device", "name",
] as const;

/** Which fields to copy from `from` onto `kept`: present there, missing here. */
export function fillsFor(kept: Record<string, unknown>, from: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of FILL_FIELDS) {
    const empty = kept[k] === null || kept[k] === undefined || kept[k] === "";
    if (k in kept && empty && from[k] !== null && from[k] !== undefined && from[k] !== "") out[k] = from[k];
  }
  return out;
}

export const SOURCE_LABEL: Record<string, string> = { garmin: "Garmin", garmin_export: "Garmin history", apple: "Apple Watch", upload: "uploaded file" };
