// A Garmin Connect export zip can carry a schedule.csv (date,title,sport,workoutId).
// This turns it into a one-time list of drafts: no repeats, nothing in the past, no doubles.

export type ScheduleRow = { date: string; title: string; workoutId: string | null };
export type ImportedRef = { libraryId: string; title: string; garminId: string | null };
export type PlannedRef = { date: string; title: string };
export type ScheduleAdd = { date: string; title: string; libraryId: string };
export type ScheduleSkip = { date: string; title: string; reason: string };

/** Splits one CSV line, honouring double-quoted fields. */
function cells(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/** Reads schedule.csv. Needs a header with "date" and "title"; "workoutId" is optional. Max 200 rows. */
export function parseScheduleCsv(text: string): ScheduleRow[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const head = cells(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z]/g, ""));
  const di = head.indexOf("date");
  const ti = head.findIndex((h) => h === "title" || h === "name" || h === "workout");
  const wi = head.indexOf("workoutid");
  if (di < 0 || ti < 0) return [];
  const rows: ScheduleRow[] = [];
  for (const line of lines.slice(1, 201)) {
    const c = cells(line);
    const date = c[di] ?? "";
    const title = (c[ti] ?? "").slice(0, 200);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !title) continue;
    rows.push({ date, title, workoutId: wi >= 0 && c[wi] ? c[wi] : null });
  }
  return rows;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Matches schedule rows to the library items just imported (by Garmin workout id, then title),
 * dropping past dates, rows already on the athlete's calendar, and repeats within the file.
 */
export function planSchedule(rows: ScheduleRow[], imported: ImportedRef[], existing: PlannedRef[], today: string) {
  const byGarmin = new Map(imported.filter((i) => i.garminId).map((i) => [String(i.garminId), i]));
  const byTitle = new Map(imported.map((i) => [norm(i.title), i]));
  const taken = new Set(existing.map((e) => `${e.date}|${norm(e.title)}`));
  const add: ScheduleAdd[] = [];
  const skipped: ScheduleSkip[] = [];
  for (const r of [...rows].sort((a, b) => a.date.localeCompare(b.date))) {
    const item = (r.workoutId && byGarmin.get(r.workoutId)) || byTitle.get(norm(r.title));
    if (!item) {
      skipped.push({ date: r.date, title: r.title, reason: "workout wasn't in the zip" });
      continue;
    }
    if (r.date < today) {
      skipped.push({ date: r.date, title: r.title, reason: "date has passed" });
      continue;
    }
    const key = `${r.date}|${norm(item.title)}`;
    if (taken.has(key)) {
      skipped.push({ date: r.date, title: item.title, reason: "already on the calendar" });
      continue;
    }
    taken.add(key);
    add.push({ date: r.date, title: item.title, libraryId: item.libraryId });
  }
  return { add, skipped };
}
