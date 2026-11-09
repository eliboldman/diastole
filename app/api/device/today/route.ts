import { NextResponse } from "next/server";

import { deviceFromRequest } from "@/lib/devices/auth";
import { buildToday } from "@/lib/devices/today";

// Today's plan, readiness and overnight numbers for a signed-in watch or TV (bearer token).

export async function GET(request: Request) {
  const device = await deviceFromRequest(request);
  if (!device) return NextResponse.json({ error: "signed out" }, { status: 401 });
  return NextResponse.json(await buildToday(device.profile), { headers: { "cache-control": "no-store" } });
}
