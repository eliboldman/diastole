import type { Metadata } from "next";
import Link from "next/link";

import AthleteShell from "@/components/AthleteShell";
import { RespondToInvite } from "@/components/PodButtons";
import { createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My pods · Diastole" };

export default async function MyPodsPage() {
  const me = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("pod_members")
    .select("pod_id, status, pods(name)")
    .eq("athlete_id", me.id)
    .in("status", ["invited", "active"]);
  const rows = (data ?? []).map((m) => ({ ...m, name: (m.pods as unknown as { name: string } | null)?.name ?? "Pod" }));
  const active = rows.filter((r) => r.status === "active");
  const invites = rows.filter((r) => r.status === "invited");

  return (
    <AthleteShell isCoach={me.role === "coach"}>
      <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">My pods</h1>
      <p className="mt-2 text-sm text-white/55">Your training crews. See how everyone&apos;s recovering, and let them know about it.</p>

      {invites.map((inv) => (
        <section key={inv.pod_id} className="row-in mt-6 rounded-[28px] border border-amber-200/20 bg-amber-200/[0.04] p-6">
          <h2 className="text-lg font-medium">Invited to &ldquo;{inv.name}&rdquo;</h2>
          <p className="mt-1 text-sm text-white/60">Accepting shares your readiness, health trends and recent training with the other members.</p>
          <div className="mt-4">
            <RespondToInvite podId={inv.pod_id} />
          </div>
        </section>
      ))}

      {active.length === 0 && invites.length === 0 ? (
        <p className="mt-8 rounded-[28px] border border-white/10 bg-white/[0.05] p-6 text-white/60">
          You&apos;re not in a pod yet. Your coach sets them up and you&apos;ll see the invite here.
        </p>
      ) : (
        <ul className="stagger mt-6 grid gap-3 sm:grid-cols-2">
          {active.map((p) => (
            <li key={p.pod_id}>
              <Link href={`/me/pods/${p.pod_id}`} className="lift flex min-h-20 items-center justify-between rounded-[24px] border border-white/10 bg-white/[0.05] px-5">
                <span className="text-lg font-medium">{p.name}</span>
                <span className="text-sm text-emerald-200">Open →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AthleteShell>
  );
}
