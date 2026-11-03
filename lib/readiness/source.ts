// Garmin data arrives two ways: the live push ("garmin") and the account-export import
// ("garmin_export"). They're the same device family and the same HRV scale; Apple is separate.
export type SourceFamily = "garmin" | "apple";

export const familyOf = (source: string | null | undefined): SourceFamily => (source === "apple" ? "apple" : "garmin");

/**
 * Keep one source family and at most one row per date, preferring the live push over the import
 * (the import skips dates the live sync covers, but this keeps readers safe either way).
 */
export function oneFamily<T extends { date: string; source: string }>(rows: T[], family: SourceFamily): T[] {
  const byDate = new Map<string, T>();
  for (const r of rows) {
    if (familyOf(r.source) !== family) continue;
    const prev = byDate.get(r.date);
    if (!prev || (prev.source === "garmin_export" && r.source !== "garmin_export")) byDate.set(r.date, r);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** The family with more days of data (ties go to Garmin). */
export function dominantFamily(rows: { source: string }[]): SourceFamily {
  const garmin = rows.filter((r) => familyOf(r.source) === "garmin").length;
  return garmin >= rows.length - garmin ? "garmin" : "apple";
}
