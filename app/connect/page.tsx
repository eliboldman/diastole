import type { Metadata } from "next";
import Link from "next/link";

import OnboardingProgress from "@/components/OnboardingProgress";
import PublicShell from "@/components/PublicShell";
import { garminConfigured } from "@/lib/garmin/client";
import { createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Connect your device · Diastole" };

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
            <span className="success-pop flex h-20 w-20 items-center justify-center rounded-full bg-emerald-300/90 text-3xl font-semibold text-emerald-950 shadow-[0_0_60px_rgba(110,231,183,0.35)]">
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
            href="/me/import"
            className="lift mx-auto mt-6 block max-w-md rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.06] p-4 text-sm"
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

  return (
    <PublicShell signedIn>
      <div className="mx-auto max-w-xl pt-16">
        {onboarding && <OnboardingProgress step={2} />}
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link
                  href="/me/import"
                  className="inline-flex min-h-11 items-center text-sm font-medium text-emerald-200 hover:underline"
                >
                  Import your Garmin history →
                </Link>
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
            body="Install the Diastole iPhone app, sign in with this same email, and allow access to Health data."
            action={
              <span className={`${buttonClass} pointer-events-none opacity-40`}>
                iPhone app coming soon
              </span>
            }
          />
        </div>

        <div className="mt-12 flex items-center justify-between text-sm text-white/55">
          {profile.role === "coach" ? (
            <Link
              href="/dashboard"
              className="flex min-h-11 items-center hover:text-white/70"
            >
              ← Back to dashboard
            </Link>
          ) : (
            <Link
              href="/me"
              className="flex min-h-11 items-center hover:text-white/70"
            >
              {onboarding ? "Skip for now →" : "← My Diastole"}
            </Link>
          )}
          <form action="/auth/signout" method="post">
            <button className="min-h-11 hover:text-white/70">Sign out</button>
          </form>
        </div>
      </div>
    </PublicShell>
  );
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
