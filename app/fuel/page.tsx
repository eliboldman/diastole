import type { Metadata } from "next";

import FuelView from "@/components/fuel/FuelView";
import DashboardShell from "@/components/layout/DashboardShell";
import { getFuelDays, getFuelMode } from "@/lib/fuel/data";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Fuel · Diastole" };

export default async function FuelPage() {
  const me = await requireUser();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: me.timezone });
  const [mode, days] = await Promise.all([getFuelMode(me.id), getFuelDays(me.id, today, 7)]);
  return (
    <DashboardShell role={me.role === "coach" ? "coach" : "athlete"}>
      <FuelView mode={mode} days={days} />
    </DashboardShell>
  );
}
