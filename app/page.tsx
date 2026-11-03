import Link from "next/link";

import PublicShell from "@/components/PublicShell";
import { SITE } from "@/lib/site";

const steps = [
  {
    tone: "green",
    title: "Connect",
    body: "Athletes link their Garmin or Apple Watch with their own permission. Diastole reads HRV, resting heart rate, sleep, stress and workouts from that day forward.",
  },
  {
    tone: "yellow",
    title: "Read",
    body: "Each morning, every athlete is compared to their own rolling baseline, not a population average. Recovery, sleep, stress and training load each get a green, yellow or red flag with a plain-language note.",
  },
  {
    tone: "red",
    title: "Adjust",
    body: "Their coach sees the whole team at a glance, adjusts the plan, and sends structured workouts straight to the athlete's watch. Nothing is sent without the coach's confirmation.",
  },
] as const;

const dot = {
  green: "glow-green bg-emerald-300/80",
  yellow: "glow-yellow bg-amber-300/80",
  red: "glow-red bg-red-400/80",
};

export default function Home() {
  return (
    <PublicShell>
      <section className="flex flex-col items-center pt-20 text-center sm:pt-28">
        <div className="relative mb-12 flex h-40 w-40 items-center justify-center">
          <div className="monitored-hero-breathe absolute inset-0 rounded-full border border-emerald-300/15 bg-emerald-300/[0.04]" />
          <div className="glow-green absolute inset-8 rounded-full border border-emerald-300/25 bg-emerald-300/[0.08]" />
          <div className="glow-red h-4 w-4 rounded-full bg-emerald-200/90" />
        </div>

        <p className="mb-4 text-xs uppercase tracking-[0.3em] text-emerald-200/60">
          di·as·to·le — the moment the heart rests and refills
        </p>

        <h1 className="max-w-3xl text-4xl font-medium leading-tight tracking-tight sm:text-6xl">
          {SITE.tagline}
        </h1>

        <p className="mt-6 max-w-2xl text-base leading-relaxed text-white/60 sm:text-lg">
          {SITE.name}{" "}is a coaching platform for endurance athletes. It reads recovery from each
          athlete&apos;s wearable so their coach can shape training around how the body is actually
          adapting, day by day.
        </p>

        <Link
          href="/login"
          className="mt-10 inline-flex min-h-12 items-center rounded-full border border-emerald-300/30 bg-emerald-300/15 px-8 text-base font-medium text-emerald-50 transition active:scale-95 hover:bg-emerald-300/25"
        >
          Log in
        </Link>
      </section>

      <section className="stagger mt-24 grid gap-4 sm:grid-cols-3">
        {steps.map((step) => (
          <div
            key={step.title}
            className="lift rounded-[28px] border border-white/10 bg-white/[0.06] p-6 backdrop-blur-2xl"
          >
            <span className={`mb-5 block h-2.5 w-2.5 rounded-full ${dot[step.tone]}`} />
            <h2 className="mb-2 text-lg font-medium">{step.title}</h2>
            <p className="text-sm leading-relaxed text-white/55">{step.body}</p>
          </div>
        ))}
      </section>

      <section className="mt-16 rounded-[28px] border border-white/10 bg-white/[0.045] p-6 text-sm leading-relaxed text-white/55 sm:p-8">
        <h2 className="mb-2 text-base font-medium text-white">Your data stays yours</h2>
        <p>
          {SITE.name} is used by invited athletes and their coach. Health data is only visible to
          the athlete and their coach, is never sold or used for advertising, and can be
          disconnected or deleted at any time. Read the{" "}
          <Link href="/privacy" className="text-emerald-200/80 underline-offset-4 hover:underline">
            privacy policy
          </Link>
          .
        </p>
      </section>
    </PublicShell>
  );
}
