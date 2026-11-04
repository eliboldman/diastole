import { MessageCircle } from "lucide-react";
import type { Metadata } from "next";

import DashboardShell from "@/components/layout/DashboardShell";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Messages · Diastole" };

// Placeholder until coach–athlete messaging is built (roadmap Phase 4).
export default async function MessagesPage() {
  const me = await requireUser();
  const coach = me.role === "coach";
  return (
    <DashboardShell role={coach ? "coach" : "athlete"}>
      <h1 className="text-4xl font-bold tracking-tight">Messages</h1>
      <section className="mt-8 max-w-xl rounded-[28px] border border-white/10 bg-white/[0.06] p-8 text-center backdrop-blur-2xl">
        <MessageCircle size={28} className="mx-auto text-emerald-200/80" aria-hidden />
        <h2 className="mt-3 text-lg font-medium">Coming soon</h2>
        <p className="mt-2 text-sm text-white/60">
          {coach
            ? "One thread per athlete, plus notes attached to specific workouts, with photos, voice notes and read receipts."
            : "Chat with your coach here, including notes on specific workouts."}
        </p>
      </section>
    </DashboardShell>
  );
}
