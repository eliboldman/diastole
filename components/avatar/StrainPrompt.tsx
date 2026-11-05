import { ChevronRight } from "lucide-react";
import Link from "next/link";

import Avatar from "@/components/avatar/Avatar";
import { sportLabel } from "@/lib/activity/format";
import { normalizeStrain, REGION_LABEL, type Region } from "@/lib/avatar/strain";
import { backfillStrain } from "@/lib/avatar/strain-store";
import { createAdminClient, createClient } from "@/lib/supabase/server";

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

/** After a workout: "here's what we think it worked, check it". Disappears once reviewed. */
export default async function StrainPrompt({ athleteId }: { athleteId: string }) {
  await backfillStrain(createAdminClient(), athleteId, 2);
  const supabase = await createClient();
  const since = hoursAgo(36);
  const [{ data: rows }, { data: avatar }] = await Promise.all([
    supabase
      .from("activity_strain")
      .select("activity_id, auto, reviewed_at, activities!inner(name, sport, start_time)")
      .eq("athlete_id", athleteId)
      .is("reviewed_at", null)
      .is("custom", null)
      .gte("activities.start_time", since)
      .order("start_time", { referencedTable: "activities", ascending: false })
      .limit(5),
    supabase.from("avatars").select("look").eq("athlete_id", athleteId).maybeSingle(),
  ]);
  const row = (rows ?? [])
    .map((r) => ({ ...r, act: r.activities as unknown as { name: string | null; sport: string | null; start_time: string } }))
    .sort((a, b) => b.act.start_time.localeCompare(a.act.start_time))
    .find((r) => Object.keys(normalizeStrain(r.auto)).length > 0);
  if (!row) return null;
  const strain = normalizeStrain(row.auto);
  const top = (Object.entries(strain) as [Region, number][]).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([r]) => REGION_LABEL[r]);
  const title = row.act.name || sportLabel(row.act.sport);

  return (
    <Link
      href={`/activity/${row.activity_id}#muscles`}
      className="lift mt-6 flex items-center gap-3 rounded-[28px] border border-amber-200/20 bg-amber-200/[0.04] p-3 pr-5 backdrop-blur-xl"
    >
      <span className="flex shrink-0 gap-0.5" aria-hidden>
        <Avatar look={avatar?.look ?? null} strain={strain} view="front" still className="h-24 w-[3.75rem]" />
        <Avatar look={avatar?.look ?? null} strain={strain} view="back" still className="h-24 w-[3.75rem]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] uppercase tracking-[0.15em] text-amber-100/70">Muscles worked</span>
        <span className="mt-0.5 block truncate font-medium">{`Check your ${title}`}</span>
        <span className="block truncate text-sm text-white/55">{`Mostly ${top.join(", ")}. Tap to confirm or change.`}</span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-amber-100" aria-hidden />
    </Link>
  );
}
