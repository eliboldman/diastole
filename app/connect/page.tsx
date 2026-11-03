import type { Metadata } from "next";
import Link from "next/link";

import PublicShell from "@/components/PublicShell";
import { garminConfigured } from "@/lib/garmin/client";
import { createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Connect your device · Diastole" };

const garminMessages: Record<string, { text: string; ok: boolean }> = {
  connected: { text: "Garmin connected. New data will arrive after your watch next syncs.", ok: true },
  disconnected: { text: "Garmin disconnected. We've stopped receiving your data.", ok: true },
  declined: { text: "Garmin access wasn't granted. You can try again anytime.", ok: false },
  expired: { text: "That Garmin sign-in timed out. Please try again.", ok: false },
  error: { text: "Something went wrong connecting Garmin. Please try again.", ok: false },
  unavailable: { text: "Garmin connections aren't switched on yet.", ok: false },
};

export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ garmin?: string }>;
}) {
  const profile = await requireUser();
  const message = garminMessages[(await searchParams).garmin ?? ""];
  const supabase = await createClient();
  const { data: connections } = await supabase
    .from("device_connections")
    .select("source, connected_at, last_synced_at")
    .eq("athlete_id", profile.id);

  const connected = new Set((connections ?? []).map((c) => c.source));
  const firstName = profile.full_name?.split(" ")[0];

  return (
    <PublicShell>
      <div className="mx-auto max-w-xl pt-16">
        <p className="text-xs uppercase tracking-[0.3em] text-emerald-200/60">Welcome{firstName ? `, ${firstName}` : ""}</p>
        <h1 className="mt-3 text-3xl font-medium tracking-tight">Connect your watch</h1>
        <p className="mt-3 text-white/55">
          Choose the watch you wear every day. Diastole only reads data from today forward, and you
          can disconnect anytime.
        </p>

        {message && (
          <p
            className={`mt-6 rounded-2xl border p-3 text-sm ${
              message.ok ? "border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-100" : "border-red-300/20 bg-red-300/[0.06] text-red-200"
            }`}
          >
            {message.text}
          </p>
        )}

        <div className="mt-10 space-y-4">
          <DeviceCard
            title="Garmin"
            connected={connected.has("garmin")}
            body="Sign in with your Garmin Connect account and approve access to your health and activity data."
            disconnect={
              <form action="/api/garmin/disconnect" method="post">
                <button className="text-sm text-white/40 hover:text-white/70">Disconnect Garmin</button>
              </form>
            }
            action={
              garminConfigured() ? (
                <a href="/api/garmin/connect" className={buttonClass}>Connect Garmin</a>
              ) : (
                <span className={`${buttonClass} pointer-events-none opacity-40`}>Coming soon</span>
              )
            }
          />
          <DeviceCard
            title="Apple Watch"
            connected={connected.has("apple")}
            body="Install the Diastole iPhone app, sign in with this same email, and allow access to Health data."
            action={<span className={`${buttonClass} pointer-events-none opacity-40`}>iPhone app coming soon</span>}
          />
        </div>

        <div className="mt-12 flex items-center justify-between text-sm text-white/40">
          {profile.role === "coach" ? (
            <Link href="/dashboard" className="hover:text-white/70">← Back to dashboard</Link>
          ) : (
            <Link href="/me" className="hover:text-white/70">← My Diastole</Link>
          )}
          <form action="/auth/signout" method="post">
            <button className="hover:text-white/70">Sign out</button>
          </form>
        </div>
      </div>
    </PublicShell>
  );
}

const buttonClass =
  "inline-block rounded-2xl border border-emerald-300/25 bg-emerald-300/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition-colors hover:bg-emerald-300/20";

function DeviceCard({
  title,
  body,
  connected,
  action,
  disconnect,
}: {
  title: string;
  body: string;
  connected: boolean;
  action: React.ReactNode;
  disconnect?: React.ReactNode;
}) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-white/[0.035] p-6 backdrop-blur-2xl">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-medium">{title}</h2>
        {connected && (
          <span className="flex items-center gap-2 text-sm text-emerald-200">
            <span className="glow-green h-2 w-2 rounded-full bg-emerald-300" /> Connected
          </span>
        )}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-white/55">{body}</p>
      <div className="mt-5">{connected ? disconnect : action}</div>
    </div>
  );
}
