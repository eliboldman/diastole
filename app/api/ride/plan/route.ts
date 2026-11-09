import { NextResponse } from "next/server";

import { buildRides } from "@/lib/devices/today";
import { getProfile } from "@/lib/supabase/server";

// Bike workouts for the iPhone/iPad ride screen (signed-in web session; the app calls this through
// its web view so the website keeps owning sign-in). Optional ?id=<planned workout>.

const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(request: Request) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "signed out" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id") ?? undefined;
  if (id && !UUID.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  return NextResponse.json(await buildRides(me, { id }), { headers: { "cache-control": "no-store" } });
}
