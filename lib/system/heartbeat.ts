import "server-only";

import { createAdminClient } from "@/lib/supabase/server";

/** Record a scheduled job's run for the health page. Never throws. */
export async function beat(job: string, ok: boolean, detail?: unknown, error?: string) {
  try {
    const now = new Date().toISOString();
    await createAdminClient().from("job_heartbeats").upsert({
      job, last_run_at: now, last_ok: ok, last_detail: detail ?? null,
      ...(ok ? {} : { last_error: (error ?? "failed").slice(0, 500), last_error_at: now }),
    });
  } catch {}
}

/** Record a failure worth seeing on the health page (e.g. APNs errors). Never throws. */
export async function logEvent(kind: string, detail: unknown) {
  try {
    await createAdminClient().from("system_events").insert({ kind, detail });
  } catch {}
}
