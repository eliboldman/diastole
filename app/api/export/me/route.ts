import { NextResponse, type NextRequest } from "next/server";

import { csvResponse, toCsv } from "@/lib/export/csv";
import { createClient, getProfile } from "@/lib/supabase/server";

// An athlete's own data as CSV: activities, wellness (sleep/HRV/resting HR), meals, check-ins.
const KINDS = {
  activities: { table: "activities", order: "start_time", cols: ["start_time", "sport", "duration_s", "distance_m", "avg_hr", "max_hr", "training_load", "source"] },
  wellness: { table: "daily_wellness", order: "date", cols: ["date", "source", "hrv_ms", "resting_hr", "sleep_seconds", "sleep_score", "stress_avg", "body_battery_high", "body_battery_low"] },
  meals: { table: "meal_logs", order: "eaten_at", cols: ["local_date", "eaten_at", "label", "carbs_g", "protein_g", "fat_g", "kcal", "source", "note"] },
  checkins: { table: "workout_checkins", order: "created_at", cols: ["created_at", "activity_id", "feel", "rpe", "pain", "note"] },
  workouts: { table: "planned_workouts", order: "scheduled_date", cols: ["scheduled_date", "sport", "title", "status", "description"] },
} as const;

export async function GET(request: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const kind = request.nextUrl.searchParams.get("kind") as keyof typeof KINDS | null;
  const k = kind && KINDS[kind];
  if (!k) return NextResponse.json({ error: "Unknown export." }, { status: 400 });
  const supabase = await createClient();
  let q = supabase.from(k.table).select(k.cols.join(", ")).eq("athlete_id", me.id).order(k.order, { ascending: true }).limit(20000);
  if (k.table === "planned_workouts") q = q.is("deleted_at", null);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return csvResponse(toCsv((data ?? []) as unknown as Record<string, unknown>[], [...k.cols]), `diastole-${kind}.csv`);
}
