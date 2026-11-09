import type { Metadata } from "next";

import BackLink from "@/components/layout/BackLink";
import DashboardShell from "@/components/layout/DashboardShell";
import ProfileView from "@/components/profile/ProfileView";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Goals & progress · Diastole" };

/** Your goal race and block, your numbers over time (metric cards) and recent PRs. */
export default async function ProgressPage() {
  const me = await requireUser();
  const header = (
    <div className="mx-auto max-w-3xl">
      <BackLink href="/account" label="Me" />
      <h1 className="mt-3 text-4xl font-bold tracking-tight">Goals &amp; progress</h1>
      <p className="mt-2 text-white/55">Your goal race, your numbers over time and recent PRs. Change your numbers in My setup.</p>
    </div>
  );
  return (
    <DashboardShell role={me.role === "coach" ? "coach" : "athlete"}>
      <ProfileView id={me.id} me={me} header={header} order={["goals", "metrics", "prs"]} hero="none" />
    </DashboardShell>
  );
}
