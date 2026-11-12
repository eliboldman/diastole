import type { Metadata } from "next";

import AthleteShell from "@/components/AthleteShell";
import DevicePairForm from "@/components/DevicePairForm";
import BackLink from "@/components/layout/BackLink";
import { removeDevice } from "@/lib/devices/actions";
import { createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Watch & TV apps · Diastole" };

const KIND: Record<string, string> = { garmin_watch: "Garmin watch app", garmin_field: "Garmin fuel field", apple_tv: "Apple TV", apple_watch: "Apple Watch app" };

function seen(at: string | null, tz: string) {
  if (!at) return "Not used yet";
  const mins = Math.round((Date.now() - new Date(at).getTime()) / 60_000);
  if (mins < 15) return "Active now";
  return `Last used ${new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: tz })}`;
}

export default async function DevicesPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const me = await requireUser();
  const code = ((await searchParams).code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  const supabase = await createClient();
  const { data: devices } = await supabase.from("device_links").select("id, kind, label, created_at, last_seen_at").eq("athlete_id", me.id).order("created_at", { ascending: false });

  return (
    <AthleteShell isCoach={me.role === "coach"}>
      <BackLink href="/connect" label="Connections" />
      <h1 className="mt-2 text-3xl font-medium tracking-tight">Watch &amp; TV apps</h1>
      <p className="mt-2 max-w-xl text-white/60">
        The Diastole Garmin watch app shows today&apos;s plan and your readiness on your wrist, and asks how a session went when you
        finish. The Diastole Fuel data field buzzes when it&apos;s time to eat and drink during a workout: add it to a data screen and
        start an activity to see its code. The Apple TV app runs your coach&apos;s bike workouts on your smart trainer. Type the code a
        device shows here.
      </p>

      <div className="mt-8 grid max-w-2xl gap-6">
        <DevicePairForm initialCode={code} />

        <section>
          <h2 className="text-sm font-medium text-white/70">Signed-in devices</h2>
          {devices?.length ? (
            <ul className="mt-3 grid gap-3">
              {devices.map((d) => (
                <li key={d.id} className="flex min-w-0 items-center justify-between gap-3 rounded-[20px] border border-white/10 bg-white/[0.04] px-4 py-3">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{d.label || KIND[d.kind] || "Device"}</span>
                    <span className="block truncate text-sm text-white/50">
                      {d.label ? `${KIND[d.kind]} · ` : ""}
                      {seen(d.last_seen_at, me.timezone)}
                    </span>
                  </span>
                  <form action={removeDevice}>
                    <input type="hidden" name="id" value={d.id} />
                    <button className="min-h-11 shrink-0 text-sm text-white/55 hover:text-white/75">Sign out</button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-white/45">No watch or TV signed in yet.</p>
          )}
        </section>

        <p className="text-sm text-white/45">
          These devices can read your plan and readiness, the watch app can save check-ins, and the TV can save rides. Signing one out here stops it right away.
        </p>
      </div>
    </AthleteShell>
  );
}
