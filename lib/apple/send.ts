import "server-only";

import type { createClient } from "@/lib/supabase/server";

type Supa = Awaited<ReturnType<typeof createClient>>;

/**
 * Apple Watch athletes: an approved workout is "sent" right away (the athlete gets the usual
 * new-workout notification), and the iPhone app puts it on the watch the next time it opens.
 */
export async function sendToApple(supabase: Supa, workoutId: string) {
  const { error } = await supabase
    .from("planned_workouts")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", workoutId)
    .eq("status", "approved")
    .is("deleted_at", null);
  return error ? `Approved, but marking it sent failed: ${error.message}` : null;
}
