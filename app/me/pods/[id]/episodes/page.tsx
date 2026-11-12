import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import AthleteShell from "@/components/AthleteShell";
import { createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Episodes · Diastole" };

/** The pod's season archive: every posted weekly episode, newest first. */
export default async function EpisodesPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: inPod }, { data: pod }, { data: eps }] = await Promise.all([
    supabase.rpc("in_pod", { p_pod: id }),
    supabase.from("pods").select("name").eq("id", id).maybeSingle(),
    supabase.from("storylines").select("id, title, body, season, episode, week").eq("pod_id", id).eq("status", "posted").order("week", { ascending: false }).limit(100),
  ]);
  if (!inPod) notFound();
  const seasons = [...new Set((eps ?? []).map((e) => e.season))];
  return (
    <AthleteShell isCoach={me.role === "coach"}>
      <Link href={me.role === "coach" ? `/pods/${id}` : `/me/pods/${id}`} className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-sm text-white/60 hover:bg-white/[0.05] hover:text-white">
        <ChevronLeft size={16} aria-hidden /> {pod?.name ?? "Pod"}
      </Link>
      <h1 className="mt-4 text-3xl font-medium tracking-tight sm:text-4xl">Episodes</h1>
      <p className="mt-2 text-white/55">Your pod&apos;s weeks, as told by your coach.</p>
      {!eps?.length && <p className="mt-8 text-white/55">No episodes yet. The first one arrives after a week of training together.</p>}
      {seasons.map((s) => (
        <section key={s} className="mt-8">
          <h2 className="mb-3 px-1 text-xs font-medium uppercase tracking-[0.2em] text-white/45">Season {s}</h2>
          <ol className="grid gap-3">
            {(eps ?? []).filter((e) => e.season === s).map((e) => (
              <li key={e.id} className="row-in rounded-[24px] border border-white/10 bg-white/[0.05] p-5">
                <p className="text-xs text-white/45">
                  Episode {e.episode} · week of {new Date(`${e.week}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </p>
                <h3 className="mt-1 text-lg font-medium">{e.title}</h3>
                <div className="mt-2 space-y-2 text-[15px] leading-relaxed text-white/80">
                  {String(e.body).split(/\n{2,}/).map((p: string, i: number) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </AthleteShell>
  );
}
