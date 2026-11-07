import { ChevronLeft, ChevronRight, Flag as RaceFlag } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { FlagBadge } from "@/components/coach/Flags";
import DashboardShell from "@/components/layout/DashboardShell";
import { buildDigest, lastWeekStart } from "@/lib/digest";
import { createClient, requireCoach } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Weekly digest · Diastole" };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const shift = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** The coach's weekly digest: last full week by default, ?week=YYYY-MM-DD (a Monday) for others. */
export default async function DigestPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const coach = await requireCoach();
  const asked = (await searchParams).week;
  const latest = lastWeekStart(coach.timezone);
  const weekStart = asked && DATE.test(asked) && new Date(`${asked}T12:00:00Z`).getUTCDay() === 1 && asked <= latest ? asked : latest;
  const d = await buildDigest(await createClient(), coach.id, weekStart);
  const look = d.athletes.filter((a) => a.attention.length);
  const fine = d.athletes.filter((a) => !a.attention.length);
  const nav = "flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] transition active:scale-95 hover:bg-white/[0.1]";

  const card = (a: (typeof d.athletes)[number]) => (
    <li key={a.id} className="rounded-[24px] border border-white/10 bg-white/[0.05] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={`/athlete/${a.id}`} className="min-w-0 truncate text-lg font-medium hover:underline">
          {a.name}
        </Link>
        {a.latest && <FlagBadge flag={a.latest} />}
      </div>
      {a.attention.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {a.attention.map((t) => (
            <li key={t} className="rounded-xl border border-amber-200/20 bg-amber-200/[0.06] px-3 py-2 text-sm text-amber-50/90">
              {t}
            </li>
          ))}
        </ul>
      )}
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-[11px] uppercase tracking-[0.15em] text-white/45">Planned</dt>
          <dd className="mt-0.5 tabular-nums">{a.planned ? `${a.completed}/${a.planned} done` : "None"}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-[0.15em] text-white/45">Trained</dt>
          <dd className="mt-0.5 tabular-nums">
            {a.hours} h · {a.sessions} sessions
            {a.usualHours !== null && <span className="block text-xs text-white/45">usual {a.usualHours} h</span>}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-[0.15em] text-white/45">Readiness</dt>
          <dd className="mt-0.5 tabular-nums">{a.red || a.yellow ? `${a.red} red · ${a.yellow} yellow` : "No flags"}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-[0.15em] text-white/45">Check-ins</dt>
          <dd className="mt-0.5 tabular-nums">{a.feel !== null || a.rpe !== null ? `${a.feel !== null ? `feel ${a.feel}/5` : ""}${a.feel !== null && a.rpe !== null ? " · " : ""}${a.rpe !== null ? `RPE ${a.rpe}` : ""}` : "None"}</dd>
        </div>
      </dl>
      {a.missed.length > 0 && (
        <p className="mt-3 text-xs text-white/50">Missed: {a.missed.map((m) => `${m.title} (${fmt(m.date)})`).join(", ")}</p>
      )}
      {a.race && (
        <p className="mt-2 flex items-center gap-2 text-xs text-emerald-100/80">
          <RaceFlag size={13} aria-hidden /> {a.race.name} in {a.race.days} days ({fmt(a.race.date)})
        </p>
      )}
    </li>
  );

  return (
    <DashboardShell>
      <p className="text-sm uppercase tracking-[0.25em] text-white/50">Weekly digest</p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {fmt(d.weekStart)} – {fmt(d.weekEnd)}
        </h1>
        <div className="flex gap-2">
          <Link href={`/digest?week=${shift(weekStart, -7)}`} className={nav} aria-label="Previous week">
            <ChevronLeft size={18} />
          </Link>
          {weekStart < latest ? (
            <Link href={`/digest?week=${shift(weekStart, 7)}`} className={nav} aria-label="Next week">
              <ChevronRight size={18} />
            </Link>
          ) : (
            <span className={`${nav} opacity-30`} aria-hidden>
              <ChevronRight size={18} />
            </span>
          )}
        </div>
      </div>

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Planned done", d.team.planned ? `${d.team.completed}/${d.team.planned}` : "—"],
          ["Hours", String(d.team.hours)],
          ["Sessions", String(d.team.sessions)],
          ["To look at", String(look.length)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-white/10 bg-white/[0.055] p-4">
            <p className="text-xs uppercase tracking-[0.15em] text-white/45">{k}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{v}</p>
          </div>
        ))}
      </section>

      {look.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-medium">Worth a look</h2>
          <ul className="grid gap-3 lg:grid-cols-2">{look.map(card)}</ul>
        </section>
      )}
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-medium">{look.length ? "Everyone else" : "Everyone"}</h2>
        {fine.length ? <ul className="grid gap-3 lg:grid-cols-2">{fine.map(card)}</ul> : <p className="text-sm text-white/55">No athletes yet.</p>}
      </section>
      <p className="mt-8 text-xs text-white/45">Built from synced workouts, plans, readiness and check-ins. A workout counts as done when it&apos;s linked to the plan or the same sport was trained that day.</p>
    </DashboardShell>
  );
}
