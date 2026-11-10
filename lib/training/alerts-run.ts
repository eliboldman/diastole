import "server-only";

import type { createAdminClient } from "@/lib/supabase/server";

import { isKeySession, sessionAlert } from "./alerts";
import { addDays, mondayOf } from "./week";
import { getWeek } from "./week-data";
import { getZoneSuggestions } from "./zone-suggest-data";
import { ZONE_LABEL, zoneText } from "./zone-suggest";

type Admin = ReturnType<typeof createAdminClient>;
const NEW_EFFORT_MS = 2 * 86_400_000; // zone suggestions from efforts in the last two days

/** Morning: tell the coach about yesterday's missed key sessions and new zone suggestions. */
export async function runCoachAlerts(admin: Admin, coach: { id: string; units?: string | null }) {
  const { data: roster } = await admin.from("profiles").select("id, full_name, timezone").eq("coach_id", coach.id).eq("is_test", false);
  let missed = 0;
  let zones = 0;
  const units = coach.units === "km" ? "km" : "mi";
  for (const a of roster ?? []) {
    const tz = a.timezone || "America/Chicago";
    const first = ((a.full_name as string | null) ?? "").split(" ")[0] || "An athlete";
    const who = a.id === coach.id ? "You" : first;
    const yesterday = addDays(new Date().toLocaleDateString("en-CA", { timeZone: tz }), -1);
    const week = await getWeek(admin, a.id, tz, mondayOf(yesterday));
    for (const s of week.sessions.filter((x) => x.plan.date === yesterday)) {
      if (!isKeySession(s.plan.title, s.plan.steps, s.plan.sport)) continue;
      const alert = sessionAlert(s, week.compliance[s.plan.id] ?? null);
      if (!alert) continue;
      const href = s.activity ? `/activity/${s.activity.id}` : `/athlete/${a.id}#week`;
      await admin.rpc("server_notify", {
        p_user: coach.id,
        p_kind: "session_missed",
        p_title: `${who} · ${s.plan.title}`,
        p_body: `${alert.text} (yesterday's key session).`,
        p_href: href,
        p_key: `miss:${s.plan.id}`,
      });
      missed++;
    }
  }
  const suggestions = await getZoneSuggestions(admin, (roster ?? []).map((r) => r.id as string));
  for (const [athleteId, list] of suggestions) {
    const a = (roster ?? []).find((r) => r.id === athleteId);
    const who = athleteId === coach.id ? "Your" : `${((a?.full_name as string | null) ?? "").split(" ")[0] || "An athlete"}'s`;
    for (const s of list) {
      if (Date.now() - Date.parse(s.date) > NEW_EFFORT_MS) continue;
      await admin.rpc("server_notify", {
        p_user: coach.id,
        p_kind: "zone_suggestion",
        p_title: `${who} ${ZONE_LABEL[s.key]} looks out of date`,
        p_body: `${zoneText(s.key, s.current, units)} → ${zoneText(s.key, s.suggested, units)}. ${s.why}`,
        p_href: `/athlete/${athleteId}#zones`,
        p_key: `zone:${athleteId}:${s.key}:${s.suggested}`,
      });
      zones++;
    }
  }
  return { missed, zones };
}
