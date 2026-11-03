import type { Metadata } from "next";
import Link from "next/link";

import DashboardShell from "@/components/layout/DashboardShell";
import { createClient, requireCoach } from "@/lib/supabase/server";

import SettingsForm from "./SettingsForm";

export const metadata: Metadata = { title: "Settings · Diastole" };

export default async function SettingsPage() {
  const me = await requireCoach();
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("full_name, timezone").eq("id", me.id).single();

  return (
    <DashboardShell>
      <p className="text-sm uppercase tracking-[0.25em] text-white/35">Account</p>
      <h1 className="mt-3 text-4xl font-bold tracking-tight">Settings</h1>

      <section className="mt-8 rounded-[28px] border border-white/10 bg-white/[0.035] p-6 backdrop-blur-2xl">
        <h2 className="mb-4 text-lg font-medium">Profile</h2>
        <SettingsForm fullName={profile?.full_name ?? ""} timezone={profile?.timezone ?? "America/Chicago"} />
      </section>

      <section className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.035] p-6 backdrop-blur-2xl">
        <h2 className="text-lg font-medium">Your own watch</h2>
        <p className="mt-2 text-sm text-white/55">You&apos;re also an athlete on your roster, so your own data shows on Today.</p>
        <Link href="/connect" className="mt-4 inline-block text-sm text-emerald-200 hover:underline">
          Manage device connection →
        </Link>
      </section>
    </DashboardShell>
  );
}
