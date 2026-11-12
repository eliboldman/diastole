import { NextResponse } from "next/server";

import { garminFetch } from "@/lib/garmin/client";
import { createAdminClient, getProfile } from "@/lib/supabase/server";

// ONE-OFF (2026-11-12, remove after use): read-only. Shows the workout Garmin stored for one of the
// signed-in coach's planned workouts, to check how yard-pool swim distances landed. GET ?id=<planned id>.
export async function GET(request: Request) {
  const me = await getProfile();
  if (!me || me.role !== "coach") return NextResponse.json({ error: "Coaches only." }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "id" }, { status: 400 });
  const admin = createAdminClient();
  const { data: w } = await admin.from("planned_workouts").select("athlete_id, external_id, pool_length, pool_unit, approved_at").eq("id", id).maybeSingle();
  if (!w) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { data: p } = await admin.from("profiles").select("coach_id").eq("id", w.athlete_id).maybeSingle();
  if (w.athlete_id !== me.id && p?.coach_id !== me.id) return NextResponse.json({ error: "not yours" }, { status: 403 });
  if (!w.external_id) return NextResponse.json({ saved: w, garmin: null });
  const res = await garminFetch(w.athlete_id, `/training-api/workout/v2/${w.external_id}`);
  const garmin = await res.json().catch(() => null);
  return NextResponse.json({ saved: w, status: res.status, garmin }, { headers: { "cache-control": "no-store" } });
}
