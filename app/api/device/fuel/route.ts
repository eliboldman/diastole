import { NextResponse } from "next/server";

import { deviceFromRequest } from "@/lib/devices/auth";
import { buildFuel } from "@/lib/devices/today";

// Today's fueling reminders for the Garmin data field (bearer token).

export async function GET(request: Request) {
  const device = await deviceFromRequest(request);
  if (!device) return NextResponse.json({ error: "signed out" }, { status: 401 });
  return NextResponse.json(await buildFuel(device.profile), { headers: { "cache-control": "no-store" } });
}
