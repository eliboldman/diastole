import "server-only";

import { createAdminClient } from "@/lib/supabase/server";

export type WebhookOutcome = "ok" | "bad_key" | "bad_json" | "ingest_error";

const KEEP_DAYS = 90;

/** Items per summary type, plus the number of distinct Garmin users, from a push body. */
export function summarizePush(body: unknown) {
  const counts: Record<string, number> = {};
  const users = new Set<string>();
  if (body && typeof body === "object") {
    for (const [type, items] of Object.entries(body as Record<string, unknown>)) {
      if (!Array.isArray(items)) continue;
      counts[type] = items.length;
      for (const item of items) {
        const id = (item as { userId?: unknown } | null)?.userId;
        if (typeof id === "string") users.add(id);
      }
    }
  }
  return { counts, garminUsers: users.size };
}

/** Records one delivery. Never throws: logging must not change what Garmin sees. */
export async function logWebhook(entry: {
  host: string | null;
  outcome: WebhookOutcome;
  counts?: Record<string, number> | null;
  garminUsers?: number | null;
  athletesTouched?: number | null;
  error?: string | null;
  startedAt: number;
}) {
  try {
    const admin = createAdminClient();

    // Wrong-secret requests are unauthenticated, so keep at most one such row a minute.
    if (entry.outcome === "bad_key") {
      const since = new Date(Date.now() - 60_000).toISOString();
      const { count } = await admin
        .from("garmin_webhook_log")
        .select("id", { count: "exact", head: true })
        .eq("outcome", "bad_key")
        .gte("received_at", since);
      if (count) return;
    }

    const { error } = await admin.from("garmin_webhook_log").insert({
      host: entry.host,
      outcome: entry.outcome,
      counts: entry.counts ?? null,
      garmin_users: entry.garminUsers ?? null,
      athletes_touched: entry.athletesTouched ?? null,
      error: entry.error ? entry.error.slice(0, 1000) : null,
      duration_ms: Math.round(Date.now() - entry.startedAt),
    });
    if (error) console.error("Garmin webhook log insert failed", error.message);

    // Occasional cleanup keeps the table small without a separate cron.
    if (Math.random() < 0.02) {
      const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString();
      await admin.from("garmin_webhook_log").delete().lt("received_at", cutoff);
    }
  } catch (e) {
    console.error("Garmin webhook log failed", e);
  }
}
