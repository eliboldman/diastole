import type { Metadata } from "next";
import Link from "next/link";

import DashboardShell from "@/components/layout/DashboardShell";
import { createClient, requireCoach } from "@/lib/supabase/server";

import { DEFAULT_SETTINGS, monthToDateSpend } from "@/lib/ai/coach";

import AiSettingsForm from "./AiSettingsForm";
import SettingsForm from "./SettingsForm";

export const metadata: Metadata = { title: "Settings · Diastole" };

export default async function SettingsPage() {
  const me = await requireCoach();
  const supabase = await createClient();
  const [{ data: profile }, { data: aiRow }, spent] = await Promise.all([
    supabase.from("profiles").select("full_name, timezone").eq("id", me.id).single(),
    supabase.from("coach_settings").select("ai_enabled, ai_model, ai_monthly_cap_usd").eq("coach_id", me.id).maybeSingle(),
    monthToDateSpend(me.id),
  ]);
  const ai = { ...DEFAULT_SETTINGS, ...(aiRow ?? {}) };

  return (
    <DashboardShell>
      <p className="text-sm uppercase tracking-[0.25em] text-white/50">Account</p>
      <h1 className="mt-3 text-4xl font-bold tracking-tight">Settings</h1>

      <section className="mt-8 rounded-[28px] border border-white/10 bg-white/[0.06] p-6 backdrop-blur-2xl">
        <h2 className="mb-4 text-lg font-medium">Profile</h2>
        <SettingsForm fullName={profile?.full_name ?? ""} timezone={profile?.timezone ?? "America/Chicago"} />
      </section>

      <section className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.06] p-6 backdrop-blur-2xl">
        <h2 className="mb-1 text-lg font-medium">Coaching assistant</h2>
        <p className="mb-4 text-sm text-white/50">
          Each morning, athletes flagged yellow or red are reviewed by Claude, which proposes changes for you to approve. When a
          running-form issue shows up across several runs, Claude also suggests drills or library workouts. Their readiness,
          wellness, training and running-form data (never routes) is sent to Anthropic for this.
        </p>
        <AiSettingsForm enabled={ai.ai_enabled} model={ai.ai_model} cap={Number(ai.ai_monthly_cap_usd)} spent={spent} />
      </section>

      <section className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.06] p-6 backdrop-blur-2xl">
        <h2 className="text-lg font-medium">Your own watch</h2>
        <p className="mt-2 text-sm text-white/55">You&apos;re also an athlete on your roster, so your own data shows on Today.</p>
        <Link href="/connect" className="mt-4 inline-block text-sm text-emerald-200 hover:underline">
          Manage device connection →
        </Link>
      </section>

      <section className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.06] p-6 backdrop-blur-2xl">
        <h2 className="text-lg font-medium">Garmin feed</h2>
        <p className="mt-2 text-sm text-white/55">Every delivery Garmin sends, including rejected or failed ones.</p>
        <Link href="/garmin-log" className="mt-4 inline-block text-sm text-emerald-200 hover:underline">
          View Garmin deliveries →
        </Link>
      </section>
    </DashboardShell>
  );
}
