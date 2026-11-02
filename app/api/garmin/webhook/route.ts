import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { ingestGarminPayload } from "@/lib/garmin/ingest";

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
  if (!keyMatches(given)) {
    console.warn("Garmin webhook rejected: bad key", {
      keyPresent: Boolean(given),
      keyLength: given?.length ?? 0,
      path: request.nextUrl.pathname.replace(/\/webhook\/.+$/, "/webhook/<key>"),
    });
    return new NextResponse("Unauthorized", { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    console.warn("Garmin webhook: body was not JSON");
    return new NextResponse("Bad JSON", { status: 400 });
  }

  const counts = Object.fromEntries(
    Object.entries(body as Record<string, unknown>).map(([k, v]) => [k, Array.isArray(v) ? v.length : typeof v]),
  );
  console.info("Garmin webhook received", counts);

  try {
    await ingestGarminPayload(body as Parameters<typeof ingestGarminPayload>[0]);
  } catch (e) {
    console.error("Garmin webhook ingest failed", e);
    // Non-200 makes Garmin retry later.
    return new NextResponse("Ingest failed", { status: 500 });
  }
  return new NextResponse(null, { status: 200 });
}

// Legacy form: ?key=... (kept for manual testing; Garmin drops the query string).
export async function POST(request: NextRequest) {
  return handleGarminPush(request, request.nextUrl.searchParams.get("key"));
}
