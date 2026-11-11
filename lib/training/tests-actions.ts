"use server";

import { revalidatePath } from "next/cache";

import { createClient, requireCoach } from "@/lib/supabase/server";

import { TEST_KINDS, TESTS, testSteps, type TestKind } from "./tests";

const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Adds a threshold test to the athlete's plan as a draft. It goes out like any workout: approve and send. */
export async function scheduleTest(athleteId: string, kind: TestKind, date: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const coach = await requireCoach();
  if (!UUID.test(athleteId) || !TEST_KINDS.includes(kind) || !DATE.test(date)) return { ok: false, error: "Pick a test and a date." };
  const supabase = await createClient(); // row-level security: only this coach's athletes
  const { data: zones } = await supabase.from("athlete_zones").select("ftp_w").eq("athlete_id", athleteId).maybeSingle();
  const t = TESTS[kind];
  const { data, error } = await supabase
    .from("planned_workouts")
    .insert({
      athlete_id: athleteId,
      coach_id: coach.id,
      scheduled_date: date,
      sport: t.sport,
      title: t.title,
      description: t.description,
      steps: testSteps(kind, { ftp_w: zones?.ftp_w ?? null }),
      status: "draft",
      test_kind: kind,
      why: `A ${t.short} to set ${t.zone === "ftp_w" ? "FTP" : t.zone === "css_sec_per_100m" ? "swim CSS" : "threshold pace"} from a real effort. The result comes to your coach to apply.`,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "Couldn't add the test. Try again." };
  revalidatePath(`/athlete/${athleteId}`);
  return { ok: true, id: data.id as string };
}
