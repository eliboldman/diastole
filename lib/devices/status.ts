// Is each athlete's watch working? Rules only, from what the app already records: the connection
// and its last sync, workouts approved but not on the watch, deletions that didn't reach it, and
// intervals.icu errors. Pure module, testable with `node`.

export type DeviceRow = { source: "garmin" | "apple"; connected_at: string; last_synced_at: string | null } | null;
export type WorkoutRow = {
  scheduled_date: string;
  status: string;
  external_id: string | null;
  sent_at: string | null;
  deleted_at: string | null;
  removal_status: string | null;
};
export type IntervalsRow = { last_error: string | null; dirty_at: string | null; pushed_at: string | null } | null;

export type Issue = { key: "none" | "stale" | "unsent" | "waiting" | "removal" | "intervals"; text: string };
export type WatchStatus = { state: "ok" | "attention" | "none"; device: "garmin" | "apple" | null; lastSync: string | null; issues: Issue[] };

const HOUR = 3_600_000;
const STALE_HOURS = 48;
const APPLE_WAIT_HOURS = 12;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const daysAgo = (iso: string, now: number) => Math.max(1, Math.floor((now - Date.parse(iso)) / (24 * HOUR)));

export function watchStatus(opts: { device: DeviceRow; workouts: WorkoutRow[]; intervals?: IntervalsRow; today: string; now?: number }): WatchStatus {
  const now = opts.now ?? Date.now();
  const d = opts.device;
  if (!d) return { state: "none", device: null, lastSync: null, issues: [{ key: "none", text: "No watch connected" }] };

  const issues: Issue[] = [];
  const garmin = d.source === "garmin";

  // Nothing heard from the watch for two days. (A brand-new connection gets the same grace period.)
  const heard = d.last_synced_at ?? d.connected_at;
  if (now - Date.parse(heard) > STALE_HOURS * HOUR) {
    const n = daysAgo(heard, now);
    issues.push({
      key: "stale",
      text: d.last_synced_at
        ? garmin
          ? `No Garmin data in ${plural(n, "day", "days")}. Their watch may not be syncing to Garmin Connect, or access was removed.`
          : `The iPhone app hasn't synced in ${plural(n, "day", "days")}. Ask them to open Diastole.`
        : garmin
          ? `Connected ${plural(n, "day", "days")} ago but no Garmin data yet.`
          : `Connected ${plural(n, "day", "days")} ago but the iPhone app hasn't synced yet.`,
    });
  }

  const upcoming = opts.workouts.filter((w) => !w.deleted_at && w.scheduled_date >= opts.today);
  if (garmin) {
    // Approved but no Garmin id: the send failed (the coach page has a retry button).
    const unsent = upcoming.filter((w) => (w.status === "approved" || w.status === "sent") && !w.external_id).length;
    if (unsent) issues.push({ key: "unsent", text: `${plural(unsent, "workout", "workouts")} approved but not on the watch (sending failed).` });
  } else {
    // Apple: "sent" until the iPhone app confirms it put the workout on the watch.
    const waiting = upcoming.filter((w) => (w.status === "approved" || w.status === "sent") && !w.external_id && w.sent_at && now - Date.parse(w.sent_at) > APPLE_WAIT_HOURS * HOUR).length;
    if (waiting) issues.push({ key: "waiting", text: `${plural(waiting, "workout", "workouts")} waiting for the iPhone app to put ${waiting === 1 ? "it" : "them"} on the watch.` });
  }

  const stuck = opts.workouts.filter((w) => w.deleted_at && w.removal_status === "failed").length;
  if (stuck) issues.push({ key: "removal", text: `${plural(stuck, "deleted workout", "deleted workouts")} still on the watch (removal failed).` });

  if (opts.intervals?.last_error) issues.push({ key: "intervals", text: `intervals.icu: ${opts.intervals.last_error}` });

  return { state: issues.length ? "attention" : "ok", device: d.source, lastSync: d.last_synced_at, issues };
}
