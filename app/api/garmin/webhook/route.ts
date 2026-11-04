import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { ingestGarminPayload } from "@/lib/garmin/ingest";
import { logWebhook, summarizePush } from "@/lib/garmin/webhook-log";
import { refreshReadiness } from "@/lib/readiness/run";

// One endpoint for every Garmin push type (dailies, sleeps, hrv, stressDetails, activities,
// deregistrations, userPermissionsChange). Garmin strips query strings when pushing, so the
// secret goes in the path. In Garmin's Endpoint Configuration, set each URL to:
//   https://<site>/api/garmin/webhook/<GARMIN_WEBHOOK_SECRET>
function keyMatches(given: string | null | undefined) {
  const expected = process.env.GARMIN_WEBHOOK_SECRET?.trim();
  if (!expected || !given || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export async function handleGarminPush(request: NextRequest, given: string | null | undefined) {
  const startedAt = Date.now();
  const host = request.headers.get("host");
  if (!keyMatches(given)) {
    console.warn("Garmin webhook rejected: bad key", {
      keyPresent: Boolean(given),
      keyLength: given?.length ?? 0,
      path: request.nextUrl.pathname.replace(/\/webhook\/.+$/, "/webhook/<key>"),
    });
    await logWebhook({ host, outcome: "bad_key", startedAt });
    return new NextResponse("Unauthorized", { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    console.warn("Garmin webhook: body was not JSON");
    await logWebhook({ host, outcome: "bad_json", startedAt });
    return new NextResponse("Bad JSON", { status: 400 });
  }

  const { counts, garminUsers } = summarizePush(body);
  console.info("Garmin webhook received", counts);

  let touched: Set<string>;
  try {
    touched = await ingestGarminPayload(body as Parameters<typeof ingestGarminPayload>[0]);
  } catch (e) {
    console.error("Garmin webhook ingest failed", e);
    await logWebhook({ host, outcome: "ingest_error", counts, garminUsers, error: e instanceof Error ? e.message : String(e), startedAt });
    // Non-200 makes Garmin retry later.
    return new NextResponse("Ingest failed", { status: 500 });
  }

  await logWebhook({ host, outcome: "ok", counts, garminUsers, athletesTouched: touched.size, startedAt });

  // Data is stored; a readiness failure shouldn't make Garmin resend it.
  for (const athleteId of touched) {
    await refreshReadiness(athleteId).catch((e) => console.error("Readiness refresh failed", athleteId, e));
  }
  return new NextResponse(null, { status: 200 });
}

// Legacy form: ?key=... (kept for manual testing; Garmin drops the query string).
export async function POST(request: NextRequest) {
  return handleGarminPush(request, request.nextUrl.searchParams.get("key"));
}
