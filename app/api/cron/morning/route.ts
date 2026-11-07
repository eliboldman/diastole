import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { draftMorningBriefs } from "@/lib/ai/briefs";
import { runCoachAssistant } from "@/lib/ai/coach";
import { runFormInsights } from "@/lib/ai/form-insights";
import { buildDigest, digestLine, lastWeekStart } from "@/lib/digest";
import { runSafetyNet } from "@/lib/fuel/safety-run";
import { createAdminClient } from "@/lib/supabase/server";

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
  const { data: coaches } = await admin.from("profiles").select("id, timezone").eq("role", "coach");
  const results: Record<string, unknown> = {};
  for (const c of coaches ?? []) {
    results[c.id] = await runCoachAssistant(c.id, "cron").catch((e) => ({ status: "error", reason: String(e).slice(0, 200) }));
    // Morning briefs: drafted after readiness is fresh; the coach sends or skips each one.
    results[`${c.id}:briefs`] = await draftMorningBriefs(c.id).catch((e) => ({ status: "error", reason: String(e).slice(0, 200) }));
    // Form insights only call Claude when a new pattern shows up across several runs.
    results[`${c.id}:form`] = await runFormInsights(c.id, "cron").catch((e) => ({ status: "error", reason: String(e).slice(0, 200) }));
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
