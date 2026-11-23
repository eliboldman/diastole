import type { Metadata } from "next";

import HoldCheck from "@/components/breath/HoldCheck";
import BackLink from "@/components/layout/BackLink";
import DashboardShell from "@/components/layout/DashboardShell";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "CO₂ check · Diastole" };

/** The seated CO2 hold check. */
export default async function HoldPage() {
  const me = await requireUser();
  return (
    <DashboardShell role={me.role === "coach" ? "coach" : "athlete"}>
      <BackLink href="/recovery/breathe" label="Breathe" />
      <h1 className="mt-3 text-3xl font-bold tracking-tight">CO₂ check</h1>
      <p className="mt-2 text-white/55">About two minutes. Best first thing in the morning, the same way each time.</p>
      <HoldCheck />
    </DashboardShell>
  );
}
