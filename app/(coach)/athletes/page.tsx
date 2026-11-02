import Link from "next/link";

import DashboardShell from "@/components/layout/DashboardShell";
import PhysiologyBackground from "@/components/PhysiologyBackground";
import { createClient, requireCoach } from "@/lib/supabase/server";

import InviteForm from "./InviteForm";

export default async function AthletesPage() {
  const coach = await requireCoach();
  const supabase = await createClient();

  const [{ data: athletes }, { data: connections }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, created_at").eq("coach_id", coach.id).order("full_name"),
    supabase.from("device_connections").select("athlete_id, source, last_synced_at"),
  ]);

  const deviceFor = (id: string) => connections?.find((c) => c.athlete_id === id);

  return (
    <DashboardShell>
      <PhysiologyBackground variant="atmosphere" stressOpacity={0.08} systemTone="green" />

      <div className="relative z-10">
        <p className="text-sm uppercase tracking-[0.25em] text-white/35">Roster</p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">Athletes</h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-white/55">
          Invite an athlete by email. They&apos;ll get a sign-in link, then connect their Garmin or Apple Watch.
        </p>

        <section className="mt-10 rounded-[28px] border border-white/10 bg-white/[0.035] p-6 backdrop-blur-2xl">
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
                className="flex flex-col gap-2 rounded-[24px] border border-white/10 bg-white/[0.025] p-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">
                    {a.full_name || a.email} {isMe && <span className="text-sm text-white/35">(you)</span>}
                  </p>
                  <p className="text-sm text-white/40">{a.email}</p>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span
                    className={`h-2 w-2 rounded-full ${device ? "bg-emerald-300 glow-green" : "bg-white/25"}`}
                  />
                  <span className={device ? "text-emerald-200" : "text-white/45"}>
                    {device ? `${device.source === "garmin" ? "Garmin" : "Apple Watch"} connected` : "No device yet"}
                  </span>
                  {isMe && !device && (
                    <Link href="/connect" className="ml-3 text-emerald-200/80 hover:underline">
                      Connect yours →
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
          {!athletes?.length && <p className="text-white/40">No athletes yet.</p>}
        </section>
      </div>
    </DashboardShell>
  );
}
