import Spotlight from "@/components/Spotlight";
import QuestList from "@/components/quests/QuestList";
import { TIPS } from "@/lib/discovery";
import { getRestDay } from "@/lib/quests/data";
import { createClient } from "@/lib/supabase/server";

/** Rest days only: a few small, optional recovery missions. Nothing shows on training days. */
export default async function RestQuests({ athleteId, today, timeZone, tipSeen = true }: { athleteId: string; today: string; timeZone: string; tipSeen?: boolean }) {
  const supabase = await createClient();
  const quests = await getRestDay(supabase, athleteId, today, timeZone);
  if (!quests?.length) return null;
  return (
    <>
      {!tipSeen && <Spotlight tip={TIPS.quests} seen={false} />}
      <section className="row-in mt-6 rounded-[28px] border border-emerald-300/15 bg-gradient-to-br from-emerald-300/[0.07] to-white/[0.02] p-5" aria-label="Rest day quests">
        <p className="text-[11px] uppercase tracking-[0.15em] text-emerald-200/70">Rest day quests</p>
        <p className="mt-1 text-sm text-white/55">All optional. Do one, all, or none: resting is the main event.</p>
        <QuestList quests={quests} />
      </section>
    </>
  );
}
