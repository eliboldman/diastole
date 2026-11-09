import "server-only";

import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

import { saveUploadedFit } from "@/lib/activity/upload";
import { localDate } from "@/lib/readiness/run";
import { createAdminClient } from "@/lib/supabase/server";
import type { Step } from "@/lib/workouts/garmin-format";

import { plannedSeconds, toIntervalsText } from "./format";

// intervals.icu sync for one athlete. Push: approved bike workouts from yesterday to four weeks out
// become intervals.icu calendar events (which intervals.icu forwards to Zwift and Rouvy); edits
// update the same event and removed workouts delete it. Pull: rides intervals.icu got from Zwift,
// Rouvy and friends come back as Diastole activities. API: Basic auth, user "API_KEY".

type Admin = ReturnType<typeof createAdminClient>;
const BASE = "https://intervals.icu/api/v1";
const DAY = 86_400_000;
const AHEAD_DAYS = 28;
const MAX_PULL = 8; // rides fetched per run (each is a file download)

export class IntervalsError extends Error {
  constructor(message: string, readonly status = 0) {
    super(message);
  }
}

async function icu(key: string, path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${Buffer.from(`API_KEY:${key}`).toString("base64")}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 401 || res.status === 403) throw new IntervalsError("intervals.icu didn't accept the API key", res.status);
  return res;
}

async function icuJson<T>(key: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await icu(key, path, init);
  if (!res.ok) throw new IntervalsError(`intervals.icu answered ${res.status} for ${path.split("?")[0]}`, res.status);
  return (await res.json()) as T;
}

/** Checks a key and returns the intervals.icu athlete it belongs to. */
export async function verifyKey(key: string): Promise<{ id: string; name: string | null }> {
  const a = await icuJson<{ id?: string; name?: string }>(key, "/athlete/0");
  if (!a.id) throw new IntervalsError("intervals.icu didn't return an athlete");
  return { id: String(a.id), name: a.name ?? null };
}

async function keyFor(admin: Admin, athleteId: string) {
  const { data } = await admin.rpc("get_intervals_key", { p_athlete: athleteId });
  return typeof data === "string" && data ? data : null;
}

const fingerprint = (date: string, title: string, text: string) => createHash("sha256").update(`${date}\n${title}\n${text}`).digest("hex").slice(0, 32);

type IcuEvent = { id?: number; external_id?: string };

function eventBody(w: { id: string; scheduled_date: string; title: string }, text: string, seconds: number) {
  return {
    category: "WORKOUT",
    type: "Ride",
    indoor: true,
    start_date_local: `${w.scheduled_date}T00:00:00`,
    name: w.title.slice(0, 80) || "Workout",
    description: text,
    external_id: `diastole-${w.id}`,
    ...(seconds > 0 ? { moving_time: seconds } : {}),
  };
}

export type SyncResult = { status: "clean" | "not_connected" | "synced" | "error"; created?: number; updated?: number; deleted?: number; error?: string };

