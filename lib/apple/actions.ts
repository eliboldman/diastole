"use server";

import { revalidatePath } from "next/cache";

import { createClient, requireUser } from "@/lib/supabase/server";

/** Stop syncing Apple Health. The iPhone app clears its scheduled workouts at its next check-in. */
export async function disconnectApple() {
  const me = await requireUser();
  const supabase = await createClient();
  await supabase.from("device_connections").delete().eq("athlete_id", me.id).eq("source", "apple");
  revalidatePath("/connect");
  revalidatePath("/me");
}
