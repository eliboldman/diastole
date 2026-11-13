import { ensureDemoForNewCoach } from "@/lib/demo/demo-athlete";
import Link from "next/link";

import EmptyState from "@/components/EmptyState";

import { Apple, CalendarRange, Orbit } from "lucide-react";

import DashboardShell from "@/components/layout/DashboardShell";
import QuickLinks from "@/components/layout/QuickLinks";
import { WatchLine } from "@/components/coach/WatchStatus";
import { getWatchStatuses } from "@/lib/devices/status-data";
import { createClient, requireCoach } from "@/lib/supabase/server";

import InviteForm from "./InviteForm";
import DietitianAccess from "./DietitianAccess";
import DietitianRow from "./DietitianRow";
import RemoveAthlete from "./RemoveAthlete";

export default async function AthletesPage() {
  const coach = await requireCoach();
  await ensureDemoForNewCoach(coach.id);
  const supabase = await createClient();

  const [{ data: athletes }, { data: connections }, { data: coachInvites }, { data: dietitians }, { data: dietitianInvites }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, created_at").eq("coach_id", coach.id).eq("is_test", false).order("full_name"),
    supabase.from("device_connections").select("athlete_id, source, last_synced_at"),
    supabase.from("invites").select("id, email, created_at").eq("coach_id", coach.id).eq("role", "coach").order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name, email, created_at, dietitian_all").eq("team_coach_id", coach.id).eq("role", "dietitian").order("full_name"),
    supabase.from("invites").select("id, email, created_at, dietitian_all, dietitian_athletes").eq("coach_id", coach.id).eq("role", "dietitian").is("accepted_at", null).order("created_at", { ascending: false }),
  ]);
  const { data: access } = dietitians?.length
    ? await supabase.from("dietitian_athletes").select("dietitian_id, athlete_id").in("dietitian_id", dietitians.map((d) => d.id))
    : { data: [] };
  const roster = (athletes ?? []).map((a) => ({ id: a.id, name: a.id === coach.id ? `${a.full_name || a.email} (you)` : a.full_name || a.email || "Athlete" }));
  const short = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const deviceFor = (id: string) => connections?.find((c) => c.athlete_id === id);
  const watches = await getWatchStatuses(supabase, (athletes ?? []).map((a) => a.id));

  return (
    <DashboardShell>
      <div className="relative z-10">
        <p className="text-sm uppercase tracking-[0.25em] text-white/50">Roster</p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">Athletes</h1>
        <QuickLinks
          links={[
            { href: "/pods", label: "Pods", icon: <Orbit size={16} aria-hidden /> },
            { href: "/calendar", label: "Calendar", icon: <CalendarRange size={16} aria-hidden /> },
            { href: "/nutrition", label: "Team fueling", icon: <Apple size={16} aria-hidden /> },
          ]}
        />
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-white/55">
          Invite an athlete by email. They&apos;ll get a sign-in link, then connect their Garmin or Apple Watch.
        </p>

        <section className="mt-10 rounded-[28px] border border-white/10 bg-white/[0.06] p-6 backdrop-blur-2xl">
          <h2 className="mb-4 text-lg font-medium">Invite an athlete</h2>
          <InviteForm />
        </section>

        <section className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.06] p-6 backdrop-blur-2xl">
          <h2 className="text-lg font-medium">Invite a coach</h2>
          <p className="mb-4 mt-1 text-sm text-white/55">
            A coach gets their own roster: they invite and plan for their own athletes, and can&apos;t see yours (you can&apos;t see theirs).
          </p>
          <InviteForm role="coach" />
          {!!coachInvites?.length && (
            <ul className="mt-4 divide-y divide-white/[0.08] text-sm">
              {coachInvites.map((i) => (
                <li key={i.id} className="flex flex-wrap justify-between gap-x-4 py-2">
                  <span className="text-white/80">{i.email}</span>
                  <span className="text-white/50">
                    Invited {new Date(i.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.06] p-6 backdrop-blur-2xl">
          <h2 className="text-lg font-medium">Invite a dietitian</h2>
          <p className="mb-4 mt-1 text-sm text-white/55">
            A dietitian joins your team with full access to the athletes you choose: meals, nutrition targets, training, readiness, activities and health data. By default they see every athlete; use “change” under their name to limit them to the athletes you pick. They can set each athlete&apos;s nutrition goals and leave them a note on their Fuel page. Athletes see which dietitians can view their data.
          </p>
          <InviteForm role="dietitian" />
          {(!!dietitians?.length || !!dietitianInvites?.length) && (
            <ul className="mt-4 divide-y divide-white/[0.08] text-sm">
              {(dietitians ?? []).map((d) => (
                <DietitianRow key={d.id} id={d.id} label={d.full_name || d.email || "Dietitian"} sub={`Joined ${short(d.created_at)}`}>
                  <DietitianAccess
                    target={{ dietitian: d.id }}
                    roster={roster}
                    all={d.dietitian_all}
                    picked={(access ?? []).filter((x) => x.dietitian_id === d.id).map((x) => x.athlete_id)}
                  />
                </DietitianRow>
              ))}
              {(dietitianInvites ?? []).map((i) => (
                <DietitianRow key={i.id} id={i.id} label={i.email} sub={`Invited ${short(i.created_at)}`} pending>
                  <DietitianAccess target={{ invite: i.id }} roster={roster} all={i.dietitian_all} picked={(i.dietitian_athletes ?? []) as string[]} />
                </DietitianRow>
              ))}
            </ul>
          )}
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
                  {watches.get(a.id) && <WatchLine status={watches.get(a.id)!} />}
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
