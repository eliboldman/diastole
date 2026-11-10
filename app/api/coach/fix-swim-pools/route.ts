import { NextResponse } from "next/server";

import { resendWorkoutToGarmin } from "@/lib/garmin/training";
import { createAdminClient, getProfile } from "@/lib/supabase/server";
import { inferPool, type Step } from "@/lib/workouts/garmin-format";

// ONE-OFF (2026-11-10, remove after use): swims saved without a pool but written in yards showed
// "91" for 100 yd on Garmin. For the signed-in coach's athletes (and the coach), this saves the
// 25 yd pool on those workouts and library items, and re-sends upcoming ones already on Garmin.
// GET = dry run (lists what it would do). GET ?apply=1 = do it.

export const maxDuration = 300;

export async function GET(request: Request) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (me.role !== "coach") return NextResponse.json({ error: "Coaches only." }, { status: 403 });
  const apply = new URL(request.url).searchParams.get("apply") === "1";
  const admin = createAdminClient();

  const { data: athletes } = await admin.from("profiles").select("id").eq("coach_id", me.id);
  const ids = [...new Set([me.id, ...(athletes ?? []).map((a) => a.id as string)])];
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  const { data: workouts, error } = await admin
    .from("planned_workouts")
    .select("id, athlete_id, title, scheduled_date, status, steps, external_id")
    .in("athlete_id", ids)
    .eq("sport", "swim")
    .is("pool_length", null)
    .is("deleted_at", null)
    .order("scheduled_date");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data: library } = await admin.from("workout_library").select("id, title, steps").eq("coach_id", me.id).eq("sport", "swim").is("pool_length", null);

  const broken = (workouts ?? []).filter((w) => inferPool(w.steps as Step[], null));
  const brokenLib = (library ?? []).filter((l) => inferPool(l.steps as Step[], null));
  const results: { id: string; title: string; date: string; status: string; action: string; result?: string }[] = [];

  for (const w of broken) {
    const resend = Boolean(w.external_id) && w.scheduled_date >= yesterday;
    const row = { id: w.id, title: w.title, date: w.scheduled_date, status: w.status, action: resend ? "save 25 yd pool + re-send to Garmin" : "save 25 yd pool" };
    if (apply) {
      const { error: e } = await admin.from("planned_workouts").update({ pool_length: 25, pool_unit: "YARD" }).eq("id", w.id);
      if (e) {
        results.push({ ...row, result: `failed to save: ${e.message}` });
        continue;
      }
      if (resend) {
        try {
          await resendWorkoutToGarmin(w.id);
          results.push({ ...row, result: "fixed on Garmin" });
        } catch (err) {
          results.push({ ...row, result: `saved, but Garmin re-send failed: ${err instanceof Error ? err.message : String(err)}` });
        }
        continue;
      }
      results.push({ ...row, result: "saved" });
    } else results.push(row);
  }

  const lib = brokenLib.map((l) => ({ id: l.id, title: l.title, action: "save 25 yd pool (library)" }));
  if (apply && brokenLib.length) await admin.from("workout_library").update({ pool_length: 25, pool_unit: "YARD" }).in("id", brokenLib.map((l) => l.id));

  return NextResponse.json(
    { mode: apply ? "applied" : "dry run (add ?apply=1 to fix)", workouts: results, library: lib },
    { headers: { "cache-control": "no-store" } },
  );
}
