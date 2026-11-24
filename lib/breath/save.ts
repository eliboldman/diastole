import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { FINDER_PACES, isKind, pickPace } from "@/lib/breath/plan";

// Saving breathing sessions and CO2 holds, shared by the website (signed-in athlete, RLS client) and
// the Garmin Breathe app (bearer token, admin client). Everything is validated here.

export type BreathInput = {
  kind: string;
  seconds: number;
  pace: number | null;
  calmBefore: number | null;
  calmAfter: number | null;
  ratings?: Record<string, number> | null;
  hr?: { start: number | null; end: number | null; swing: number | null; rmssd: number | null; swings: Record<string, number> | null; device: string | null } | null;
};
export type SaveResult = { ok: true; pace?: number | null } | { ok: false; error: string };

const calm = (v: unknown) => (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 5 ? (v as number) : null);
const num = (v: unknown, lo: number, hi: number, dp = 1) => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v * 10 ** dp) / 10 ** dp : null);

/** The local date and hour in tz at `at` (now by default). */
export function localAt(tz: string, at: Date = new Date()) {
  const date = at.toLocaleDateString("en-CA", { timeZone: tz });
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(at)) % 24;
  return { date, hour };
}

/** Save a finished session (a pace finder also sets the athlete's pace). `at`: when it finished (a watch may send it later). */
export async function insertBreath(client: SupabaseClient, athleteId: string, tz: string, input: BreathInput, at?: Date): Promise<SaveResult> {
  if (!isKind(input.kind)) return { ok: false, error: "Unknown session." };
  const seconds = Math.round(Math.min(Math.max(Number(input.seconds) || 0, 1), 7200));
  if (seconds < 30) return { ok: false, error: "Too short to save." };
  let pace = input.pace != null && Number.isFinite(input.pace) ? Math.min(Math.max(Math.round(input.pace * 10) / 10, 3), 12) : null;
  const h = input.hr ?? null;
  const swings = h?.swings
    ? (Object.fromEntries(
        Object.entries(h.swings)
          .map(([k, v]) => [k, num(v, 0, 80)] as const)
          .filter(([k, v]) => FINDER_PACES.includes(Number(k) as never) && v != null),
      ) as Record<string, number>)
    : null;
  let ratings: Record<string, number> | null = null;
  let swing = num(h?.swing, 0, 80);
  if (input.kind === "finder") {
    ratings = Object.fromEntries(Object.entries(input.ratings ?? {}).filter(([, v]) => calm(v) != null)) as Record<string, number>;
    pace = pickPace(ratings, swings);
    if (pace == null) return { ok: false, error: "Rate at least one pace." };
    swing = swings?.[String(pace)] ?? null;
  }
  const { date, hour } = localAt(tz, at);
  const { error } = await client.from("breath_sessions").insert({
    athlete_id: athleteId,
    kind: input.kind,
    pace,
    seconds,
    calm_before: calm(input.calmBefore),
    calm_after: calm(input.calmAfter),
    ratings,
    hr_start: num(h?.start, 25, 240, 0),
    hr_end: num(h?.end, 25, 240, 0),
    hr_swing: swing,
    rmssd: num(h?.rmssd, 0, 400),
    hr_swings: swings && Object.keys(swings).length ? swings : null,
    hr_device: typeof h?.device === "string" ? h.device.slice(0, 60) : null,
    local_date: date,
    local_hour: hour,
  });
  if (error) return { ok: false, error: "Couldn't save the session." };
  return { ok: true, pace };
}

/** Save a seated CO2 hold check. */
export async function insertHold(client: SupabaseClient, athleteId: string, tz: string, seconds: number, at?: Date): Promise<SaveResult> {
  const s = Math.round(Number(seconds) * 10) / 10;
  if (!(s >= 1 && s <= 300)) return { ok: false, error: "That time doesn't look right." };
  const { error } = await client.from("breath_holds").insert({ athlete_id: athleteId, taken_on: localAt(tz, at).date, seconds: s });
  if (error) return { ok: false, error: "Couldn't save the hold." };
  return { ok: true };
}
