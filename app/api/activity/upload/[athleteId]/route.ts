import { createHash } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { parseFit, type FitActivity } from "@/lib/activity/fit";
import { linkPlannedWorkout, saveFitDetail, sportName, summaryColumns } from "@/lib/activity/store";
import { createAdminClient, getProfile } from "@/lib/supabase/server";

// One workout file (FIT) uploaded by hand: for activities Garmin's API won't share with Diastole,
// such as rides Rouvy, Zwift or TrainerRoad pushed into Garmin Connect. Creates the activity unless
// one already exists at the same start time, in which case the file only adds missing details.
// The file itself is parsed and discarded, like the live sync.

const MAX_BYTES = 4 * 1024 * 1024; // Vercel's request limit is 4.5 MB
const SAME_WORKOUT_MS = 60_000;

async function authorize(athleteId: string) {
  const me = await getProfile();
  if (!me) return null;
  if (me.id === athleteId) return me;
  if (me.role !== "coach") return null;
  const { data } = await createAdminClient().from("profiles").select("coach_id").eq("id", athleteId).maybeSingle();
  return data?.coach_id === me.id ? me : null;
}

/** Garmin's names for virtual workouts, so uploads read the same as live-synced ones. */
function uploadSport(fit: FitActivity) {
  const sport = sportName(fit);
  if (!sport?.includes("virtual")) return sport;
  if (/cycl|bik/.test(sport)) return "virtual_ride";
  if (/run/.test(sport)) return "virtual_run";
  return sport;
}

/** Answers { status: "created" | "details_added" | "already_there" | "unreadable", id? }. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ athleteId: string }> }) {
  const { athleteId } = await params;
  if (!(await authorize(athleteId))) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) return NextResponse.json({ error: "File too large" }, { status: 413 });
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_BYTES) return NextResponse.json({ error: "Empty or too large" }, { status: 413 });

  let fit: FitActivity;
  try {
    fit = parseFit(bytes);
  } catch {
    return NextResponse.json({ status: "unreadable" });
  }
  const startMs = new Date(fit.summary.start_time).getTime();
  if (!Number.isFinite(startMs)) return NextResponse.json({ status: "unreadable" });

  const admin = createAdminClient();
  try {
    // Same workout already here (live sync, history import or an earlier upload)? Only add details.
    const { data: matches } = await admin
      .from("activities")
      .select("*, activity_details(activity_id)")
      .eq("athlete_id", athleteId)
      .gte("start_time", new Date(startMs - SAME_WORKOUT_MS).toISOString())
      .lte("start_time", new Date(startMs + SAME_WORKOUT_MS).toISOString())
      .limit(3);
    const existing = (matches ?? []).sort((a, b) => (a.source === "garmin" ? -1 : b.source === "garmin" ? 1 : 0))[0];
    if (existing) {
      const { activity_details: detail, ...activity } = existing;
      const hasDetail = Array.isArray(detail) ? detail.length > 0 : Boolean(detail);
      if (hasDetail) return NextResponse.json({ status: "already_there", id: activity.id });
      await saveFitDetail(admin, activity, fit, "upload_fit");
      await linkPlannedWorkout(admin, activity.id);
      return NextResponse.json({ status: "details_added", id: activity.id });
    }

    const sport = uploadSport(fit);
    const { data: created, error } = await admin
      .from("activities")
      .insert({
        athlete_id: athleteId,
        source: "upload",
        external_id: `fit:${createHash("sha256").update(bytes).digest("hex").slice(0, 40)}`,
        sport,
        start_time: fit.summary.start_time,
        ...summaryColumns(fit),
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await saveFitDetail(admin, created, fit, "upload_fit");
    await linkPlannedWorkout(admin, created.id);
    return NextResponse.json({ status: "created", id: created.id });
  } catch (e) {
    console.error("Activity upload failed", e);
    return NextResponse.json({ error: "Couldn't save this workout" }, { status: 500 });
  }
}
