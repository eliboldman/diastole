import { ChevronRight, Play, Timer } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import BackLink from "@/components/layout/BackLink";
import DashboardShell from "@/components/layout/DashboardShell";
import { breathData } from "@/lib/breath/data";
import { calmShift, holdBand, holdTrend, MIN_NIGHTS, nightsEffect, SESSIONS, streak, suggest, type Kind } from "@/lib/breath/plan";
import { createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Breathe · Diastole" };

const ORDER: Kind[] = ["resonance", "downshift", "sigh", "box"];
const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Breathe: a session picked from the athlete's day, their own pace, a CO2 check, and whether it's helping them. */
export default async function BreathePage() {
  const me = await requireUser();
  const supabase = await createClient();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: me.timezone });
  const d = await breathData(supabase, me.id, today, me.timezone);
  const tip = suggest(d.context);
  const info = SESSIONS[tip.kind];
  const effect = nightsEffect(d.sessions, d.nights);
  const calm = calmShift(d.sessions);
  const days = streak(d.sessions.map((s) => s.local_date), today);
  const weekAgo = new Date(Date.parse(`${today}T12:00:00Z`) - 6 * 86_400_000).toISOString().slice(0, 10);
  const thisWeek = d.sessions.filter((s) => s.local_date >= weekAgo && s.kind !== "finder");
  const weekMinutes = Math.round(thisWeek.reduce((a, s) => a + s.seconds, 0) / 60);
  const lastHold = d.holds.at(-1);
  const trend = holdTrend(d.holds);
  const hrRows = d.sessions.filter((s) => s.hr_start != null && s.hr_end != null && s.kind !== "finder");
  const avgDrop = hrRows.length ? Math.round(hrRows.reduce((a, s) => a + (Number(s.hr_start) - Number(s.hr_end)), 0) / hrRows.length) : 0;
  const lastSwing = d.sessions.find((s) => s.kind === "resonance" && s.hr_swing != null)?.hr_swing ?? null;

  const row = (href: string, title: string, sub: string) => (
    <li key={href}>
      <Link href={href} className="flex min-h-16 items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 transition active:scale-[0.99] hover:bg-white/[0.06]">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{title}</span>
          <span className="block truncate text-xs text-white/50">{sub}</span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-white/40" aria-hidden />
      </Link>
    </li>
  );

  return (
    <DashboardShell role={me.role === "coach" ? "coach" : "athlete"}>
      <BackLink href="/recovery" label="Recovery" />
      <h1 className="mt-3 text-4xl font-bold tracking-tight">Breathe</h1>
      <p className="mt-2 text-white/55">A few minutes of slow breathing, picked for your day. General wellness guidance, not medical treatment.</p>

      <section className="mt-6 rounded-[28px] border border-emerald-300/20 bg-gradient-to-br from-emerald-300/[0.10] to-sky-400/[0.04] p-6">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-200/70">For you now</p>
        <h2 className="mt-1 text-2xl font-semibold">{info.title}</h2>
        <p className="mt-2 text-white/70">{tip.why}</p>
        <Link
          href={`/recovery/breathe/${tip.kind}?m=${tip.minutes}`}
          className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-2xl bg-emerald-300 px-6 font-semibold text-emerald-950 active:scale-95"
        >
          <Play size={16} aria-hidden /> {`Start · ${tip.minutes} min`}
        </Link>
      </section>

      {d.pace == null && (
        <section className="mt-4">
          <ul>{row("/recovery/breathe/finder", "Find your pace", "8 minutes, once. Recovery breathing uses 5.5 breaths a minute until you do")}</ul>
        </section>
      )}

      <section className="mt-6">
        <h2 className="mb-2 text-sm uppercase tracking-[0.15em] text-white/50">Sessions</h2>
        <ul className="space-y-2">
          {ORDER.map((k) => (
            <SessionCard key={k} kind={k} note={k === "resonance" ? `Your pace: ${d.effectivePace} breaths a minute${d.pace == null ? " (default)" : ""}.` : null} />
          ))}
          {d.pace != null && <SessionCard kind="finder" note={`Now ${d.pace} breaths a minute. Worth redoing every couple of months.`} />}
        </ul>
      </section>

      <section className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
        <h2 className="text-lg font-semibold">Is it working for you?</h2>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Stat value={String(days)} label={days === 1 ? "day in a row" : "days in a row"} />
          <Stat value={String(thisWeek.length)} label="sessions this week" />
          <Stat value={String(weekMinutes)} label="minutes this week" />
        </div>
        {calm && (
          <p className="mt-4 text-sm text-white/70">
            {calm.change > 0
              ? `You feel calmer after: up ${calm.change} on the 5-point scale on average, over ${calm.n} sessions.`
              : `Across ${calm.n} sessions you haven't felt much calmer after. Try a different session or a longer one.`}
          </p>
        )}
        {hrRows.length >= 2 && (
          <p className="mt-3 text-sm text-white/70">
            {`With a heart-rate sensor (${hrRows.length} sessions), your heart rate settled by ${avgDrop} bpm on average from the first minute to the last`}
            {lastSwing != null ? `, and in your last recovery session it swung ${lastSwing} bpm with each breath` : ""}.
          </p>
        )}
        {effect.ready ? (
          <p className="mt-3 text-sm text-white/70">
            {`On nights after evening breathing, your overnight HRV was ${effect.hrvPct >= 0 ? "+" : ""}${effect.hrvPct}% vs other nights`}
            {effect.rhrDiff != null ? ` and resting heart rate ${effect.rhrDiff > 0 ? "+" : ""}${effect.rhrDiff} bpm` : ""}
            {` (${effect.after} nights vs ${effect.other}). This isn't a controlled test: training, stress and sleep all affect it too.`}
          </p>
        ) : (
          <p className="mt-3 text-sm text-white/55">
            {`Breathe in the evening (from 5pm) and, once your watch has ${MIN_NIGHTS} nights after a session and ${MIN_NIGHTS} without, Diastole compares your overnight HRV and resting heart rate between them. So far: ${effect.after} and ${effect.other}.`}
          </p>
        )}
      </section>

      <section className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
        <div className="flex items-start gap-3">
          <Timer size={20} className="mt-1 shrink-0 text-sky-300" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold">CO₂ check</h2>
            <p className="mt-1 text-sm text-white/60">
              A seated, comfortable breath hold, timed. It roughly shows how relaxed your breathing is and climbs as you practice slow nasal breathing. Track your own trend; don&apos;t compare with others.
            </p>
          </div>
        </div>
        {lastHold && (
          <div className="mt-4 flex items-baseline gap-3">
            <span className="text-3xl font-bold tabular-nums">{`${Number(lastHold.seconds)}s`}</span>
            <span className="text-sm text-white/60">{`${holdBand(Number(lastHold.seconds)).label} · ${fmt(lastHold.taken_on)}`}</span>
          </div>
        )}
        {trend && <p className="mt-1 text-sm text-white/65">{`${trend.change >= 0 ? "Up" : "Down"} ${Math.abs(trend.change)}s since you started (${trend.from}s → ${trend.to}s).`}</p>}
        {d.holds.length > 1 && (
          <p className="mt-2 text-xs text-white/45">{d.holds.slice(-6).map((h) => `${Number(h.seconds)}s`).join(" · ")}</p>
        )}
        <Link href="/recovery/breathe/hold" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] px-5 font-medium active:scale-95">
          {lastHold ? "Check again" : "Take the check"} <ChevronRight size={16} aria-hidden />
        </Link>
      </section>

      <details className="mt-6 rounded-2xl border border-white/[0.08] px-4 py-3 text-sm text-white/60">
        <summary className="cursor-pointer font-medium text-white/75">What this does and doesn&apos;t do</summary>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>Strong evidence: slow breathing around 5–6 a minute raises heart-rate variability while you do it and shifts you toward a recovery state. Cyclic sighing improved mood in a 2023 Stanford trial.</li>
          <li>Likely helpful: settling nerves before racing and falling asleep faster.</li>
          <li>Not claimed here: breath holds don&apos;t replace altitude training, and there&apos;s no good evidence that breathwork alone raises VO₂max. Those come from training.</li>
          <li>Breath holds only sitting down, never in or near water.</li>
        </ul>
      </details>
    </DashboardShell>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.04] px-2 py-3">
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-[11px] leading-tight text-white/50">{label}</p>
    </div>
  );
}

/** One session: what it's for and when, with how it works behind a tap, and a Start button. */
function SessionCard({ kind, note }: { kind: Kind; note: string | null }) {
  const s = SESSIONS[kind];
  return (
    <li className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{s.title}</p>
          <p className="text-xs text-white/50">{`${s.short} · ${s.minutes[0]} min`}</p>
        </div>
        <Link href={`/recovery/breathe/${kind}`} aria-label={`Start ${s.title}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-300 text-emerald-950 active:scale-95">
          <Play size={16} aria-hidden />
        </Link>
      </div>
      <p className="mt-2 text-sm text-white/75">{s.why}</p>
      <p className="mt-2 text-sm text-white/60"><span className="text-white/45">When: </span>{s.when}</p>
      {note && <p className="mt-2 text-sm text-emerald-200/80">{note}</p>}
      <details className="mt-2 text-sm text-white/65">
        <summary className="cursor-pointer text-white/75">How it works</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">{s.how.map((h) => <li key={h}>{h}</li>)}</ol>
        <p className="mt-2">{s.works}</p>
        <p className="mt-2 text-white/50">{s.evidence}</p>
      </details>
    </li>
  );
}
