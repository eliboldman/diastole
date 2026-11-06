import type { Metadata } from "next";

import FuelLog from "@/components/fuel/FuelLog";
import FuelView from "@/components/fuel/FuelView";
import DashboardShell from "@/components/layout/DashboardShell";
import { getFuelDays, getFuelMode, getMealDay } from "@/lib/fuel/data";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Fuel · Diastole" };

export default async function FuelPage({ searchParams }: { searchParams: Promise<{ log?: string }> }) {
  const me = await requireUser();
  const { log } = await searchParams;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: me.timezone });
  const [mode, days] = await Promise.all([getFuelMode(me.id), getFuelDays(me.id, today, 7)]);
  const meals = mode === "workout" ? null : await getMealDay(me.id, today, me.timezone, days[0].level);
  return (
    <DashboardShell role={me.role === "coach" ? "coach" : "athlete"}>
      <FuelView mode={mode} days={days} log={meals && <FuelLog day={meals} mode={mode} timeZone={me.timezone} units={me.units} autoOpen={log === "1"} />} />
    </DashboardShell>
  );
}
