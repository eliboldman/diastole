import Link from "next/link";

import EmptyState from "@/components/EmptyState";

import { CalendarRange, Orbit } from "lucide-react";

import DashboardShell from "@/components/layout/DashboardShell";
import QuickLinks from "@/components/layout/QuickLinks";
import { createClient, requireCoach } from "@/lib/supabase/server";

import InviteForm from "./InviteForm";
import RemoveAthlete from "./RemoveAthlete";

export default async function AthletesPage() {
  const coach = await requireCoach();
  const supabase = await createClient();

  const [{ data: athletes }, { data: connections }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, created_at").eq("coach_id", coach.id).eq("is_test", false).order("full_name"),
    supabase.from("device_connections").select("athlete_id, source, last_synced_at"),
  ]);

  const deviceFor = (id: string) => connections?.find((c) => c.athlete_id === id);

  return (
    <DashboardShell>
      <div className="relative z-10">
        <p className="text-sm uppercase tracking-[0.25em] text-white/50">Roster</p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">Athletes</h1>
        <QuickLinks
          links={[
            { href: "/pods", label: "Pods", icon: <Orbit size={16} aria-hidden /> },
            { href: "/calendar", label: "Calendar", icon: <CalendarRange size={16} aria-hidden /> },
          ]}
        />
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-white/55">
          Invite an athlete by email. They&apos;ll get a sign-in link, then connect their Garmin or Apple Watch.
        </p>

        <section className="mt-10 rounded-[28px] border border-white/10 bg-white/[0.06] p-6 backdrop-blur-2xl">
          <h2 className="mb-4 text-lg font-medium">Invite an athlete</h2>
          <InviteForm />
        </section>

        <section className="mt-6 grid gap-3">
          {(athletes ?? []).map((a) => {
            const device = deviceFor(a.id);
            const isMe = a.id === coach.id;
            return (
              <div
                key={a.id}
                className="row-in flex flex-col gap-2 rounded-[24px] border border-white/10 bg-white/[0.05] p-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <Link href={`/athlete/${a.id}`} className="min-w-0 hover:underline">
                  <p className="font-medium">
                    {a.full_name || a.email} {isMe && <span className="text-sm text-white/50">(you)</span>}
                  </p>
                  <p className="text-sm text-white/55">{a.email}</p>
                </Link>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span
                    className={`h-2 w-2 rounded-full ${device ? "bg-emerald-300 glow-green" : "bg-white/25"}`}
                  />
                  <span className={device ? "text-emerald-200" : "text-white/60"}>
                    {device ? `${device.source === "garmin" ? "Garmin" : "Apple Watch"} connected` : "No device yet"}
                  </span>
                  {isMe && !device && (
                    <Link href="/connect" className="ml-3 inline-flex min-h-11 items-center text-emerald-200/80 hover:underline">
                      Connect yours →
                    </Link>
                  )}
                  {!isMe && (
                    <span className="ml-auto sm:ml-3">
                      <RemoveAthlete id={a.id} name={a.full_name || a.email || "this athlete"} hasGarmin={device?.source === "garmin"} />
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          {!athletes?.length && (
            <EmptyState emoji="👋" title="No athletes yet">
              Invite your first athlete with the form above. They get an email link, and their watch data shows up here once they connect.
            </EmptyState>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
