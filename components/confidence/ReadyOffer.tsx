import { ShieldCheck } from "lucide-react";
import Link from "next/link";

import { readySummary } from "@/lib/confidence/collect";
import { getBank } from "@/lib/confidence/data";
import { estimateSession } from "@/lib/fuel/plan";
import { isKey } from "@/lib/poster/poster";
import { createClient } from "@/lib/supabase/server";
import type { Step } from "@/lib/workouts/garmin-format";

/** Today, only before a key session or within 3 days of an A race: a nudge to open the confidence bank. */
export default async function ReadyOffer({ athleteId, today }: { athleteId: string; today: string }) {
  const supabase = await createClient();
  const soon = new Date(Date.parse(`${today}T12:00:00Z`) + 3 * 86_400_000).toISOString().slice(0, 10);
  const [{ data: race }, { data: plans }] = await Promise.all([
    supabase.from("races").select("id, name, race_date").eq("athlete_id", athleteId).eq("priority", "A").gte("race_date", today).lte("race_date", soon).order("race_date").limit(1).maybeSingle(),
    supabase.from("planned_workouts").select("id, title, sport, steps").eq("athlete_id", athleteId).eq("scheduled_date", today).in("status", ["approved", "sent"]).is("deleted_at", null),
  ]);
  const key = (plans ?? []).find((p) => p.sport !== "strength" && isKey(estimateSession((p.steps ?? []) as Step[], p.sport)));
  if (!race && !key) return null;
  const entries = await getBank(supabase, athleteId);
  if (!entries.length) return null;
  const lines = readySummary(entries, race ? { race: race.name } : { minutes: null, sport: key!.sport, title: key!.title });
  const href = race ? `/me/confidence?race=${race.id}` : `/me/confidence?for=${key!.id}`;
  return (
    <Link href={href} className="lift row-in mt-6 block rounded-[28px] border border-emerald-300/25 bg-gradient-to-br from-emerald-300/[0.09] to-white/[0.02] p-5 transition hover:bg-emerald-300/[0.12]">
      <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.15em] text-emerald-200/80">
        <ShieldCheck size={14} aria-hidden /> {race ? `${race.name} is close` : "Big one today"}
      </p>
      <p className="mt-2 text-[15px] leading-relaxed text-white/90">{lines[0]}</p>
      <p className="mt-2 text-sm font-medium text-emerald-200">Open your confidence bank →</p>
    </Link>
  );
}
