import { NextResponse } from "next/server";

import { deviceFromRequest } from "@/lib/devices/auth";
import { buildRides } from "@/lib/devices/today";

// Bike workouts the Apple TV app can ride (bearer token). Optional ?id=<planned workout>.

const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(request: Request) {
  const device = await deviceFromRequest(request);
  if (!device) return NextResponse.json({ error: "signed out" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id") ?? undefined;
  if (id && !UUID.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  return NextResponse.json(await buildRides(device.profile, { id }), { headers: { "cache-control": "no-store" } });
}
