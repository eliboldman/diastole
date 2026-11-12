import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { runFormInsights } from "@/lib/ai/form-insights";
import { runCoachAlerts } from "@/lib/training/alerts-run";
import { runBedtimeRecaps } from "@/lib/sleep/recap-run";
import { buildDigest, digestLine, lastWeekStart } from "@/lib/digest";
import { runSafetyNet } from "@/lib/fuel/safety-run";
import { pullRides, syncAthlete } from "@/lib/intervals/sync";
import { runMonthlyRecaps } from "@/lib/recap-job";
import { createAdminClient } from "@/lib/supabase/server";
import { settleAllGrit } from "@/lib/grit/settle";
import { runMonthlyBosses } from "@/lib/bosses/data";

// Vercel Cron calls this once each morning (see vercel.json) with `Authorization: Bearer <CRON_SECRET>`.
export const maxDuration = 300;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return Boolean(secret) && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return new NextResponse("Unauthorized", { status: 401 });

  const admin = createAdminClient();
  const { data: coaches } = await admin.from("profiles").select("id, timezone, units").eq("role", "coach");
  const results: Record<string, unknown> = {};
  for (const c of coaches ?? []) {
    // The coaching assistant and morning briefs run when the coach presses "Review" on Today
    // (athletes wake and sync at different times), not here.
    // Form insights only call Claude when a new pattern shows up across several runs.
    results[`${c.id}:form`] = await runFormInsights(c.id, "cron").catch((e) => ({ status: "error", reason: String(e).slice(0, 200) }));
    // Yesterday's missed key sessions and new zone suggestions: rules only.
    results[`${c.id}:alerts`] = await runCoachAlerts(admin, c).catch((e) => ({ status: "error", reason: String(e).slice(0, 200) }));
    // Private fueling safety net: rules only, coach-only notes.
    results[`${c.id}:safety`] = await runSafetyNet(c.id).catch((e) => ({ status: "error", reason: String(e).slice(0, 200) }));
    // Mondays (coach's time): the weekly digest for last week.
    const tz = c.timezone || "America/Chicago";
    if (new Date().toLocaleDateString("en-US", { weekday: "short", timeZone: tz }) === "Mon") {
      results[`${c.id}:digest`] = await (async () => {
        const week = lastWeekStart(tz);
        const d = await buildDigest(admin, c.id, week);
        if (!d.athletes.length) return { status: "skipped" };
        await admin.rpc("server_notify", { p_user: c.id, p_kind: "weekly_digest", p_title: "Your weekly digest", p_body: digestLine(d), p_href: `/digest?week=${week}`, p_key: `digest:${week}` });
        return { status: "sent" };
      })().catch((e) => ({ status: "error", reason: String(e).slice(0, 200) }));
    }
  }
  // intervals.icu: re-send the coming weeks (catches anything a missed ping skipped) and bring in rides.
  const { data: icu } = await admin.from("intervals_connections").select("athlete_id");
  for (const c of icu ?? []) {
    const s = await syncAthlete(c.athlete_id, { force: true }, admin).catch((e) => ({ status: "error", error: String(e).slice(0, 200) }));
    const p = await pullRides(c.athlete_id, admin).catch((e) => ({ status: "error", error: String(e).slice(0, 200) }));
    results[`${c.athlete_id}:intervals`] = { sync: s.status, pull: p.status };
  }
  // Monday mornings: last week's bedtime consistency for athletes who set up sleep times.
  results.bedtime = await runBedtimeRecaps(admin).catch((e) => ({ status: "error", reason: String(e).slice(0, 200) }));
  // Pod challenges that ended yesterday: final standings to everyone who joined (rules only).
  const { data: wrapped, error: wrapError } = await admin.rpc("finish_pod_challenges");
  results.challenges = wrapError ? { status: "error", reason: wrapError.message.slice(0, 200) } : { sent: wrapped };
  // Bosses: on the 1st, last month's wander off and new suggestions go to coaches (rules only).
  results.bosses = await runMonthlyBosses(admin).catch((e) => ({ status: "error", reason: String(e).slice(0, 200) }));
  // Grit: pay out yesterday's sessions and check-ins, and pod team goals that were reached (rules only).
  results.grit = await settleAllGrit(admin).catch((e) => ({ status: "error", reason: String(e).slice(0, 200) }));
  // The 1st of the month: last month's recap for athletes, a team line for coaches.
  results.recaps = await runMonthlyRecaps(admin).catch((e) => ({ status: "error", reason: String(e).slice(0, 200) }));
  // Notifications: read ones go after 90 days, everything after a year.
  const day = 86_400_000;
  // Read notifications clear themselves after a week; cleared ones are deleted after 30 days.
  await admin.from("notifications").update({ dismissed_at: new Date().toISOString() }).is("dismissed_at", null).lt("read_at", new Date(Date.now() - 7 * day).toISOString());
  await admin.from("notifications").delete().lt("dismissed_at", new Date(Date.now() - 30 * day).toISOString());
  await admin.from("notifications").delete().not("read_at", "is", null).lt("created_at", new Date(Date.now() - 90 * day).toISOString());
  await admin.from("notifications").delete().lt("created_at", new Date(Date.now() - 365 * day).toISOString());
  console.info("Morning coach assistant", results);
  return NextResponse.json({ ok: true, results });
}
