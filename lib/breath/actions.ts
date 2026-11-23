"use server";

import { revalidatePath } from "next/cache";

import { isKind, pickPace } from "@/lib/breath/plan";
import { createClient, requireUser } from "@/lib/supabase/server";

type Result = { ok: true; pace?: number | null } | { ok: false; error: string };
const calm = (v: unknown) => (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 5 ? (v as number) : null);

/** The local date and hour for the signed-in athlete, right now. */
function localNow(tz: string) {
  const now = new Date();
  const date = now.toLocaleDateString("en-CA", { timeZone: tz });
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(now)) % 24;
  return { date, hour };
}

/** Save a finished breathing session (or a pace finder, which also sets the athlete's pace). */
export async function saveBreath(input: {
  kind: string;
  seconds: number;
  pace: number | null;
  calmBefore: number | null;
  calmAfter: number | null;
  ratings?: Record<string, number> | null;
}): Promise<Result> {
  const me = await requireUser();
  if (!isKind(input.kind)) return { ok: false, error: "Unknown session." };
  const seconds = Math.round(Math.min(Math.max(Number(input.seconds) || 0, 1), 7200));
  if (seconds < 30) return { ok: false, error: "Too short to save." };
  let pace = input.pace != null && Number.isFinite(input.pace) ? Math.min(Math.max(Math.round(input.pace * 10) / 10, 3), 12) : null;
  let ratings: Record<string, number> | null = null;
  if (input.kind === "finder") {
    ratings = Object.fromEntries(Object.entries(input.ratings ?? {}).filter(([, v]) => calm(v) != null)) as Record<string, number>;
    pace = pickPace(ratings);
    if (pace == null) return { ok: false, error: "Rate at least one pace." };
  }
  const { date, hour } = localNow(me.timezone);
  const supabase = await createClient();
  const { error } = await supabase.from("breath_sessions").insert({
    athlete_id: me.id,
    kind: input.kind,
    pace,
    seconds,
    calm_before: calm(input.calmBefore),
    calm_after: calm(input.calmAfter),
    ratings,
    local_date: date,
    local_hour: hour,
  });
  if (error) return { ok: false, error: "Couldn't save the session." };
  revalidatePath("/recovery/breathe");
  return { ok: true, pace };
}

/** Save a seated CO2 hold check. */
export async function saveHold(seconds: number): Promise<Result> {
  const me = await requireUser();
  const s = Math.round(Number(seconds) * 10) / 10;
  if (!(s >= 1 && s <= 300)) return { ok: false, error: "That time doesn't look right." };
  const supabase = await createClient();
  const { error } = await supabase.from("breath_holds").insert({ athlete_id: me.id, taken_on: localNow(me.timezone).date, seconds: s });
  if (error) return { ok: false, error: "Couldn't save the hold." };
  revalidatePath("/recovery/breathe");
  return { ok: true };
}

/** Delete one of the athlete's own holds (a mistaken entry). */
export async function deleteHold(id: string): Promise<{ ok: boolean }> {
  await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.from("breath_holds").delete().eq("id", id);
  revalidatePath("/recovery/breathe");
  return { ok: !error };
}
