import type { Metadata } from "next";
import { redirect } from "next/navigation";

import BackLink from "@/components/layout/BackLink";
import DashboardShell from "@/components/layout/DashboardShell";
import FilmList from "@/components/recovery/FilmList";
import { videoMap } from "@/lib/recovery/data";
import { shotList } from "@/lib/recovery/shots";
import { SITE } from "@/lib/site";
import { createClient, requireCoach } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Film your demos · Diastole" };

/** The head coach's shot list: every screen test and move, filmed and uploaded from the phone. */
export default async function FilmPage() {
  const me = await requireCoach();
  if (me.email?.toLowerCase() !== SITE.contactEmail.toLowerCase()) redirect("/recovery");
  const videos = await videoMap(await createClient());
  const done = Object.fromEntries(Object.entries(videos).map(([slug, v]) => [slug, { poster: v.poster }]));
  return (
    <DashboardShell>
      <BackLink href="/recovery" label="Recovery" />
      <h1 className="mt-3 text-4xl font-bold tracking-tight">Film your demos</h1>
      <p className="mt-2 text-white/55">Every clip the mobility screen, daily flows and recovery routines use. Film one and it goes live for your athletes right away.</p>
      <FilmList shots={shotList()} done={done} />
    </DashboardShell>
  );
}
