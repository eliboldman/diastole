import TodaySync, { type TodaySnapshot } from "@/components/today/TodaySync";
import { describe } from "@/lib/workouts/describe";
import type { Pool, Step } from "@/lib/workouts/garmin-format";
import { createClient } from "@/lib/supabase/server";

/** Server side of TodaySync: today's workout with its steps written out (for offline), and what's next. */
export default async function TodayShare({ athleteId, today, units, readiness, note, upcoming }: {
  athleteId: string;
  today: string;
  units: "mi" | "km";
  readiness: string | null;
  note: string | null;
  upcoming: { id: string; scheduled_date: string; title: string; sport: string; status: string; start_time: string | null; mystery?: boolean | null; revealed_at?: string | null }[];
}) {
  const live = upcoming.filter((w) => w.status === "approved" || w.status === "sent" || w.status === "completed");
  const t = live.find((w) => w.scheduled_date === today && w.status !== "completed") ?? null;
  let lines: string[] = [];
  const sealed = !!t?.mystery && !t?.revealed_at;
  if (t && !sealed) {
    const { data } = await (await createClient()).from("planned_workouts").select("steps, pool_length, pool_unit, sport").eq("id", t.id).eq("athlete_id", athleteId).maybeSingle();
    const pool: Pool = data?.pool_length && data?.pool_unit ? { length: Number(data.pool_length), unit: data.pool_unit } : null;
    try {
      lines = describe((data?.steps ?? []) as Step[], units, pool, data?.sport === "swim").slice(0, 20);
    } catch {
      lines = [];
    }
  }
  const snapshot: TodaySnapshot = {
    date: today,
    readiness: (["green", "yellow", "red"].includes(readiness ?? "") ? readiness : "unknown") as TodaySnapshot["readiness"],
    note: note ? note.slice(0, 160) : null,
    workout: t ? { title: sealed ? "Mystery workout" : t.title, sport: t.sport, time: t.start_time ? t.start_time.slice(0, 5) : null, lines, mystery: sealed } : null,
    next: live.filter((w) => w.scheduled_date > today).slice(0, 3).map((w) => ({ date: w.scheduled_date, title: w.mystery && !w.revealed_at ? "Mystery workout" : w.title, sport: w.sport })),
  };
  return <TodaySync snapshot={snapshot} />;
}
