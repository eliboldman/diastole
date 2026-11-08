import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { mergeIfDuplicate } from "@/lib/activity/merge";
import { linkPlannedWorkout } from "@/lib/activity/store";
import { toAppleWorkout, type AppleWorkout } from "@/lib/apple/format";
import { refreshReadiness } from "@/lib/readiness/run";
import { createAdminClient, createClient, getProfile } from "@/lib/supabase/server";
import type { Pool, PoolUnit, Step } from "@/lib/workouts/garmin-format";

// The iPhone app posts Apple Health data here through the signed-in page (so it's tied to that
// person), and gets back the coach's upcoming workouts to put on the Apple Watch.
// Only the athlete's own 'apple' rows are written, under their own sign-in (row-level security).

const n = (max: number) => z.number().finite().min(0).max(max).nullish();
const Body = z.object({
  wellness: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        hrv_ms: n(400),
        resting_hr: n(220),
        sleep_seconds: n(86_400),
      }),
    )
    .max(120),
  activities: z
    .array(
      z.object({
        id: z.string().min(8).max(64),
        sport: z.string().max(40),
        name: z.string().max(200).nullish(),
        start: z.string().datetime({ offset: true }),
        duration_s: n(7 * 86_400),
        distance_m: n(1_000_000),
        avg_hr: n(250),
        max_hr: n(250),
        calories: n(20_000),
        elevation_gain_m: n(20_000),
        avg_power: n(2_500),
        device: z.string().max(100).nullish(),
      }),
    )
    .max(300),
  connect: z.boolean().optional(), // the athlete just tapped "Connect Apple Watch"
});

const WINDOW_DAYS = 14;
const MAX_SCHEDULED = 15; // WorkoutKit allows only so many scheduled workouts

export async function POST(request: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ ok: false }, { status: 401 });
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  }

  const supabase = await createClient();
  // One watch per athlete: readiness and workout delivery follow a single device.
  const { data: devices } = await supabase.from("device_connections").select("source").eq("athlete_id", me.id);
  if ((devices ?? []).some((d) => d.source !== "apple")) return NextResponse.json({ ok: false, error: "garmin" }, { status: 409 });
  // Not connected (or disconnected on the web): only a deliberate connect starts syncing again.
  if (!(devices ?? []).length && !body.connect) return NextResponse.json({ ok: false, error: "not connected" }, { status: 409 });

  const now = new Date().toISOString();
  const { error: connErr } = await supabase
    .from("device_connections")
    .upsert({ athlete_id: me.id, source: "apple", last_synced_at: now }, { onConflict: "athlete_id,source" });
  if (connErr) return NextResponse.json({ ok: false, error: connErr.message }, { status: 500 });

  // The privacy policy promises data from the day an athlete connects onward (plus that first
  // morning's night of sleep), so anything older the app sends is dropped here.
  const { data: conn } = await supabase.from("device_connections").select("connected_at").eq("athlete_id", me.id).eq("source", "apple").single();
  const first = new Date(conn?.connected_at ?? now);
  first.setUTCDate(first.getUTCDate() - 1);
  const cutoffDay = first.toLocaleDateString("en-CA", { timeZone: me.timezone });
  body.wellness = body.wellness.filter((w) => w.date >= cutoffDay);
  body.activities = body.activities.filter((a) => new Date(a.start).getTime() >= first.getTime());

  if (body.wellness.length) {
    const rows = body.wellness
      .filter((w) => w.hrv_ms != null || w.resting_hr != null || w.sleep_seconds != null)
      .map((w) => ({
        athlete_id: me.id,
        source: "apple" as const,
        date: w.date,
        hrv_ms: w.hrv_ms ?? null,
        resting_hr: w.resting_hr ?? null,
        sleep_seconds: w.sleep_seconds == null ? null : Math.round(w.sleep_seconds),
        updated_at: now,
      }));
    if (rows.length) {
      const { error } = await supabase.from("daily_wellness").upsert(rows, { onConflict: "athlete_id,date,source" });
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
  }

  let newActivities: string[] = [];
  if (body.activities.length) {
    const ids = body.activities.map((a) => a.id);
    const { data: known } = await supabase.from("activities").select("external_id").eq("source", "apple").in("external_id", ids);
    const seen = new Set((known ?? []).map((k) => k.external_id));
    const rows = body.activities.map((a) => ({
      athlete_id: me.id,
      source: "apple" as const,
      external_id: a.id,
      sport: a.sport.toLowerCase(),
      name: a.name ?? null,
      start_time: new Date(a.start).toISOString(),
      duration_s: a.duration_s == null ? null : Math.round(a.duration_s),
      distance_m: a.distance_m ?? null,
      avg_hr: a.avg_hr ?? null,
      max_hr: a.max_hr ?? null,
      calories: a.calories ?? null,
      elevation_gain_m: a.elevation_gain_m ?? null,
      avg_power: a.avg_power ?? null,
      device: a.device ?? null,
    }));
    const { error } = await supabase.from("activities").upsert(rows, { onConflict: "source,external_id" });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    newActivities = ids.filter((id) => !seen.has(id));
  }

  // Server-side follow-ups that need wider access: match new workouts to the plan, recompute readiness.
  const admin = createAdminClient();
  if (newActivities.length) {
    const { data: saved } = await admin.from("activities").select("id, start_time").eq("source", "apple").in("external_id", newActivities);
    for (const s of saved ?? []) {
      // The same session from Garmin or an uploaded file: merge into one record (undoable).
      const a = { ...s, id: await mergeIfDuplicate(admin, s.id).catch(() => s.id) };
      await linkPlannedWorkout(admin, a.id).catch(() => {});
    }
  }
  if (body.wellness.length || newActivities.length) await refreshReadiness(me.id).catch((e) => console.warn("readiness refresh failed", e));

  // Upcoming sent workouts for the watch. Anything on the watch that isn't in this list gets removed.
  const today = new Date().toLocaleDateString("en-CA", { timeZone: me.timezone });
  const until = new Date(`${today}T12:00:00Z`);
  until.setUTCDate(until.getUTCDate() + WINDOW_DAYS - 1);
  const { data: plans } = await supabase
    .from("planned_workouts")
    .select("id, scheduled_date, title, sport, steps, pool_length, pool_unit")
    .eq("athlete_id", me.id)
    .eq("status", "sent")
    .is("deleted_at", null)
    .gte("scheduled_date", today)
    .lte("scheduled_date", until.toISOString().slice(0, 10))
    .order("scheduled_date")
    .limit(MAX_SCHEDULED);
  const workouts: AppleWorkout[] = [];
  for (const p of plans ?? []) {
    const pool: Pool = p.pool_length && p.pool_unit ? { length: Number(p.pool_length), unit: p.pool_unit as PoolUnit } : null;
    const w = toAppleWorkout({ id: p.id, date: p.scheduled_date, title: p.title, sport: p.sport, steps: (p.steps ?? []) as Step[], pool });
    if (w) workouts.push(w);
  }
  // Removed workouts the app should confirm it took off the watch.
  const { data: removing } = await supabase
    .from("planned_workouts")
    .select("id")
    .eq("athlete_id", me.id)
    .eq("removal_status", "pending_sync")
    .not("deleted_at", "is", null)
    .limit(100);

  return NextResponse.json({ ok: true, workouts, removing: (removing ?? []).map((r) => r.id) });
}