/** Pushes workouts (and FTP) when something changed since the last push, or always with `force`. */
export async function syncAthlete(athleteId: string, opts: { force?: boolean } = {}, admin: Admin = createAdminClient()): Promise<SyncResult> {
  const { data: conn } = await admin.from("intervals_connections").select("sync_ftp, dirty_at, pushed_at").eq("athlete_id", athleteId).maybeSingle();
  if (!conn) return { status: "not_connected" };
  if (!opts.force && !(conn.dirty_at && (!conn.pushed_at || conn.dirty_at > conn.pushed_at))) return { status: "clean" };
  const key = await keyFor(admin, athleteId);
  if (!key) return { status: "not_connected" };
  const started = new Date().toISOString();

  try {
    const [{ data: profile }, { data: zones }] = await Promise.all([
      admin.from("profiles").select("timezone").eq("id", athleteId).maybeSingle(),
      admin.from("athlete_zones").select("ftp_w, max_hr").eq("athlete_id", athleteId).maybeSingle(),
    ]);
    const tz = profile?.timezone || "America/Los_Angeles";
    const from = localDate(new Date(Date.now() - DAY), tz);
    const until = localDate(new Date(Date.now() + AHEAD_DAYS * DAY), tz);
    const ftp = zones?.ftp_w ?? null;

    // FTP first, so intervals.icu converts the % targets the same way Diastole does.
    if (conn.sync_ftp && ftp) {
      const res = await icu(key, "/athlete/0/sport-settings/Ride");
      if (res.ok) {
        const ss = (await res.json()) as { ftp?: number | null };
        if (ss.ftp !== ftp) await icuJson(key, "/athlete/0/sport-settings/Ride", { method: "PUT", body: JSON.stringify({ ftp }) });
      }
    }

    const [{ data: workouts }, { data: mapped }] = await Promise.all([
      admin
        .from("planned_workouts")
        .select("id, scheduled_date, title, steps")
        .eq("athlete_id", athleteId)
        .eq("sport", "bike")
        .in("status", ["approved", "sent", "completed"])
        .is("deleted_at", null)
        .gte("scheduled_date", from)
        .lte("scheduled_date", until)
        .order("scheduled_date")
        .limit(60),
      admin.from("intervals_events").select("planned_workout_id, event_id, fingerprint, scheduled_date").eq("athlete_id", athleteId),
    ]);
    const byPlan = new Map((mapped ?? []).map((m) => [m.planned_workout_id, m]));
    const wanted = new Set<string>();
    const toCreate: { w: { id: string; scheduled_date: string; title: string }; body: ReturnType<typeof eventBody>; fp: string }[] = [];
    let updated = 0;

    for (const w of workouts ?? []) {
      const steps = (w.steps ?? []) as Step[];
      const text = toIntervalsText(steps, { ftp, maxHr: zones?.max_hr ?? null });
      if (!text) continue;
      wanted.add(w.id);
      const fp = fingerprint(w.scheduled_date, w.title, text);
      const body = eventBody(w, text, plannedSeconds(steps));
      const m = byPlan.get(w.id);
      if (!m) {
        toCreate.push({ w, body, fp });
      } else if (m.fingerprint !== fp) {
        const res = await icu(key, `/athlete/0/events/${m.event_id}`, { method: "PUT", body: JSON.stringify(body) });
        if (res.status === 404) {
          toCreate.push({ w, body, fp }); // the athlete deleted it in intervals.icu: put it back
        } else if (!res.ok) {
          throw new IntervalsError(`intervals.icu answered ${res.status} updating a workout`, res.status);
        } else {
          await admin.from("intervals_events").update({ fingerprint: fp, scheduled_date: w.scheduled_date, pushed_at: started }).eq("planned_workout_id", w.id);
          updated++;
        }
      }
    }

    if (toCreate.length) {
      const created = await icuJson<IcuEvent[]>(key, "/athlete/0/events/bulk", { method: "POST", body: JSON.stringify(toCreate.map((c) => c.body)) });
      const ids = new Map(created.filter((e) => e.id && e.external_id).map((e) => [e.external_id!, e.id!]));
      // Match by external_id; fall back to position (the bulk call answers in the order sent) so a
      // missing echo can't make the next sync create duplicates.
      const rows = toCreate.flatMap((c, i) => {
        const id = ids.get(c.body.external_id) ?? (created.length === toCreate.length ? created[i]?.id : undefined);
        return id ? [{ planned_workout_id: c.w.id, athlete_id: athleteId, event_id: id, fingerprint: c.fp, scheduled_date: c.w.scheduled_date, pushed_at: started }] : [];
      });
      if (rows.length) await admin.from("intervals_events").upsert(rows);
    }

    // Removed, moved out of range or no longer a bike workout: delete upcoming events. Past ones stay
    // (they're history in intervals.icu); their mapping rows are just forgotten after two months.
    const gone = (mapped ?? []).filter((m) => !wanted.has(m.planned_workout_id) && m.scheduled_date >= from);
    if (gone.length) {
      const res = await icu(key, "/athlete/0/events/bulk-delete", { method: "PUT", body: JSON.stringify(gone.map((m) => ({ id: m.event_id }))) });
      if (!res.ok && res.status !== 404) throw new IntervalsError(`intervals.icu answered ${res.status} removing workouts`, res.status);
      await admin.from("intervals_events").delete().in("planned_workout_id", gone.map((m) => m.planned_workout_id));
    }
    await admin.from("intervals_events").delete().eq("athlete_id", athleteId).lt("scheduled_date", localDate(new Date(Date.now() - 60 * DAY), tz));

    await admin.from("intervals_connections").update({ pushed_at: started, last_error: null }).eq("athlete_id", athleteId);
    return { status: "synced", created: toCreate.length, updated, deleted: gone.length };
  } catch (e) {
    const error = e instanceof Error ? e.message.slice(0, 300) : "Sync failed";
    await admin.from("intervals_connections").update({ last_error: error }).eq("athlete_id", athleteId);
    return { status: "error", error };
  }
}

type IcuActivity = { id: string | number; type?: string; source?: string; start_date_local?: string; name?: string };

export type PullResult = { status: "not_connected" | "done" | "error"; added?: number; error?: string };

