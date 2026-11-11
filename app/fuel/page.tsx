import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import FuelLog from "@/components/fuel/FuelLog";
import FuelView from "@/components/fuel/FuelView";
import DashboardShell from "@/components/layout/DashboardShell";
import { getFuelDays, getFuelMode, getMealDay } from "@/lib/fuel/data";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Fuel · Diastole" };

export default async function FuelPage({ searchParams }: { searchParams: Promise<{ log?: string; via?: string }> }) {
  const me = await requireUser();
  const { log, via } = await searchParams;
  const start = via === "photo" || via === "scan" || via === "describe" ? via : undefined;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: me.timezone });
  const [mode, days] = await Promise.all([getFuelMode(me.id), getFuelDays(me.id, today, 7)]);
  const meals = mode === "workout" ? null : await getMealDay(me.id, today, me.timezone, days[0].level);
  return (
    <DashboardShell role={me.role === "coach" ? "coach" : "athlete"}>
      <FuelView mode={mode} days={days} log={meals && <FuelLog day={meals} mode={mode} timeZone={me.timezone} units={me.units} autoOpen={log === "1"} start={start} />} />
      <Link href="/races" className="lift mt-6 flex items-center justify-between gap-3 rounded-[28px] border border-white/10 bg-white/[0.055] p-5">
        <span>
          <span className="block font-medium">Race fueling</span>
          <span className="block text-sm text-white/55">Race plans, sweat-rate test and gut training</span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-white/40" aria-hidden />
      </Link>
    </DashboardShell>
  );
}
