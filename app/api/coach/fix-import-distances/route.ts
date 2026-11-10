import { NextResponse } from "next/server";

import { resendWorkoutToGarmin } from "@/lib/garmin/training";
import { createAdminClient, getProfile } from "@/lib/supabase/server";
import type { Step } from "@/lib/workouts/garmin-format";
import { repairSteps, type Fix } from "@/lib/workouts/repair-distance";

// ONE-OFF (2026-11-10, remove after use): run/ride distances from a Garmin Connect import were
// multiplied by the display unit (a 6 mi run became ~9,650 mi). For the signed-in coach's athletes
// and library: GET = preview, GET ?apply=1 = fix (and re-send any already on Garmin).

export const maxDuration = 300;
const mi = (m: number) => `${(m / 1609.344).toLocaleString("en-US", { maximumFractionDigits: 2 })} mi`;
const describeFix = (f: Fix) => `${mi(f.from)} → ${mi(f.to)}${f.sure ? "" : " (unit guessed)"}`;

export async function GET(request: Request) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (me.role !== "coach") return NextResponse.json({ error: "Coaches only." }, { status: 403 });
  const apply = new URL(request.url).searchParams.get("apply") === "1";
  const admin = createAdminClient();

  const { data: people } = await admin.from("profiles").select("id, full_name").eq("coach_id", me.id);
  const names = new Map((people ?? []).map((p) => [p.id as string, (p.full_name as string | null) ?? "Athlete"]));
  names.set(me.id, names.get(me.id) ?? "You");
  const ids = [...names.keys()];

  const [{ data: workouts }, { data: library }] = await Promise.all([
    admin.from("planned_workouts").select("id, athlete_id, title, sport, scheduled_date, status, steps, brick, external_id").in("athlete_id", ids).in("sport", ["run", "bike"]).is("deleted_at", null),
    admin.from("workout_library").select("id, title, sport, steps, brick").eq("coach_id", me.id).in("sport", ["run", "bike"]),
  ]);

  const out: { kind: string; who?: string; title: string; date?: string; status?: string; fixes: string[]; result?: string }[] = [];

  for (const w of workouts ?? []) {
    const main = repairSteps((w.steps ?? []) as Step[], w.sport);
    const run = (w.brick as { steps?: Step[] } | null)?.steps ? repairSteps((w.brick as { steps: Step[] }).steps, "run") : null;
    const fixes = [...main.fixes, ...(run?.fixes ?? [])];
    if (!fixes.length) continue;
    const row = { kind: "workout", who: names.get(w.athlete_id), title: w.title, date: w.scheduled_date, status: w.status, fixes: fixes.map(describeFix) };
    if (!apply) {
      out.push(row);
      continue;
    }
    const { error } = await admin
      .from("planned_workouts")
      .update({ steps: main.steps, ...(run ? { brick: { sport: "run", steps: run.steps } } : {}) })
      .eq("id", w.id);
    if (error) {
      out.push({ ...row, result: `failed: ${error.message}` });
      continue;
    }
    if (w.external_id && !String(w.external_id).startsWith("apple:")) {
      try {
        await resendWorkoutToGarmin(w.id);
        out.push({ ...row, result: "fixed and re-sent to Garmin" });
      } catch (e) {
        out.push({ ...row, result: `fixed, but Garmin re-send failed: ${e instanceof Error ? e.message : String(e)}` });
      }
    } else out.push({ ...row, result: "fixed" });
  }

  for (const l of library ?? []) {
    const main = repairSteps((l.steps ?? []) as Step[], l.sport);
    const run = (l.brick as { steps?: Step[] } | null)?.steps ? repairSteps((l.brick as { steps: Step[] }).steps, "run") : null;
    const fixes = [...main.fixes, ...(run?.fixes ?? [])];
    if (!fixes.length) continue;
    const row = { kind: "library", title: l.title, fixes: fixes.map(describeFix) };
    if (!apply) {
      out.push(row);
      continue;
    }
    const { error } = await admin.from("workout_library").update({ steps: main.steps, ...(run ? { brick: { sport: "run", steps: run.steps } } : {}) }).eq("id", l.id);
    out.push({ ...row, result: error ? `failed: ${error.message}` : "fixed" });
  }

  return NextResponse.json(
    { mode: apply ? "applied" : "preview (add ?apply=1 to fix)", count: out.length, items: out },
    { headers: { "cache-control": "no-store" } },
  );
}
