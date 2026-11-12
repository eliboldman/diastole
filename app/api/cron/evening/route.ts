import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { processAllBatons } from "@/lib/baton/run";
import { lightCampfires } from "@/lib/campfire/data";
import { draftWeeklyEpisodes } from "@/lib/stories/draft";
import { runEvening } from "@/lib/evening";
import { createAdminClient } from "@/lib/supabase/server";

// Vercel Cron calls this each evening (see vercel.json): "pack for tomorrow" and worn-shoe nudges.
export const maxDuration = 120;

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
  console.info("Evening run", result, batons, campfires, stories);
  return NextResponse.json({ ok: true, result, batons, campfires, stories });
}
