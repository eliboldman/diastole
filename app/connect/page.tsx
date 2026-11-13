import SyncRepairCard from "@/components/devices/SyncRepairCard";
import { staleDevice } from "@/lib/devices/stale";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import AppleConnect from "@/components/AppleConnect";
import OnboardingProgress from "@/components/OnboardingProgress";
import AthleteShell from "@/components/AthleteShell";
import BackLink from "@/components/layout/BackLink";
import PublicShell from "@/components/PublicShell";
import { garminConfigured } from "@/lib/garmin/client";
import { createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Connections · Diastole" };

const garminMessages: Record<string, { text: string; ok: boolean }> = {
  connected: {
    text: "Garmin connected. New data will arrive after your watch next syncs.",
    ok: true,
  },
  disconnected: {
    text: "Garmin disconnected. We've stopped receiving your data.",
    ok: true,
  },
  declined: {
    text: "Garmin access wasn't granted. You can try again anytime.",
    ok: false,
  },
  expired: {
    text: "That Garmin sign-in timed out. Please try again.",
    ok: false,
  },
  error: {
    text: "Something went wrong connecting Garmin. Please try again.",
    ok: false,
  },
  unavailable: {
    text: "Garmin connections aren't switched on yet.",
    ok: false,
  },
};

export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ garmin?: string }>;
}) {
  const profile = await requireUser();
  const garmin = (await searchParams).garmin ?? "";
  const message = garminMessages[garmin];
  const supabase = await createClient();
  const { data: connections } = await supabase
    .from("device_connections")
    .select("source, connected_at, last_synced_at")
    .eq("athlete_id", profile.id);

  const connected = new Set((connections ?? []).map((c) => c.source));
  const stale = await staleNow(connections);
  const firstName = profile.full_name?.split(" ")[0];
  const isAthlete = profile.role === "athlete";

  // New athlete who just connected: step 3, "you're all set".
  if (isAthlete && garmin === "connected" && connected.size > 0) {
    return (
      <PublicShell signedIn>
        <div className="mx-auto max-w-xl pt-16">
          <OnboardingProgress step={3} />
          <div className="relative mx-auto flex h-24 w-24 items-center justify-center">
            <span
              className="success-ring absolute inset-0 rounded-full border border-emerald-300/50"
              aria-hidden
            />
            <span className="success-pop flex h-20 w-20 items-center justify-center rounded-full bg-emerald-300/90 text-3xl font-semibold text-emerald-950 shadow-[0_0_60px_color-mix(in_oklab,var(--color-emerald-300)_35%,transparent)]">
              ✓
            </span>
          </div>
          <h1
            className="row-in mt-8 text-center text-3xl font-medium tracking-tight"
            style={{ animationDelay: "250ms" }}
          >
            You&apos;re all set{firstName ? `, ${firstName}` : ""}
          </h1>
          <ul className="stagger mx-auto mt-8 max-w-md space-y-3 text-sm text-white/70">
            <li className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
              <span className="font-medium text-white">Next watch sync:</span>{" "}
              your sleep, HRV, heart rate and workouts start flowing in. You
              don&apos;t need to do anything.
            </li>
            <li className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
              <span className="font-medium text-white">First week:</span>{" "}
              Diastole learns your normal. Readiness flags start once it has
              about seven days.
            </li>
            <li className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
              <span className="font-medium text-white">Workouts:</span> when
              your coach sends one, it lands on your Garmin calendar and watch.
            </li>
          </ul>
          <Link
            href="/me/setup#week"
            className="lift mx-auto mt-6 block max-w-md rounded-2xl border border-emerald-300/30 bg-emerald-300/[0.1] p-4 text-sm"
          >
            <span className="font-medium text-white">When do you train and sleep? →</span>
            <span className="mt-1 block text-white/60">
              One minute: your usual training times and wake time. Your
              workouts land at those times, and Today shows a bedtime that
              gets you the sleep you need.
            </span>
          </Link>
          <Link
            href="/me/import"
            className="lift mx-auto mt-3 block max-w-md rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.06] p-4 text-sm"
          >
            <span className="font-medium text-white">
              Optional: import your Garmin history →
            </span>
            <span className="mt-1 block text-white/60">
              Skip the week of waiting: your past months give Diastole a
              baseline today.
            </span>
          </Link>
          <div className="mt-8 flex justify-center">
            <Link
              href="/me"
              className="flex min-h-12 items-center rounded-full border border-emerald-300/30 bg-emerald-300/20 px-8 font-medium text-emerald-50 transition active:scale-95 hover:bg-emerald-300/30"
            >
              Go to my home →
            </Link>
          </div>
        </div>
      </PublicShell>
    );
  }
  const onboarding = isAthlete && connected.size === 0;

  // Onboarding stays a focused, menu-free screen; afterwards this is the Device page in the app.
  return (
    <DeviceShell onboarding={onboarding} isCoach={!isAthlete}>
      <div className={`mx-auto max-w-xl ${onboarding ? "pt-16" : ""}`}>
        {onboarding ? (
          <>
            <OnboardingProgress step={2} />
            <p className="text-xs uppercase tracking-[0.3em] text-emerald-200/60">
              Welcome{firstName ? `, ${firstName}` : ""}
            </p>
            <h1 className="mt-3 text-3xl font-medium tracking-tight">
              Connect your watch
            </h1>
            <p className="mt-3 text-white/55">
              Choose the watch you wear every day. Diastole only reads data from
              today forward, and you can disconnect anytime.
            </p>
          </>
        ) : (
          <>
            <BackLink href="/account" label="Me" />
            <h1 className="mt-3 text-3xl font-medium tracking-tight">Connections</h1>
            <p className="mt-3 text-white/55">
              Your watch, your trainer apps and getting older workouts in. Everything that talks to Diastole, in one place.
            </p>
          </>
        )}

        {stale && <SyncRepairCard {...stale} />}
        {message && (
          <p
            className={`mt-6 rounded-2xl border p-3 text-sm ${
              message.ok
                ? "border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-100"
                : "border-red-300/20 bg-red-300/[0.06] text-red-200"
            }`}
          >
            {message.text}
          </p>
        )}

        <div className="stagger mt-10 space-y-4">
          <DeviceCard
            title="Garmin"
            connected={connected.has("garmin")}
            body="Sign in with your Garmin Connect account and approve access to your health and activity data."
            disconnect={
              <div className="flex flex-wrap items-center justify-end gap-2">
                <a href="/api/garmin/connect" className="inline-flex min-h-11 items-center text-sm text-emerald-200 hover:underline">
                  Reconnect
                </a>
                <form action="/api/garmin/disconnect" method="post">
                  <button className="min-h-11 text-sm text-white/55 hover:text-white/70">
                    Disconnect Garmin
                  </button>
                </form>
              </div>
            }
            action={
              garminConfigured() ? (
                <a href="/api/garmin/connect" className={buttonClass}>
                  Connect Garmin
                </a>
              ) : (
                <span
                  className={`${buttonClass} pointer-events-none opacity-40`}
                >
                  Coming soon
                </span>
              )
            }
          />
          <DeviceCard
            title="Apple Watch"
            connected={connected.has("apple")}
            body="In the Diastole iPhone app, tap Connect and allow Apple Health access. Your workouts, sleep, HRV and resting heart rate sync each time you open the app, and workouts from your coach show up in the Workout app on your watch."
            disconnect={<AppleConnect connected garmin={connected.has("garmin")} />}
            action={<AppleConnect connected={false} garmin={connected.has("garmin")} />}
          />
          <ConnRow href="/me/intervals" title="Zwift & Rouvy" sub="Your coach's bike workouts on your smart trainer, through intervals.icu" />
          <ConnRow href="/me/devices" title="Watch & TV apps" sub="Today's plan on your Garmin, bike workouts on Apple TV" />
        </div>

        {!onboarding && (
          <>
            <h2 className="mb-3 mt-10 px-1 text-xs font-medium uppercase tracking-[0.2em] text-white/45">Bring workouts in</h2>
            <div className="space-y-4">
              {connected.has("garmin") && (
                <ConnRow href="/me/import" title="Import Garmin history" sub="Past months of health data, plus charts and laps for past workouts" />
              )}
              <ConnRow href="/me/upload" title="Upload a workout file" sub="A .fit file from any app that doesn't sync on its own" />
            </div>
          </>
        )}

        <div className="mt-12 flex items-center justify-between text-sm text-white/55">
          {onboarding ? (
            <Link
              href="/me"
              className="flex min-h-11 items-center hover:text-white/70"
            >
              Skip for now →
            </Link>
          ) : (
            <span />
          )}
          <form action="/auth/signout" method="post">
            <button className="min-h-11 hover:text-white/70">Sign out</button>
          </form>
        </div>
      </div>
    </DeviceShell>
  );
}

