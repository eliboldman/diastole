import type { Metadata } from "next";

import AskChat from "@/components/ask/AskChat";
import DashboardShell from "@/components/layout/DashboardShell";
import { requireCoach } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Ask Diastole · Diastole" };

/** Coach-only: questions about your athletes, answered from their real data. */
export default async function AskPage() {
  await requireCoach();
  return (
    <DashboardShell>
      <h1 className="text-4xl font-bold tracking-tight">Ask Diastole</h1>
      <p className="mt-2 text-white/55">Your athletes&apos; workouts, recovery, check-ins and plans, in plain answers. Uses your AI budget.</p>
      <div className="mt-6">
        <AskChat />
      </div>
    </DashboardShell>
  );
}
