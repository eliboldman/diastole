import { redirect } from "next/navigation";

import { requireUser } from "@/lib/supabase/server";

/** Quick action "Add a workout": coaches get the full builder for themselves, athletes their own-workout form. */
export default async function GoWorkout() {
  const me = await requireUser();
  redirect(me.role === "coach" ? `/athlete/${me.id}/workouts/new` : "/training/mine/new");
}
