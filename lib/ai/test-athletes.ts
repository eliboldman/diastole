import "server-only";

import { localDate, refreshReadiness } from "@/lib/readiness/run";
import { createAdminClient } from "@/lib/supabase/server";
import { addDaysIso as addDays, easyRun, generateScenario, longRun, SCENARIOS, threshold, type Scenario } from "@/lib/ai/scenarios";

export { SCENARIOS, type Scenario };

// Seeded fake athletes for testing the morning AI analysis end to end.
// Each has 28 days of history plus a scenario for today, and a couple of upcoming sessions.

const TEST_DOMAIN = "test.diastole.app"; // no mail is ever sent: accounts are created pre-confirmed

/** Create (or reset) the four test athletes for a coach. Returns how many were set up. */
export async function seedTestAthletes(coachId: string): Promise<number> {
  const admin = createAdminClient();
  const { data: coach } = await admin.from("profiles").select("timezone").eq("id", coachId).single();
  const tz = coach?.timezone ?? "America/Los_Angeles";
  const today = localDate(new Date(), tz);
  const tag = coachId.slice(0, 8);

  let n = 0;
  for (const [i, key] of (Object.keys(SCENARIOS) as Scenario[]).entries()) {
    const email = `${key.replace("_", "-")}-${tag}@${TEST_DOMAIN}`;
    const id = await ensureUser(email, SCENARIOS[key].name);
    const marked = await admin.from("profiles").update({ coach_id: coachId, is_test: true, full_name: SCENARIOS[key].name, timezone: tz }).eq("id", id);
    if (marked.error) throw new Error(`Couldn't set up ${SCENARIOS[key].name}: ${marked.error.message}`);

    // Start clean: data, suggestions, workouts.
    await Promise.all([
      admin.from("daily_wellness").delete().eq("athlete_id", id),
      admin.from("activities").delete().eq("athlete_id", id),
      admin.from("readiness_scores").delete().eq("athlete_id", id),
      admin.from("ai_suggestions").delete().eq("athlete_id", id),
    ]);
    await admin.from("planned_workouts").delete().eq("athlete_id", id);

    const gen = generateScenario(key, today, i);
    const wellness = gen.wellness.map((w) => ({ athlete_id: id, source: "garmin", ...w }));
    const activities = gen.activities.map(({ date, external, ...a }) => ({
      athlete_id: id,
      source: "garmin",
      external_id: `test-${tag}-${external}`,
      sport: "running",
      start_time: new Date(`${date}T13:30:00Z`).toISOString(),
      ...a,
    }));

    const check = (step: string, error: { message: string } | null) => {
      if (error) throw new Error(`Seeding ${SCENARIOS[key].name} failed at ${step}: ${error.message}`);
    };
    check("wellness", (await admin.from("daily_wellness").insert(wellness)).error);
    if (activities.length) check("activities", (await admin.from("activities").insert(activities)).error);

    // Upcoming plan (approved, never sent: test athletes have no device).
    const now = new Date().toISOString();
    const plan =
      key === "high_load"
        ? [
            { date: addDays(today, 1), title: "Long run 22 km", steps: longRun },
            { date: addDays(today, 2), title: "Easy 40 min", steps: easyRun },
          ]
        : [
            { date: today, title: "Threshold 4 × 8 min", steps: threshold },
            { date: addDays(today, 1), title: "Easy 40 min", steps: easyRun },
          ];
    const planned = await admin.from("planned_workouts").insert(
      plan.map((p) => ({
        athlete_id: id,
        coach_id: coachId,
        scheduled_date: p.date,
        sport: "run",
        title: p.title,
        description: "Seeded by AI test mode.",
        steps: p.steps,
        status: "approved",
        approved_at: now,
      })),
    );
    check("planned workouts", planned.error);

    await refreshReadiness(id).catch((e) => console.error("test readiness", id, e));
    n++;
  }
  return n;
}

async function ensureUser(email: string, name: string): Promise<string> {
  const admin = createAdminClient();
  const { data: existing } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  if (existing) return existing.id;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true, // pre-confirmed: no email is sent
    user_metadata: { full_name: name },
  });
  if (error || !data.user) throw new Error(`Couldn't create ${email}: ${error?.message}`);
  return data.user.id;
}

/** Delete every test athlete of this coach (cascades all their data). */
export async function removeTestAthletes(coachId: string): Promise<number> {
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("id").eq("coach_id", coachId).eq("is_test", true);
  for (const p of data ?? []) await admin.auth.admin.deleteUser(p.id);
  return data?.length ?? 0;
}

/** True when the coach has test athletes but their scenario "today" is an earlier day (so they'd read as unknown). */
export async function testScenariosAreStale(coachId: string): Promise<boolean> {
  const admin = createAdminClient();
  const [{ data: coach }, { data: athletes }] = await Promise.all([
    admin.from("profiles").select("timezone").eq("id", coachId).single(),
    admin.from("profiles").select("id").eq("coach_id", coachId).eq("is_test", true),
  ]);
  if (!athletes?.length) return false;
  const today = localDate(new Date(), coach?.timezone ?? "America/Los_Angeles");
  const { count } = await admin
    .from("daily_wellness")
    .select("athlete_id", { count: "exact", head: true })
    .in("athlete_id", athletes.map((a) => a.id))
    .eq("date", today);
  return !count;
}
