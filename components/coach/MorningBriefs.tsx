import BriefList, { type BriefItem } from "@/components/coach/BriefList";
import { createClient } from "@/lib/supabase/server";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

/** Today's morning briefs: drafted by Claude in the coach's voice; the coach sends or skips each one. */
export default async function MorningBriefs({ coachId, hasAthletes }: { coachId: string; hasAthletes: boolean }) {
  if (!hasAthletes) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("morning_briefs")
    .select("id, athlete_id, date, draft, status, final_text, message_id, decided_at")
    .eq("coach_id", coachId)
    .gte("date", daysAgo(1))
    .order("date", { ascending: false });
  const rows = data ?? [];
  const ids = [...new Set(rows.map((r) => r.athlete_id))];
  const [{ data: people }, { data: looks }] = await Promise.all([
    ids.length ? supabase.from("profiles").select("id, full_name").in("id", ids) : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
    ids.length ? supabase.rpc("get_avatars", { p_ids: ids }) : Promise.resolve({ data: {} }),
  ]);
  const name = new Map((people ?? []).map((p) => [p.id, p.full_name || "Athlete"]));
  // Newest per athlete only (yesterday's leftover shows only if today's isn't there yet).
  const seen = new Set<string>();
  const items: BriefItem[] = [];
  for (const r of rows) {
    if (seen.has(r.athlete_id)) continue;
    seen.add(r.athlete_id);
    items.push({ ...r, name: name.get(r.athlete_id) ?? "Athlete", look: (looks as Record<string, unknown> | null)?.[r.athlete_id] ?? null });
  }
  return (
    <section id="briefs" className="row-in mt-6 scroll-mt-6 rounded-[28px] border border-white/10 bg-white/[0.05] p-5 backdrop-blur-xl sm:p-6">
      <h2 className="text-lg font-medium">Morning briefs</h2>
      <p className="mb-4 mt-1 text-sm text-white/55">Drafted from each athlete&apos;s readiness, yesterday&apos;s check-in and today&apos;s plan. Edit, then send as a message from you, or skip.</p>
      <BriefList items={items} />
    </section>
  );
}
