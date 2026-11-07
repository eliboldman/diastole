import type { Metadata } from "next";

import AvatarCreator from "@/components/avatar/AvatarCreator";
import BackLink from "@/components/layout/BackLink";
import DashboardShell from "@/components/layout/DashboardShell";
import { refreshProgress, todayState } from "@/lib/avatar/progress";
import { createAdminClient, createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Your avatar · Diastole" };

export default async function EditAvatarPage() {
  const me = await requireUser();
  const supabase = await createClient();
  const [{ data: avatar }, progress, today] = await Promise.all([
    supabase.from("avatars").select("look").eq("athlete_id", me.id).maybeSingle(),
    refreshProgress(createAdminClient(), me.id, me.timezone),
    todayState(supabase, me.id),
  ]);
  return (
    <DashboardShell role={me.role === "coach" ? "coach" : "athlete"}>
      <BackLink href="/account" label="Me" />
      <h1 className="mt-3 mb-6 text-3xl font-bold tracking-tight">Your avatar</h1>
      <AvatarCreator initial={avatar?.look ?? null} state={{ mood: today.mood, strain: today.strain, aura: progress.aura, badges: progress.badges }} />
    </DashboardShell>
  );
}
