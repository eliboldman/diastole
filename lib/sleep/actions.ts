"use server";

import { revalidatePath } from "next/cache";

import { createClient, requireUser } from "@/lib/supabase/server";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export type SleepInput = {
  wake_time: string | null;
  sleep_goal_min: number | null; // null = use their own sleep data
  buffer_min: number;
  nudges: boolean;
  quiet_start: string;
  quiet_end: string;
  wind_down: string | null;
};

/** Save an athlete's sleep settings (their own, or a coach for their athlete). */
export async function saveSleepPrefs(athleteId: string | null, input: SleepInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireUser();
  const id = athleteId ?? me.id;
  if (input.wake_time && !HHMM.test(input.wake_time)) return { ok: false, error: "Pick a wake time." };
  if (!HHMM.test(input.quiet_start) || !HHMM.test(input.quiet_end)) return { ok: false, error: "Pick quiet hours." };
  if (input.sleep_goal_min !== null && !(input.sleep_goal_min >= 300 && input.sleep_goal_min <= 720)) return { ok: false, error: "Sleep goal should be 5 to 12 hours." };
  const buffer = Math.min(180, Math.max(0, Math.round(input.buffer_min)));
  const supabase = await createClient(); // row-level security: own row, or a coach's athlete
  const { error } = await supabase.from("athlete_sleep").upsert(
    {
      athlete_id: id,
      wake_time: input.wake_time || null,
      sleep_goal_min: input.sleep_goal_min,
      buffer_min: buffer,
      nudges: Boolean(input.nudges),
      quiet_start: input.quiet_start,
      quiet_end: input.quiet_end,
      wind_down: input.wind_down ? input.wind_down.slice(0, 80) : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "athlete_id" },
  );
  if (error) return { ok: false, error: "Couldn't save. Try again." };
  revalidatePath("/me");
  revalidatePath("/me/setup");
  return { ok: true };
}
