import type { Metadata } from "next";

import AvatarCreator from "@/components/avatar/AvatarCreator";
import BackLink from "@/components/layout/BackLink";
import DashboardShell from "@/components/layout/DashboardShell";
import { refreshProgress } from "@/lib/avatar/progress";
import { createAdminClient, createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Your avatar · Diastole" };

export default async function EditAvatarPage() {
  const me = await requireUser();
  const supabase = await createClient();
  const [{ data: avatar }, progress] = await Promise.all([
    supabase.from("avatars").select("look").eq("athlete_id", me.id).maybeSingle(),
    refreshProgress(createAdminClient(), me.id, me.timezone),
  ]);
  return (
    <DashboardShell role={me.role === "coach" ? "coach" : "athlete"}>
      <BackLink href={`/profile/${me.id}`} label="Your profile" />
      <h1 className="mt-3 text-3xl font-bold tracking-tight">Your avatar</h1>
      <p className="mt-1 mb-6 text-sm text-white/55">Make it yours. Some gear unlocks through real training milestones.</p>
      <AvatarCreator initial={avatar?.look ?? null} unlocked={[...progress.unlocked]} state={{ aura: progress.aura, badges: progress.badges }} />
    </DashboardShell>
  );
}