function DeviceShell({ onboarding, isCoach, children }: { onboarding: boolean; isCoach: boolean; children: ReactNode }) {
  return onboarding ? <PublicShell signedIn>{children}</PublicShell> : <AthleteShell isCoach={isCoach}>{children}</AthleteShell>;
}

const buttonClass =
  "inline-flex min-h-12 items-center rounded-2xl border border-emerald-300/25 bg-emerald-300/15 px-5 text-sm font-medium text-emerald-50 transition active:scale-95 hover:bg-emerald-300/25";

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
    <div className="rounded-[28px] border border-white/10 bg-white/[0.06] p-6 backdrop-blur-2xl">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-medium">{title}</h2>
        {connected && (
          <span className="flex items-center gap-2 text-sm text-emerald-200">
            <span className="glow-green h-2 w-2 rounded-full bg-emerald-300" />{" "}
            Connected
          </span>
        )}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-white/55">{body}</p>
      <div className="mt-5">{connected ? disconnect : action}</div>
    </div>
  );
}

function ConnRow({ href, title, sub }: { href: string; title: string; sub: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-14 min-w-0 items-center justify-between gap-3 rounded-[24px] border border-white/10 bg-white/[0.05] px-5 py-4 transition hover:border-white/20 active:scale-[0.99]"
    >
      <span className="min-w-0">
        <span className="block font-medium">{title}</span>
        <span className="block text-sm text-white/55">{sub}</span>
      </span>
      <span aria-hidden className="text-white/40">→</span>
    </Link>
  );
}

async function staleNow(conns: Parameters<typeof staleDevice>[0]) {
  return staleDevice(conns, Date.now());
}
