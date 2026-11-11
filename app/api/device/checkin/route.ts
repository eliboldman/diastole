import { NextResponse } from "next/server";

import { deviceFromRequest } from "@/lib/devices/auth";
import { createAdminClient } from "@/lib/supabase/server";

// The post-workout check-in from the watch: { a: activity id, feel 1–5, rpe 1–10, fuel? all|some|none }.
// Fills the same check-in the app shows; a sore spot or note can still be added in the app.

const UUID = /^[0-9a-f-]{36}$/i;

export async function POST(request: Request) {
  const device = await deviceFromRequest(request);
  if (!device) return NextResponse.json({ error: "signed out" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { a?: unknown; feel?: unknown; rpe?: unknown; fuel?: unknown } | null;
  const a = typeof body?.a === "string" && UUID.test(body.a) ? body.a : null;
  const feel = Number(body?.feel);
  const rpe = Number(body?.rpe);
  const fuel = body?.fuel === "all" || body?.fuel === "some" || body?.fuel === "none" ? body.fuel : null;
  if (!a || !Number.isInteger(feel) || feel < 1 || feel > 5 || !Number.isInteger(rpe) || rpe < 1 || rpe > 10) {
    return NextResponse.json({ error: "bad check-in" }, { status: 400 });
  }
  const admin = createAdminClient();
  const { data: act } = await admin.from("activities").select("id").eq("id", a).eq("athlete_id", device.profile.id).maybeSingle();
  if (!act) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { error } = await admin
    .from("workout_checkins")
    .upsert({ activity_id: a, athlete_id: device.profile.id, feel, rpe, ...(fuel ? { fuel } : {}), updated_at: new Date().toISOString() }, { onConflict: "activity_id" });
  if (error) return NextResponse.json({ error: "couldn't save" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
