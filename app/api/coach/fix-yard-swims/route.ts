import { NextResponse } from "next/server";

import { resendWorkoutToGarmin } from "@/lib/garmin/training";
import { createAdminClient, getProfile } from "@/lib/supabase/server";
import { inferPool, type Pool, type Step } from "@/lib/workouts/garmin-format";

// ONE-OFF (2026-11-12, remove after use): yard-pool swims went to Garmin with distances in metres,
// which Garmin read as yards (300 yd showed "274"). Re-sends the signed-in coach's (and their
// athletes') upcoming yard swims already on Garmin. GET = dry run. GET ?apply=1 = re-send.
export const maxDuration = 300;

export async function GET(request: Request) {
  const me = await getProfile();
  if (!me || me.role !== "coach") return NextResponse.json({ error: "Coaches only." }, { status: 403 });
  const apply = new URL(request.url).searchParams.get("apply") === "1";
  const admin = createAdminClient();
  const { data: athletes } = await admin.from("profiles").select("id").eq("coach_id", me.id);
  const ids = [...new Set([me.id, ...(athletes ?? []).map((a) => a.id as string)])];
  const today = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const { data: rows, error } = await admin
    .from("planned_workouts")
    .select("id, athlete_id, title, scheduled_date, status, steps, pool_length, pool_unit, external_id")
    .in("athlete_id", ids)
    .eq("sport", "swim")
    .not("external_id", "is", null)
    .is("deleted_at", null)
    .gte("scheduled_date", today)
    .order("scheduled_date");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const yard = (rows ?? []).filter((w) => {
    const pool: Pool = w.pool_length && w.pool_unit ? { length: Number(w.pool_length), unit: w.pool_unit } : null;
    return inferPool(w.steps as Step[], pool)?.unit === "YARD";
  });
  const out: { title: string; date: string; status: string; result: string }[] = [];
  for (const w of yard) {
    const row = { title: w.title, date: w.scheduled_date, status: w.status };
    if (!apply) {
      out.push({ ...row, result: "would re-send" });
      continue;
    }
    try {
      await resendWorkoutToGarmin(w.id);
      out.push({ ...row, result: "re-sent" });
    } catch (e) {
      out.push({ ...row, result: `failed: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  return NextResponse.json({ mode: apply ? "applied" : "dry run", workouts: out }, { headers: { "cache-control": "no-store" } });
}
