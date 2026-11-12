import { NextResponse } from "next/server";

import { deviceFromRequest } from "@/lib/devices/auth";
import { buildToday } from "@/lib/devices/today";

// Today's plan, readiness and overnight numbers for a signed-in watch or TV (bearer token).
// The Apple Watch app also gets each workout in Workout-app form (?apple=1).

export async function GET(request: Request) {
  const device = await deviceFromRequest(request);
  if (!device) return NextResponse.json({ error: "signed out" }, { status: 401 });
  const apple = device.kind === "apple_watch" && new URL(request.url).searchParams.get("apple") === "1";
  return NextResponse.json(await buildToday(device.profile, undefined, { apple }), { headers: { "cache-control": "no-store" } });
}
