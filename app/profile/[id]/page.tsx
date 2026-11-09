import type { Metadata } from "next";
import { notFound } from "next/navigation";

import BackLink from "@/components/layout/BackLink";
import DashboardShell from "@/components/layout/DashboardShell";
import ProfileView from "@/components/profile/ProfileView";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Profile · Diastole" };

const UUID = /^[0-9a-f-]{36}$/i;

/** Someone else's profile (a coach's athlete or a pod mate). Your own lives on the Me tab. */
export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  // No redirects here: this route has a loading screen, and a redirect after it has started
  // crashes in-app navigation (React error #310). Your own profile simply shows here.
  const raw = (await params).id;
  const id = raw === "me" ? me.id : raw;
  if (!UUID.test(id)) notFound();
  return (
    <DashboardShell role={me.role === "coach" ? "coach" : "athlete"}>
      <BackLink href={me.role === "coach" ? "/athletes" : "/me/pods"} label={me.role === "coach" ? "Athletes" : "Pods"} />
      <div className="mt-2">
        <ProfileView id={id} me={me} />
      </div>
    </DashboardShell>
  );
}
