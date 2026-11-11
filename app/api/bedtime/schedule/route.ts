import { NextResponse } from "next/server";

import { getSchedule } from "@/lib/sleep/data";
import { createClient, getProfile } from "@/lib/supabase/server";

// The iPhone app asks for the next week of bedtime nudges (through its web view, signed in) and
// schedules them as local notifications. Empty when nudges are off.
export async function GET() {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "signed out" }, { status: 401 });
  const supabase = await createClient();
  const s = await getSchedule(supabase, me.id, me.timezone || "America/Chicago");
  return NextResponse.json(s, { headers: { "cache-control": "no-store" } });
}
