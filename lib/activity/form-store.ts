import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Streams } from "@/lib/activity/fit";
import { summarizeForm, type FormRun, type FormSummary } from "@/lib/activity/form";

const EMPTY: FormSummary = { v: 1, moving_s: 0, metrics: {} };
const RUN_FILTER = "sport.ilike.%run%,sport.ilike.%treadmill%,sport.ilike.%trail%,sport.ilike.%track%";

/** The form summary to store for a run (an empty one means "checked, nothing recorded"). */
export function formToStore(streams: Streams | null, sport: string | null): FormSummary | null {
  if (!/run|treadmill|trail|track/i.test(sport ?? "")) return null;
  return summarizeForm(streams, sport) ?? EMPTY;
}

/**
 * An athlete's recent runs that have form data, newest first. Runs stored before form summaries
 * existed are summarized here once and saved, so later reads are cheap. Uses the service role:
 * call only after checking the viewer may see this athlete's workout details.
 */
export async function recentFormRuns(admin: SupabaseClient, athleteId: string, opts: { before?: string; limit?: number; timeZone?: string } = {}): Promise<(FormRun & { id: string; start_time: string })[]> {
  let q = admin
    .from("activities")
    .select("id, start_time, sport, activity_details(form)")
    .eq("athlete_id", athleteId)
    .or(RUN_FILTER)
    .order("start_time", { ascending: false })
    .limit(opts.limit ?? 30);
  if (opts.before) q = q.lt("start_time", opts.before);
  const { data } = await q;

  type Row = { id: string; start_time: string; sport: string | null; activity_details: { form: FormSummary | null } | { form: FormSummary | null }[] | null };
  const rows = (data ?? []) as Row[];
  const detailOf = (r: Row) => (Array.isArray(r.activity_details) ? r.activity_details[0] : r.activity_details);

  const missing = rows.filter((r) => detailOf(r) && !detailOf(r)!.form).map((r) => r.id);
  const filled = new Map<string, FormSummary | null>();
  if (missing.length) {
    const { data: details } = await admin.from("activity_details").select("activity_id, streams").in("activity_id", missing);
    for (const d of details ?? []) {
      const row = rows.find((r) => r.id === d.activity_id)!;
      const form = formToStore(d.streams as Streams, row.sport);
      filled.set(d.activity_id, form);
      if (form) await admin.from("activity_details").update({ form }).eq("activity_id", d.activity_id);
    }
  }

  const day = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: opts.timeZone ?? "America/Chicago" }).format(new Date(iso));
  return rows
    .map((r) => ({ id: r.id, start_time: r.start_time, date: day(r.start_time), form: filled.get(r.id) ?? detailOf(r)?.form ?? null }))
    .filter((r): r is { id: string; start_time: string; date: string; form: FormSummary } => Boolean(r.form && Object.keys(r.form.metrics).length));
}
