import { NextResponse, type NextRequest } from "next/server";

import { parseFit } from "@/lib/activity/fit";
import { linkPlannedWorkout, saveFitDetail } from "@/lib/activity/store";
import { createAdminClient, getProfile } from "@/lib/supabase/server";

// Workout files from a Garmin account export. The browser finds the activity files inside the
// export and sends them here one at a time; the server parses each one (trimming the route the same
// way as the live sync), attaches it to the matching activity by start time, and discards the file.

const MAX_BYTES = 4 * 1024 * 1024; // Vercel's request limit is 4.5 MB; real activity files are far smaller
const MATCH_WINDOW_MS = 5_000;

async function authorize(athleteId: string) {
  const me = await getProfile();
  if (!me) return null;
  if (me.id === athleteId) return me;
  if (me.role !== "coach") return null;
  const { data } = await createAdminClient().from("profiles").select("coach_id").eq("id", athleteId).maybeSingle();
  return data?.coach_id === me.id ? me : null;
}

/** Start times (ISO) of this athlete's activities that don't have workout details yet. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ athleteId: string }> }) {
  const { athleteId } = await params;
  if (!(await authorize(athleteId))) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const admin = createAdminClient();
  const starts: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from("activities")
      .select("start_time, activity_details(activity_id)")
      .eq("athlete_id", athleteId)
      .order("start_time")
      .range(from, from + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const a of data ?? []) {
      const detail = a.activity_details as unknown as { activity_id: string } | { activity_id: string }[] | null;
      if (!detail || (Array.isArray(detail) && detail.length === 0)) starts.push(new Date(a.start_time).toISOString());
    }
    if (!data || data.length < 1000) break;
  }
  return NextResponse.json({ starts });
}

/** One FIT file in the body. Answers { status: "saved" | "no_match" | "unreadable" }. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ athleteId: string }> }) {
  const { athleteId } = await params;
  if (!(await authorize(athleteId))) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) return NextResponse.json({ error: "File too large" }, { status: 413 });
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_BYTES) return NextResponse.json({ error: "Empty or too large" }, { status: 413 });

  let fit;
  try {
    fit = parseFit(bytes);
  } catch {
    return NextResponse.json({ status: "unreadable" });
  }

  const start = new Date(fit.summary.start_time).getTime();
  const admin = createAdminClient();
  const { data: matches } = await admin
    .from("activities")
    .select("*")
    .eq("athlete_id", athleteId)
    .gte("start_time", new Date(start - MATCH_WINDOW_MS).toISOString())
    .lte("start_time", new Date(start + MATCH_WINDOW_MS).toISOString())
    .limit(2);
  // Prefer the live-sync row when both it and an export row exist for the same workout.
  const activity = (matches ?? []).sort((a, b) => (a.source === "garmin" ? -1 : b.source === "garmin" ? 1 : 0))[0];
  if (!activity) return NextResponse.json({ status: "no_match" });

  // The live sync's own file wins over the export copy.
  const { data: existing } = await admin.from("activity_details").select("source").eq("activity_id", activity.id).maybeSingle();
  if (existing?.source === "garmin_fit") return NextResponse.json({ status: "saved", id: activity.id });

  try {
    await saveFitDetail(admin, activity, fit, "garmin_export_fit");
    await linkPlannedWorkout(admin, activity.id);
  } catch (e) {
    console.error("Workout file import failed", e);
    return NextResponse.json({ error: "Couldn't save this workout" }, { status: 500 });
  }
  return NextResponse.json({ status: "saved", id: activity.id });
}
