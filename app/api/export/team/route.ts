import { NextResponse, type NextRequest } from "next/server";

import { csvResponse, toCsv } from "@/lib/export/csv";
import { createClient, getProfile } from "@/lib/supabase/server";

// The coach's team training as one CSV: every athlete's activities in the last N days (default 90).
export async function GET(request: NextRequest) {
  const me = await getProfile();
  if (!me || me.role !== "coach") return NextResponse.json({ error: "Coaches only." }, { status: 403 });
  const days = Math.min(730, Math.max(7, Number(request.nextUrl.searchParams.get("days")) || 90));
  const supabase = await createClient();
  const { data: roster } = await supabase.from("profiles").select("id, full_name, email").eq("coach_id", me.id).eq("is_test", false).eq("is_demo", false);
  const names = new Map((roster ?? []).map((p) => [p.id, p.full_name || p.email || "Athlete"]));
  if (!names.size) return csvResponse(toCsv([], ["athlete"]), "diastole-team.csv");
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("activities")
    .select("athlete_id, start_time, sport, duration_s, distance_m, avg_hr, max_hr, training_load")
    .in("athlete_id", [...names.keys()])
    .gte("start_time", since)
    .order("start_time", { ascending: true })
    .limit(50000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []).map((a) => ({
    athlete: names.get(a.athlete_id),
    date: a.start_time.slice(0, 10),
    start_time: a.start_time,
    sport: a.sport,
    duration_min: a.duration_s ? Math.round(a.duration_s / 6) / 10 : null,
    distance_km: a.distance_m ? Math.round(Number(a.distance_m) / 10) / 100 : null,
    avg_hr: a.avg_hr,
    max_hr: a.max_hr,
    training_load: a.training_load,
  }));
  return csvResponse(toCsv(rows, ["athlete", "date", "start_time", "sport", "duration_min", "distance_km", "avg_hr", "max_hr", "training_load"]), `diastole-team-${days}d.csv`);
}
