import { Utensils } from "lucide-react";
import type { Metadata } from "next";

import DashboardShell from "@/components/layout/DashboardShell";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Fuel · Diastole" };

// Placeholder until nutrition is built (roadmap Phase 9).
export default async function FuelPage() {
  const me = await requireUser();
  return (
    <DashboardShell role={me.role === "coach" ? "coach" : "athlete"}>
      <h1 className="text-4xl font-bold tracking-tight">Fuel</h1>
      <section className="mt-8 max-w-xl rounded-[28px] border border-white/10 bg-white/[0.06] p-8 text-center backdrop-blur-2xl">
        <Utensils size={28} className="mx-auto text-emerald-200/80" aria-hidden />
        <h2 className="mt-3 text-lg font-medium">Coming soon</h2>
        <p className="mt-2 text-sm text-white/60">
          Fueling for each workout, before, during and after, with quick photo logging. Food follows training here: no streaks, no red numbers.
        </p>
      </section>
    </DashboardShell>
  );
}
