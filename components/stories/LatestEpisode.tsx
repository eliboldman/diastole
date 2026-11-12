import { Clapperboard } from "lucide-react";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";

/** Pod page: the newest posted episode, a few lines and a link to the season archive. */
export default async function LatestEpisode({ podId }: { podId: string }) {
  const supabase = await createClient();
  const { data: ep } = await supabase.from("storylines").select("id, title, body, season, episode, posted_at").eq("pod_id", podId).eq("status", "posted").order("week", { ascending: false }).limit(1).maybeSingle();
  if (!ep) return null;
  const fresh = ep.posted_at && Date.parse(ep.posted_at) > new Date().getTime() - 6 * 86_400_000;
  return (
    <Link href={`/me/pods/${podId}/episodes`} className="lift row-in mt-4 block rounded-[24px] border border-white/10 bg-white/[0.05] p-4 transition hover:bg-white/[0.07]">
      <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.15em] text-emerald-200/75">
        <Clapperboard size={13} aria-hidden /> Season {ep.season} · Episode {ep.episode}
        {fresh && <span className="rounded-full bg-emerald-300 px-1.5 text-[10px] font-semibold text-black">New</span>}
      </p>
      <p className="mt-1 font-medium">{ep.title}</p>
      <p className="mt-0.5 line-clamp-2 text-sm text-white/60">{ep.body}</p>
    </Link>
  );
}
