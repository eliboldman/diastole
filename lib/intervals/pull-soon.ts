import "server-only";

import { createAdminClient } from "@/lib/supabase/server";

import { pullRides } from "./sync";

const STALE_MS = 2 * 60 * 60_000;

/** Pulls rides from intervals.icu if this athlete is connected and it's been a while. Never throws. */
export async function pullIfStale(athleteId: string) {
  try {
    const admin = createAdminClient();
    const { data: conn } = await admin.from("intervals_connections").select("pulled_at").eq("athlete_id", athleteId).maybeSingle();
    if (!conn || (conn.pulled_at && Date.now() - new Date(conn.pulled_at).getTime() < STALE_MS)) return;
    // Claim the slot first so two quick page loads don't both download.
    const { data: claimed } = await admin
      .from("intervals_connections")
      .update({ pulled_at: new Date().toISOString() })
      .eq("athlete_id", athleteId)
      .or(conn.pulled_at ? `pulled_at.eq.${conn.pulled_at}` : "pulled_at.is.null")
      .select("athlete_id");
    if (!claimed?.length) return;
    await pullRides(athleteId, admin, conn.pulled_at);
  } catch (e) {
    console.error("intervals pull failed", e);
  }
}
