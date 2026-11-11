import "server-only";

import type { createAdminClient } from "@/lib/supabase/server";

import { recapText } from "./bedtime";
import { getConsistency, localDate } from "./data";

type Admin = ReturnType<typeof createAdminClient>;
const DAYMS = 86_400_000;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * Monday mornings (athlete's time): last week's bedtime consistency and HRV direction, for athletes
 * who set up sleep or training times. Rules only; skipped when there's too little data.
 */
export async function runBedtimeRecaps(admin: Admin) {
  const [{ data: sleepers }, { data: weeks }] = await Promise.all([
    admin.from("athlete_sleep").select("athlete_id"),
    admin.from("athlete_week").select("athlete_id, days"),
  ]);
  const ids = new Set<string>([
    ...(sleepers ?? []).map((s) => s.athlete_id as string),
    ...(weeks ?? []).filter((w) => Object.values((w.days ?? {}) as Record<string, { window?: unknown }>).some((d) => d?.window)).map((w) => w.athlete_id as string),
  ]);
  if (!ids.size) return { sent: 0 };
  const { data: people } = await admin.from("profiles").select("id, timezone, is_test").in("id", [...ids]);
  let sent = 0;
  for (const p of people ?? []) {
    if (p.is_test) continue;
    const tz = p.timezone || "America/Chicago";
    const today = localDate(tz);
    if (new Date(`${today}T12:00:00Z`).getUTCDay() !== 1) continue; // Mondays only
    const c = await getConsistency(admin, p.id, tz, 7);
    const { data: hrv } = await admin
      .from("daily_wellness")
      .select("date, hrv_ms")
      .eq("athlete_id", p.id)
      .gte("date", new Date(Date.parse(`${today}T12:00:00Z`) - 14 * DAYMS).toISOString().slice(0, 10))
      .not("hrv_ms", "is", null);
    const cut = new Date(Date.parse(`${today}T12:00:00Z`) - 7 * DAYMS).toISOString().slice(0, 10);
    const recent = avg((hrv ?? []).filter((h) => h.date > cut).map((h) => Number(h.hrv_ms)));
    const before = avg((hrv ?? []).filter((h) => h.date <= cut).map((h) => Number(h.hrv_ms)));
    const change = recent && before ? ((recent - before) / before) * 100 : null;
    const text = recapText(c, change);
    if (!text) continue;
    await admin.rpc("server_notify", { p_user: p.id, p_kind: "bedtime_recap", p_title: "Your week of sleep", p_body: text, p_href: "/me", p_key: `bed:${today}` });
    sent++;
  }
  return { sent };
}
