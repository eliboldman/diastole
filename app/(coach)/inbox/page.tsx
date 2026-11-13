import type { Metadata } from "next";

import InboxList from "@/components/inbox/InboxList";
import DashboardShell from "@/components/layout/DashboardShell";
import { getInbox } from "@/lib/inbox/data";
import { createClient, requireCoach } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Approvals · Diastole" };

export default async function InboxPage() {
  const coach = await requireCoach();
  const items = await getInbox(await createClient(), coach.id);
  return (
    <DashboardShell>
      <p className="text-xs uppercase tracking-[0.3em] text-emerald-200/60">Waiting on you</p>
      <h1 className="mt-2 text-3xl font-medium tracking-tight sm:text-4xl">Approvals</h1>
      <p className="mt-2 max-w-2xl text-sm text-white/55">Bosses, AI suggestions, plan changes, workout requests, strength progressions, morning messages and pod episodes in one place. Nothing reaches an athlete until you approve it here or on its own screen.</p>
      <InboxList initial={items} />
    </DashboardShell>
  );
}
