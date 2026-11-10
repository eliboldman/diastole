import "server-only";

import { overnightIn } from "@/lib/ai/briefs";
import { createAdminClient } from "@/lib/supabase/server";

export type MorningStatus = { athletes: { id: string; name: string; ready: boolean; briefed: boolean }[] };

/** Who has last night's data in, and who already has today's brief. */
export async function getMorningStatus(coachId: string): Promise<MorningStatus> {
  const admin = createAdminClient();
  const { data: roster } = await admin.from("profiles").select("id, full_name, email, timezone").eq("coach_id", coachId).neq("id", coachId).eq("is_test", false).order("full_name");
  const list = roster ?? [];
  const [ready, { data: briefs }] = await Promise.all([
    overnightIn(admin, list),
    admin.from("morning_briefs").select("athlete_id, date").eq("coach_id", coachId).gte("date", new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10)),
  ]);
  const today = (tz: string | null) => new Intl.DateTimeFormat("en-CA", { timeZone: tz || "America/Chicago" }).format(new Date());
  return {
    athletes: list.map((a) => ({
      id: a.id,
      name: ((a.full_name || a.email || "Athlete") as string).split(" ")[0],
      ready: ready.has(a.id),
      briefed: (briefs ?? []).some((b) => b.athlete_id === a.id && b.date === today(a.timezone)),
    })),
  };
}
