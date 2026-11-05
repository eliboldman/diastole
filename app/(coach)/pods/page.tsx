import type { Metadata } from "next";
import Link from "next/link";

import EmptyState from "@/components/EmptyState";

import DashboardShell from "@/components/layout/DashboardShell";
import { DeletePod, InviteToPod, NewPodForm, RemoveMember } from "@/components/PodButtons";
import { createClient, requireCoach } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Pods · Diastole" };

const STATUS: Record<string, string> = {
  active: "text-emerald-200",
  invited: "text-amber-200/80",
  declined: "text-white/50",
  left: "text-white/50",
};

export default async function PodsPage() {
  const coach = await requireCoach();
  const supabase = await createClient();

  const [{ data: pods }, { data: roster }] = await Promise.all([
    supabase.from("pods").select("id, name, pod_members(athlete_id, status)").eq("coach_id", coach.id).order("created_at"),
    supabase.from("profiles").select("id, full_name, email").eq("coach_id", coach.id).order("full_name"),
  ]);
  const nameOf = (id: string) => {
    const p = roster?.find((r) => r.id === id);
    return p?.full_name || p?.email || "Athlete";
  };

  return (
    <DashboardShell>
      <p className="text-sm uppercase tracking-[0.25em] text-white/50">Groups</p>
      <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">Pods</h1>
      <p className="mt-4 max-w-2xl text-white/55">
        Athletes in a pod see each other&apos;s readiness, health numbers and training, but only after each one accepts the
        invite. Anyone can leave at any time.
      </p>

      <section className="mt-8 rounded-[28px] border border-white/10 bg-white/[0.06] p-6 backdrop-blur-2xl">
        <h2 className="mb-4 text-lg font-medium">New pod</h2>
        <NewPodForm />
      </section>

      <div className="mt-6 grid gap-4">
        {!pods?.length && (
          <EmptyState emoji="🫶" title="No pods yet">
            Name one above, then invite athletes. Pods share a feed, props and a group chat; each athlete chooses what else they share.
          </EmptyState>
        )}
        {(pods ?? []).map((pod) => {
          const members = pod.pod_members ?? [];
          const inPod = new Set(members.filter((m) => m.status === "active" || m.status === "invited").map((m) => m.athlete_id));
          const candidates = (roster ?? []).filter((r) => !inPod.has(r.id)).map((r) => ({ id: r.id, name: nameOf(r.id) }));
          const active = members.filter((m) => m.status === "active").length;
          return (
            <section key={pod.id} className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 backdrop-blur-xl">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-semibold">{pod.name}</h2>
                <div className="flex items-center gap-4">
                  {active > 0 && (
                    <Link href={`/pods/${pod.id}`} className="text-sm text-emerald-200 hover:underline">
                      View pod feed →
                    </Link>
                  )}
                  <DeletePod podId={pod.id} name={pod.name} />
                </div>
              </div>

              {members.length > 0 && (
                <ul className="mt-4 divide-y divide-white/[0.06] text-sm">
                  {members.map((m) => (
                    <li key={m.athlete_id} className="flex items-center justify-between gap-3 py-2">
                      <span>{nameOf(m.athlete_id)}</span>
                      <span className="flex items-center gap-4">
                        <span className={`text-xs uppercase tracking-wider ${STATUS[m.status]}`}>
                          {m.status === "invited" ? "invite pending" : m.status}
                        </span>
                        <RemoveMember podId={pod.id} athleteId={m.athlete_id} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-4 border-t border-white/[0.09] pt-4">
                <p className="mb-2 text-xs uppercase tracking-[0.15em] text-white/50">Invite athletes</p>
                <InviteToPod podId={pod.id} candidates={candidates} />
              </div>
            </section>
          );
        })}
      </div>
    </DashboardShell>
  );
}
