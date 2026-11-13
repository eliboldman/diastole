import { NextResponse } from "next/server";

import { seedDemoAthlete } from "@/lib/demo/demo-athlete";
import { createAdminClient, requireCoach } from "@/lib/supabase/server";

// TEMPORARY: seeds a demo athlete for the signed-in coach, counts its rows, then deletes it.
export async function GET() {
  const coach = await requireCoach();
  const admin = createAdminClient();
  const { data: before } = await admin.from("profiles").select("demo_seeded_at").eq("id", coach.id).single();
  try {
    const id = await seedDemoAthlete(coach.id);
    const count = async (t: string) => (await admin.from(t).select("*", { count: "exact", head: true }).eq("athlete_id", id)).count;
    const out = { wellness: await count("daily_wellness"), activities: await count("activities"), plans: await count("planned_workouts"), meals: await count("meal_logs"), readiness: await count("readiness_scores"), races: await count("races"), checkins: await count("workout_checkins") };
    await admin.auth.admin.deleteUser(id);
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    const { data: left } = await admin.from("profiles").select("id").eq("email", `demo-${coach.id.slice(0, 8)}@test.diastole.app`).maybeSingle();
    if (left) await admin.auth.admin.deleteUser(left.id);
    return NextResponse.json({ ok: false, error: String(e), stack: e instanceof Error ? e.stack?.split("\n").slice(0, 6) : null });
  } finally {
    await admin.from("profiles").update({ demo_seeded_at: before?.demo_seeded_at ?? new Date().toISOString() }).eq("id", coach.id);
  }
}
