import "server-only";

import { createAdminClient } from "@/lib/supabase/server";

import { decideNudge, NUDGE, nudgeMessage, staffMessage, type NudgeActivity } from "./protein-nudge";

const MIN = 60_000;

/**
 * Sends the post-workout protein nudges that are due (see protein-nudge.ts). Called every 5 minutes
 * by the database scheduler. Safe to call any number of times: each workout is claimed once.
 * Each claimed workout also alerts the athlete's dietitians (with protein logged so far), even when
 * the athlete has turned their own reminder off.
 */
export async function runProteinNudges(nowMs = Date.now()) {
  const admin = createAdminClient();
  const from = new Date(nowMs - NUDGE.catchUpMin * MIN).toISOString();
  const to = new Date(nowMs - NUDGE.delayMin * MIN).toISOString();
  const { data: acts, error } = await admin
    .from("activities")
    .select("id, athlete_id, sport, start_time, duration_s, distance_m, created_at, source")
    .gte("created_at", from)
    .lte("created_at", to)
    .gte("duration_s", NUDGE.minSessionS)
    .neq("source", "garmin_export") // history imports
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) return { status: "error", reason: error.message };
  if (!acts?.length) return { status: "ok", due: 0, sent: 0, ate: 0, staff: 0 };

  const { data: done } = await admin.from("refuel_nudges").select("activity_id").in("activity_id", acts.map((a) => a.id));
  const claimed = new Set((done ?? []).map((d) => d.activity_id));
  const pending = acts.filter((a) => !claimed.has(a.id));
  let sent = 0;
  let ate = 0;
  let staff = 0;

  for (const athleteId of [...new Set(pending.map((a) => a.athlete_id))]) {
    const [{ data: profile }, { data: last }, { data: meals }] = await Promise.all([
      admin.from("profiles").select("full_name, units, is_test, notify_prefs").eq("id", athleteId).maybeSingle(),
      admin.from("refuel_nudges").select("created_at").eq("athlete_id", athleteId).order("created_at", { ascending: false }).limit(1),
      admin.from("meal_logs").select("eaten_at, protein_g").eq("athlete_id", athleteId).gte("eaten_at", new Date(nowMs - (NUDGE.maxSinceEndMin + NUDGE.earlyMin) * MIN).toISOString()),
    ]);
    if (!profile || profile.is_test) continue;
    const reminderOff = (profile.notify_prefs as Record<string, unknown> | null)?.fuel === false;
    const units = profile.units === "km" ? "km" : "mi";
    const firstName = (profile.full_name ?? "").trim().split(/\s+/)[0] || "An athlete";
    const mealList = (meals ?? []).map((m) => ({ eaten_at: m.eaten_at, protein_g: Number(m.protein_g) }));
    let lastMs = last?.[0] ? Date.parse(last[0].created_at) : null;
    for (const a of pending.filter((x) => x.athlete_id === athleteId)) {
      const act = a as NudgeActivity & { athlete_id: string };
      const decision = decideNudge(act, mealList, nowMs, lastMs);
      if (decision !== "send" && decision !== "ate") continue;
      // Claim first so a concurrent run can't send the same workout twice.
      const { data: won } = await admin
        .from("refuel_nudges")
        .upsert({ activity_id: a.id, athlete_id: athleteId, outcome: decision === "ate" ? "ate" : reminderOff ? "quiet" : "sent" }, { onConflict: "activity_id", ignoreDuplicates: true })
        .select("activity_id");
      if (!won?.length) continue;
      lastMs = nowMs;
      const remind = decision === "send" && !reminderOff;
      if (decision === "ate") ate++;
      else if (remind) {
        const msg = nudgeMessage(act, units);
        const { error: e } = await admin.rpc("notify_refuel", { p_athlete: athleteId, p_activity: a.id, p_title: msg.title, p_body: msg.body });
        if (e) console.warn("notify_refuel failed", e.message);
        else sent++;
      }
      const sm = staffMessage(act, firstName, units, mealList, nowMs, remind ? "sent" : "off");
      const { data: n, error: se } = await admin.rpc("notify_refuel_staff", { p_athlete: athleteId, p_activity: a.id, p_title: sm.title, p_body: sm.body });
      if (se) console.warn("notify_refuel_staff failed", se.message);
      else staff += Number(n ?? 0);
    }
  }
  return { status: "ok", due: pending.length, sent, ate, staff };
}
