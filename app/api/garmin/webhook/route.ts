import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { ingestGarminPayload } from "@/lib/garmin/ingest";

// One endpoint for every Garmin push type (dailies, sleeps, hrv, stressDetails, activities,
// deregistrations, userPermissionsChange). In Garmin's Endpoint Configuration, set each URL to:
//   https://<site>/api/garmin/webhook?key=<GARMIN_WEBHOOK_SECRET>
function authorized(request: NextRequest) {
  const expected = process.env.GARMIN_WEBHOOK_SECRET?.trim();
  const given = request.nextUrl.searchParams.get("key");
  if (!expected || !given || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    const given = request.nextUrl.searchParams.get("key");
    console.warn("Garmin webhook rejected: bad key", {
      keyPresent: Boolean(given),
      keyLength: given?.length ?? 0,
      queryKeys: [...request.nextUrl.searchParams.keys()],
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
