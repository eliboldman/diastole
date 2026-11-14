import { beat } from "@/lib/system/heartbeat";
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { processAllBatons } from "@/lib/baton/run";
import { lightCampfires } from "@/lib/campfire/data";
import { draftWeeklyEpisodes } from "@/lib/stories/draft";
import { runEvening } from "@/lib/evening";
import { deliverDuePlanWorkouts, notifyTestZones } from "@/lib/autocoach/server";
import { runWeeklyReviews } from "@/lib/autocoach/review";
import { createAdminClient } from "@/lib/supabase/server";

// Vercel Cron calls this each evening (see vercel.json): "pack for tomorrow" and worn-shoe nudges.
export const maxDuration = 300;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return Boolean(secret) && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return new NextResponse("Unauthorized", { status: 401 });
  const result = await runEvening().catch((e) => ({ status: "error", reason: String(e).slice(0, 200) }));
  // Pod batons get a second look each day, so passes and nudges keep up across time zones.
  const batons = await processAllBatons(createAdminClient()).catch((e) => ({ status: "error", reason: String(e).slice(0, 200) }));
  // Sunday evenings: light each pod's campfire.
  const campfires = await lightCampfires(createAdminClient()).catch((e) => ({ status: "error", reason: String(e).slice(0, 200) }));
  // Monday evenings: draft last week's pod episodes for the coach to review (never posted automatically).
  const stories = await draftWeeklyEpisodes(createAdminClient()).catch((e) => ({ status: "error", reason: String(e).slice(0, 200) }));
  // Self-coaching (plan athletes): next 7 days of approved plan sessions to Garmin, new test zones, Sunday review.
  const admin = createAdminClient();
  const autocoach = {
    deliver: await deliverDuePlanWorkouts(admin).catch((e) => ({ status: "error", reason: String(e).slice(0, 200) })),
    tests: await notifyTestZones(admin).catch((e) => ({ status: "error", reason: String(e).slice(0, 200) })),
    review: await runWeeklyReviews(admin).catch((e) => ({ status: "error", reason: String(e).slice(0, 200) })),
  };
  console.info("Evening run", result, batons, campfires, stories, autocoach);
  await beat("evening", true, { result, batons, campfires, stories, autocoach });
  return NextResponse.json({ ok: true, result, batons, campfires, stories, autocoach });
}
