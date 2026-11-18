import type { Metadata } from "next";

import BackLink from "@/components/layout/BackLink";
import DashboardShell from "@/components/layout/DashboardShell";
import ScreenWizard from "@/components/mobility/ScreenWizard";
import { TESTS } from "@/lib/mobility/screen";
import { videoMap } from "@/lib/recovery/data";
import { createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Mobility screen · Diastole" };

/** The eight-test mobility screen. About ten minutes; a wall, a tape measure and a broomstick help. */
export default async function MobilityScreenPage() {
  const me = await requireUser();
  const supabase = await createClient();
  const media = await videoMap(supabase);
  return (
    <DashboardShell role={me.role === "coach" ? "coach" : "athlete"}>
      <BackLink href="/recovery/mobility" label="Mobility" />
      <h1 className="mt-3 text-3xl font-bold tracking-tight">Mobility screen</h1>
      <p className="mt-2 text-white/55">Eight quick tests, about 10 minutes. You&apos;ll want a wall, a tape measure or ruler, and a broomstick or towel.</p>
      <ScreenWizard tests={TESTS} media={media} />
    </DashboardShell>
  );
}
