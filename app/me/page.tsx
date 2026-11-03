import type { Metadata } from "next";
import Link from "next/link";

import SyncedAgo from "@/components/SyncedAgo";

import AthleteShell from "@/components/AthleteShell";
import { FlagBadge, FlagRow } from "@/components/coach/Flags";
import { RespondToInvite } from "@/components/PodButtons";
import type { Flag } from "@/lib/readiness/engine";
import { createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My Diastole" };

const SHARED_WITH_POD = [
  "Your daily readiness flag and note",
  "HRV, resting heart rate, sleep and stress (last 14 days)",
  "Your recent activities (sport, date, duration, distance, heart rate)",
];

export default async function MePage() {
  const me = await requireUser();
  const supabase = await createClient();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: me.timezone });

  const [{ data: readiness }, { data: workouts }, { data: device }, { data: memberships }] = await Promise.all([
    supabase.from("readiness_scores").select("date, overall, recovery, sleep, stress, load, note").eq("athlete_id", me.id).order("date", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("planned_workouts").select("id, scheduled_date, title, sport, status").eq("athlete_id", me.id).is("deleted_at", null).gte("scheduled_date", today).neq("status", "draft").order("scheduled_date").limit(7),
    supabase.from("device_connections").select("source, last_synced_at").eq("athlete_id", me.id).maybeSingle(),
    supabase.from("pod_members").select("pod_id, status, pods(name)").eq("athlete_id", me.id).in("status", ["invited", "active"]),
  ]);

  const invites = (memberships ?? []).filter((m) => m.status === "invited");
  const pods = (memberships ?? []).filter((m) => m.status === "active");
  const podName = (m: (typeof invites)[number]) => (m.pods as unknown as { name: string } | null)?.name ?? "Pod";
  const firstName = me.full_name?.split(" ")[0];

  return (
    <AthleteShell isCoach={me.role === "coach"}>
      <p className="text-xs uppercase tracking-[0.3em] text-emerald-200/60">{firstName ? `Hi, ${firstName}` : "Welcome"}</p>
      <h1 className="mt-3 text-3xl font-medium tracking-tight sm:text-4xl">Today</h1>

      {invites.map((inv) => (
        <section key={inv.pod_id} className="mt-6 rounded-[28px] border border-amber-200/20 bg-amber-200/[0.04] p-6">
          <h2 className="text-lg font-medium">Your coach invited you to the &ldquo;{podName(inv)}&rdquo; pod</h2>
          <p className="mt-2 text-sm text-white/60">If you accept, the other members who have also accepted will see:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-white/70">
            {SHARED_WITH_POD.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-white/60">You&apos;ll see theirs too. Your email isn&apos;t shared. You can leave anytime.</p>
          <div className="mt-4">
            <RespondToInvite podId={inv.pod_id} />
          </div>
        </section>
      ))}

      {!device && (
        <section className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.06] p-6">
          <p className="text-white/70">Connect your watch so your coach can see how you&apos;re recovering.</p>
          <Link href="/connect" className="mt-3 inline-flex min-h-11 items-center rounded-2xl border border-emerald-300/25 bg-emerald-300/15 px-5 font-medium text-emerald-50 active:scale-95">
            Connect Garmin or Apple Watch →
          </Link>
        </section>
      )}

      <section className="row-in mt-6 rounded-[28px] border border-white/10 bg-white/[0.05] p-6 backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FlagBadge flag={(readiness?.overall as Flag) ?? "unknown"} large />
          {device && (
            <span className="text-xs text-white/55">
              {device.source === "garmin" ? "Garmin" : "Apple Watch"} · <SyncedAgo at={device.last_synced_at} />
            </span>
          )}
        </div>
        <p className="mt-3 text-white/70">{readiness?.note ?? "Waiting for your first data."}</p>
        {readiness && (
          <div className="mt-4 max-w-md">
            <FlagRow flags={readiness as Record<"recovery" | "sleep" | "stress" | "load", Flag>} />
          </div>
        )}
      </section>

      <section className="row-in mt-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-6" style={{ animationDelay: "80ms" }}>
        <h2 className="text-lg font-medium">Coming up</h2>
        {!workouts?.length ? (
          <p className="mt-2 text-sm text-white/55">No workouts scheduled.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {workouts.map((w) => (
              <li key={w.id} className="flex justify-between gap-3 border-t border-white/[0.09] pt-2">
                <span>
                  <span className="text-white/50">
                    {new Date(`${w.scheduled_date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  </span>{" "}
                  {w.title}
                </span>
                <span className="text-xs uppercase tracking-wider text-white/55">{w.sport}</span>
              </li>
            ))}
          </ul>
        )}
        {device?.source === "garmin" && workouts?.length ? (
          <p className="mt-3 text-xs text-white/50">These are on your Garmin calendar after your watch syncs.</p>
        ) : null}
      </section>

      {pods.length > 0 && (
        <section className="row-in mt-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-6" style={{ animationDelay: "80ms" }}>
          <h2 className="text-lg font-medium">My pods</h2>
          <ul className="mt-3 space-y-2">
            {pods.map((p) => (
              <li key={p.pod_id}>
                <Link href={`/me/pods/${p.pod_id}`} className="flex min-h-12 items-center justify-between rounded-xl px-2 transition active:scale-[0.99] hover:bg-white/[0.06]">
                  <span>{podName(p)}</span>
                  <span className="text-sm text-emerald-200">Open →</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-10 text-xs text-white/45">Readiness compares you to your own last 28 days. Training guidance, not medical advice.</p>
    </AthleteShell>
  );
}