/** Brings in rides intervals.icu got from Zwift, Rouvy and other apps (not Garmin: that syncs itself). */
/** `since` overrides the stored pulled_at (pullIfStale claims the slot before calling). */
export async function pullRides(athleteId: string, admin: Admin = createAdminClient(), since?: string | null): Promise<PullResult> {
  const { data: conn } = await admin.from("intervals_connections").select("pulled_at, connected_at").eq("athlete_id", athleteId).maybeSingle();
  const key = conn ? await keyFor(admin, athleteId) : null;
  if (!conn || !key) return { status: "not_connected" };
  const started = new Date().toISOString();
  try {
    const { data: profile } = await admin.from("profiles").select("timezone").eq("id", athleteId).maybeSingle();
    const tz = profile?.timezone || "America/Los_Angeles";
    const last = since === undefined ? conn.pulled_at : since;
    const from = last ? new Date(new Date(last).getTime() - 2 * DAY) : new Date(Date.now() - 14 * DAY);
    const list = await icuJson<IcuActivity[]>(key, `/athlete/0/activities?oldest=${localDate(from, tz)}&newest=${localDate(new Date(Date.now() + DAY), tz)}&limit=50`);
    const candidates = list.filter((a) => a.id && !["GARMIN_CONNECT", "STRAVA"].includes(a.source ?? "") && /ride|run/i.test(a.type ?? ""));
    const { data: seen } = await admin.from("intervals_pulled").select("icu_activity_id").eq("athlete_id", athleteId).in("icu_activity_id", candidates.map((a) => String(a.id)));
    const known = new Set((seen ?? []).map((s) => s.icu_activity_id));
    let added = 0;
    for (const a of candidates.filter((c) => !known.has(String(c.id))).slice(0, MAX_PULL)) {
      const res = await icu(key, `/activity/${encodeURIComponent(String(a.id))}/file`);
      let activityId: string | null = null;
      if (res.ok) {
        let bytes = new Uint8Array(await res.arrayBuffer());
        if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = new Uint8Array(gunzipSync(bytes));
        if (bytes.length && bytes.length <= 8 * 1024 * 1024) {
          const r = await saveUploadedFit(athleteId, bytes);
          if (r.status !== "unreadable") activityId = r.id;
          if (r.status === "created") added++;
        }
      }
      await admin.from("intervals_pulled").upsert({ athlete_id: athleteId, icu_activity_id: String(a.id), activity_id: activityId });
    }
    await admin.from("intervals_connections").update({ pulled_at: started }).eq("athlete_id", athleteId);
    return { status: "done", added };
  } catch (e) {
    const error = e instanceof Error ? e.message.slice(0, 300) : "Pull failed";
    await admin.from("intervals_connections").update({ last_error: error }).eq("athlete_id", athleteId);
    return { status: "error", error };
  }
}

/** Saves a verified key, then does a first full sync and pull. */
export async function connect(athleteId: string, key: string, admin: Admin = createAdminClient()) {
  const who = await verifyKey(key);
  const { error: e1 } = await admin.rpc("save_intervals_key", { p_athlete: athleteId, p_key: key });
  if (e1) throw new Error(e1.message);
  const { error: e2 } = await admin
    .from("intervals_connections")
    .upsert({ athlete_id: athleteId, icu_athlete_id: who.id, icu_name: who.name?.slice(0, 80) ?? null, connected_at: new Date().toISOString(), dirty_at: new Date().toISOString(), pushed_at: null, pulled_at: null, last_error: null });
  if (e2) throw new Error(e2.message);
  const sync = await syncAthlete(athleteId, { force: true }, admin);
  const pull = await pullRides(athleteId, admin);
  return { who, sync, pull };
}

/** Disconnects; by default also removes the upcoming workouts Diastole added to intervals.icu. */
export async function disconnect(athleteId: string, removeUpcoming = true, admin: Admin = createAdminClient()) {
  const key = await keyFor(admin, athleteId);
  if (key && removeUpcoming) {
    const { data: profile } = await admin.from("profiles").select("timezone").eq("id", athleteId).maybeSingle();
    const today = localDate(new Date(), profile?.timezone || "America/Los_Angeles");
    const { data: mapped } = await admin.from("intervals_events").select("event_id").eq("athlete_id", athleteId).gte("scheduled_date", today);
    if (mapped?.length) {
      await icu(key, "/athlete/0/events/bulk-delete", { method: "PUT", body: JSON.stringify(mapped.map((m) => ({ id: m.event_id }))) }).catch(() => null);
    }
  }
  await admin.from("intervals_events").delete().eq("athlete_id", athleteId);
  await admin.rpc("delete_intervals_key", { p_athlete: athleteId });
  await admin.from("intervals_connections").delete().eq("athlete_id", athleteId);
}
